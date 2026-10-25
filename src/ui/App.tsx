import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Discovery,
  Format,
  Selection,
  Settings as Preferences,
  Transcript,
} from "../model/types.ts";
import { errorText, VextraError, captionWarningText } from "../model/errors.ts";
import { discover, extract, chooseTrack } from "../source/youtube/index.ts";
import { batchInput } from "../source/youtube/urls.ts";
import {
  activeVideo,
  downloadBlob,
  openExpanded,
} from "../browser/platform.ts";
import { compute } from "../browser/compute.ts";
import { saveSettings, validatedSettings } from "../persistence/settings.ts";
import {
  cancelBatch,
  cleanup,
  commit,
  getDocument,
  latestBatch,
  latestDocument,
  type Batch,
} from "../persistence/database.ts";
import { runBatch, withRunner } from "../batch/runner.ts";
import { filename, mime } from "../export/formats.ts";
import { presetOptions } from "../documents/markdown.ts";
import { parseTime, resolveSelection, time } from "../processing/text.ts";
import { Settings } from "./Settings.tsx";
import { Reader } from "./Reader.tsx";
import { Preview } from "./Preview.tsx";

export function App({ initialSettings }: { initialSettings: Preferences }) {
  const [settings, setSettings] = useState(initialSettings),
    [settingsOpen, setSettingsOpen] = useState(
      location.pathname.endsWith("settings.html"),
    );
  const [mode, setMode] = useState<"current" | "url" | "batch">("current"),
    [input, setInput] = useState(""),
    [active, setActive] = useState<{
      sourceUrl: string;
      videoId: string;
      tabId: number;
    }>();
  const [discovery, setDiscovery] = useState<Discovery>(),
    [trackId, setTrackId] = useState(""),
    [doc, setDoc] = useState<Transcript>();
  const [status, setStatus] = useState(
      "Open a YouTube video or paste a link to begin.",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<Batch>(),
    [batchInputText, setBatchInputText] = useState(""),
    [removed, setRemoved] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<Selection["kind"]>("all"),
    [start, setStart] = useState("00:00"),
    [end, setEnd] = useState("00:00"),
    [chapterIds, setChapterIds] = useState<string[]>([]),
    [passages, setPassages] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false),
    [preview, setPreview] = useState(""),
    [previewError, setPreviewError] = useState(""),
    [copyFallback, setCopyFallback] = useState("");
  const controller = useRef<AbortController | undefined>(undefined),
    generation = useRef(0),
    sourceGeneration = useRef(0),
    workspaceEpoch = useRef(0),
    discoveryTab = useRef<number | undefined>(undefined);
  const updateSettings = useCallback((s: Preferences) => {
    setSettings(s);
    void saveSettings(s).catch((e) => setError(errorText(e)));
  }, []);
  const refreshActive = useCallback(async () => {
    try {
      const v = await activeVideo();
      setActive(v);
    } catch {
      setActive(undefined);
    }
  }, []);
  useEffect(() => {
    void refreshActive();
    void (async () => {
      await cleanup();
      const savedBatch = await latestBatch();
      if (generation.current === 0) setBatch(savedBatch);
      const savedDoc = await latestDocument();
      if (savedDoc && generation.current === 0) setDoc(savedDoc);
    })().catch((e) => setError(errorText(e)));
    const tabsChanged = () => {
      void refreshActive();
    };
    const storageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (changes.settings)
        setSettings(validatedSettings(changes.settings.newValue));
    };
    const navigated = (m: unknown) => {
      if (
        m &&
        typeof m === "object" &&
        "type" in m &&
        m.type === "VIDEO_NAVIGATED"
      )
        tabsChanged();
    };
    chrome.tabs.onActivated.addListener(tabsChanged);
    chrome.tabs.onUpdated.addListener(tabsChanged);
    chrome.runtime.onMessage.addListener(navigated);
    chrome.storage.onChanged.addListener(storageChanged);
    const channel = new BroadcastChannel("vextra-data");
    channel.onmessage = (event: MessageEvent<{ cleared?: boolean }>) => {
      if (event.data?.cleared) {
        workspaceEpoch.current++;
        generation.current++;
        controller.current?.abort();
        setDoc(undefined);
        setBatch(undefined);
        setBusy(false);
        setCopyFallback("");
      } else {
        void latestBatch()
          .then(setBatch)
          .catch((e) => setError(errorText(e)));
      }
    };
    return () => {
      workspaceEpoch.current++;
      channel.close();
      controller.current?.abort();
      chrome.tabs.onActivated.removeListener(tabsChanged);
      chrome.tabs.onUpdated.removeListener(tabsChanged);
      chrome.runtime.onMessage.removeListener(navigated);
      chrome.storage.onChanged.removeListener(storageChanged);
    };
  }, [refreshActive]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : settings.theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);
  useEffect(() => {
    sourceGeneration.current++;
    setDiscovery(undefined);
    setTrackId("");
  }, [input, active?.videoId, mode]);
  useEffect(() => {
    if (doc) {
      setSelectionMode("all");
      setPassages([]);
      setChapterIds([]);
      setStart("00:00");
      setEnd(
        time(
          doc.durationMs ??
            doc.segments.at(-1)!.startMs + doc.segments.at(-1)!.durationMs,
          true,
        ),
      );
    }
  }, [doc]);
  const sourceUrl = mode === "current" ? active?.sourceUrl : input;
  const sourceTab = mode === "current" ? active?.tabId : undefined;
  const operation = async (
    work: (signal: AbortSignal, token: number) => Promise<void>,
  ) => {
    controller.current?.abort();
    const abort = new AbortController(),
      token = ++generation.current;
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      await work(
        AbortSignal.any([abort.signal, AbortSignal.timeout(90_000)]),
        token,
      );
    } catch (e) {
      if (token === generation.current) {
        setError(errorText(e));
        setStatus(
          abort.signal.aborted
            ? "Cancelled. Existing results are preserved."
            : "Operation did not complete.",
        );
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  const inspectSource = () => {
    void operation(async (signal, token) => {
      if (!sourceUrl) throw new VextraError("UNSUPPORTED_PAGE");
      const sourceToken = sourceGeneration.current;
      await withRunner(signal, async (_lease, ownedSignal) => {
        setStatus("Discovering video and caption languages…");
        const fresh = mode === "current" ? await activeVideo() : undefined;
        const d = await discover(
          fresh?.sourceUrl ?? sourceUrl,
          ownedSignal,
          fresh?.tabId ?? sourceTab,
        );
        ownedSignal.throwIfAborted();
        if (
          sourceToken !== sourceGeneration.current ||
          token !== generation.current
        )
          return;
        setDiscovery(d);
        discoveryTab.current = fresh?.tabId ?? sourceTab;
        setTrackId(chooseTrack(d, settings).id);
        setStatus("Caption languages found. Choose a track, then extract.");
      });
    });
  };
  const extractSource = () => {
    void operation(async (signal, token) => {
      if (!discovery || !trackId) return;
      const sourceToken = sourceGeneration.current;
      await withRunner(signal, async (lease, ownedSignal) => {
        if (mode === "current") {
          const current = await activeVideo();
          if (current.videoId !== discovery.videoId)
            throw new VextraError("UNSUPPORTED_PAGE");
        }
        setStatus("Retrieving captions…");
        const result = await extract(
          discovery,
          trackId,
          ownedSignal,
          discoveryTab.current,
        );
        ownedSignal.throwIfAborted();
        if (
          sourceToken !== sourceGeneration.current ||
          token !== generation.current
        )
          return;
        setStatus("Processing transcript…");
        await commit(lease, undefined, result, settings.retain);
        if (token !== generation.current) return;
        setDoc(result);
        setStatus(
          `Extracted ${result.segments.length.toLocaleString()} caption cues in ${result.language}.`,
        );
      });
    });
  };
  const cancel = () => {
    controller.current?.abort();
    if (batch && mode === "batch")
      void cancelBatch(batch.id)
        .then(() => latestBatch())
        .then(setBatch)
        .catch((e) => setError(errorText(e)));
  };
  const batchValidation = useMemo(() => {
    try {
      return { ...batchInput(batchInputText), error: "" };
    } catch (e) {
      return { videos: [], duplicates: 0, invalid: [], error: errorText(e) };
    }
  }, [batchInputText]);
  const accepted = batchValidation.videos.filter(
    (v) => !removed.includes(v.videoId),
  );
  const beginBatch = (resume = false) => {
    const next: Batch =
      resume && batch
        ? batch
        : {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            cancelled: false,
            items: accepted.map((v) => ({
              ...v,
              status: "pending",
              attempts: 0,
            })),
          };
    if (!next.items.length) {
      setError("Add at least one valid video URL.");
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const token = ++generation.current;
    setBusy(true);
    setError("");
    setBatch(next);
    setStatus("Batch running. Keep this panel or a Vextra tab open.");
    void runBatch(next, settings, abort.signal, (b) => {
      if (token === generation.current) setBatch(b);
    })
      .then(() => {
        if (token === generation.current)
          setStatus(
            "Batch processing finished. Review individual results below.",
          );
      })
      .catch((e) => {
        if (token === generation.current) setError(errorText(e));
      })
      .finally(() => {
        if (token === generation.current) setBusy(false);
      });
  };
  const selectionInfo = useMemo((): {
    selection?: Selection;
    error?: string;
    summary?: string;
  } => {
    if (!doc) return {};
    try {
      const selection: Selection =
        selectionMode === "range"
          ? { kind: "range", startMs: parseTime(start), endMs: parseTime(end) }
          : selectionMode === "chapters"
            ? { kind: "chapters", chapterIds }
            : selectionMode === "passages"
              ? { kind: "passages", segmentIds: passages }
              : { kind: "all" };
      const cues = resolveSelection(doc, selection);
      return {
        selection,
        summary: `${cues.length.toLocaleString()} cues · ${time(cues[0]!.startMs)}–${time(cues.at(-1)!.startMs + cues.at(-1)!.durationMs)}`,
      };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [doc, selectionMode, start, end, chapterIds, passages]);
  useEffect(() => {
    setPreview("");
    setPreviewError("");
    if (!previewOpen || !doc || !selectionInfo.selection) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void compute<string>(
        {
          type: "export",
          doc,
          selection: selectionInfo.selection!,
          settings,
          format: "md",
        },
        abort.signal,
      )
        .then(setPreview)
        .catch((e) => {
          if (!abort.signal.aborted) setPreviewError(errorText(e));
        });
    }, 80);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [doc, settings, selectionInfo.selection, previewOpen]);
  const exportDocument = async (format: Format, copy = false) => {
    if (!doc || !selectionInfo.selection) return;
    const epoch = workspaceEpoch.current;
    setError("");
    setStatus("Preparing document…");
    try {
      const output = await compute<string>({
        type: "export",
        doc,
        selection: selectionInfo.selection,
        settings,
        format,
      });
      if (epoch !== workspaceEpoch.current) return;
      if (copy) {
        try {
          await navigator.clipboard.writeText(output);
          setStatus("Document copied.");
        } catch {
          if (epoch !== workspaceEpoch.current) return;
          setCopyFallback(output);
          setStatus(
            "Clipboard unavailable. Select and copy the document below.",
          );
        }
      } else {
        await downloadBlob(
          new Blob([output], { type: `${mime[format]};charset=utf-8` }),
          filename(doc, format, settings.filename),
        );
        setStatus("Document download completed.");
      }
    } catch (e) {
      setError(errorText(e));
    }
  };
  const batchExport = async (kind: "zip" | "combined") => {
    if (!batch) return;
    const epoch = workspaceEpoch.current;
    setError("");
    setStatus("Preparing batch export…");
    try {
      const docs = (
        await Promise.all(
          batch.items
            .filter((i) => i.status === "completed" && i.documentId)
            .map((i) => getDocument(i.documentId!)),
        )
      ).filter((d): d is Transcript => Boolean(d));
      if (epoch !== workspaceEpoch.current) return;
      if (!docs.length) throw new VextraError("EMPTY_TRANSCRIPT");
      if (kind === "zip") {
        const bytes = await compute<Uint8Array>({
          type: "zip",
          docs,
          settings,
          format: settings.format,
          statuses: batch.items,
        });
        if (epoch !== workspaceEpoch.current) return;
        await downloadBlob(
          new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
          "Vextra-batch.zip",
        );
      } else {
        const output = await compute<string>({
          type: "combined",
          docs,
          settings,
          total: batch.items.length,
        });
        if (epoch !== workspaceEpoch.current) return;
        await downloadBlob(
          new Blob([output], { type: "text/markdown;charset=utf-8" }),
          "Vextra-batch.md",
        );
      }
      setStatus(`${docs.length} of ${batch.items.length} videos exported.`);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const clearWorkspace = () => {
    workspaceEpoch.current++;
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setDoc(undefined);
    setBatch(undefined);
    setPreview("");
    setCopyFallback("");
    setStatus("Temporary transcripts and batches cleared.");
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo" aria-hidden="true">
            V
          </span>
          <div>
            <h1>
              Vextra<span className="brand-dot">.</span>
            </h1>
            <span className="tagline">Your videos, in words.</span>
          </div>
        </div>
        <div className="row">
          <button
            aria-label="Change theme"
            title={`Theme: ${settings.theme}`}
            onClick={() =>
              updateSettings({
                ...settings,
                theme:
                  settings.theme === "system"
                    ? "light"
                    : settings.theme === "light"
                      ? "dark"
                      : "system",
              })
            }
          >
            {settings.theme === "dark"
              ? "☾"
              : settings.theme === "light"
                ? "☀"
                : "◐"}
          </button>
          <button
            aria-label="Open in tab"
            onClick={() => {
              void openExpanded().catch((e) => setError(errorText(e)));
            }}
          >
            ↗
          </button>
          <button
            aria-label={settingsOpen ? "Back to workspace" : "Settings"}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            {settingsOpen ? "Back" : "⚙"}
          </button>
        </div>
      </header>
      <div className="notices">
        <p className="status" role="status" aria-live="polite">
          {status}
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
            <button className="text-button" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}
      </div>
      {settingsOpen ? (
        <Settings
          value={settings}
          change={updateSettings}
          onClear={clearWorkspace}
        />
      ) : (
        <main>
          <nav className="segments" aria-label="Video source">
            {(
              [
                ["current", "Current Video"],
                ["url", "From URL"],
                ["batch", "Batch URLs"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                disabled={busy}
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          {mode !== "batch" ? (
            <section className="card source">
              <div className="eyebrow">01 / SOURCE</div>
              {mode === "current" ? (
                <>
                  <h2>
                    {active
                      ? "YouTube video detected"
                      : "Choose a YouTube video"}
                  </h2>
                  <p className="hint">
                    {active
                      ? active.sourceUrl
                      : "Open a video in this browser window, or choose From URL."}
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      void refreshActive();
                    }}
                  >
                    Refresh current video
                  </button>
                </>
              ) : (
                <label>
                  YouTube video URL
                  <input
                    type="url"
                    value={input}
                    disabled={busy}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                </label>
              )}
              <div className="row wrap action-row">
                <button
                  className="primary"
                  disabled={busy || !sourceUrl}
                  onClick={inspectSource}
                >
                  {discovery ? "Refresh languages" : "Find caption languages"}
                </button>
                {busy && <button onClick={cancel}>Cancel</button>}
              </div>
              {discovery && (
                <>
                  <div className="video-info">
                    {discovery.thumbnailUrl && (
                      <img
                        alt=""
                        src={discovery.thumbnailUrl}
                        onError={(e) => {
                          e.currentTarget.hidden = true;
                        }}
                      />
                    )}
                    <div>
                      <h2 dir="auto">
                        {discovery.title ?? "Title unavailable"}
                      </h2>
                      {discovery.channel && <p>{discovery.channel}</p>}
                      <p className="hint">
                        {discovery.durationMs !== undefined &&
                          time(discovery.durationMs)}{" "}
                        · {discovery.tracks.length} caption tracks
                      </p>
                    </div>
                  </div>
                  <label>
                    Caption language
                    <select
                      disabled={busy}
                      value={trackId}
                      onChange={(e) => {
                        setTrackId(e.target.value);
                        const t = discovery.tracks.find(
                          (t) => t.id === e.target.value,
                        );
                        if (t)
                          updateSettings({
                            ...settings,
                            language: t.languageCode,
                          });
                      }}
                    >
                      {discovery.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.displayName} ·{" "}
                          {t.captionType === "manual"
                            ? "Creator provided"
                            : t.captionType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary full"
                    disabled={busy}
                    onClick={extractSource}
                  >
                    Extract Transcript
                  </button>
                </>
              )}
            </section>
          ) : (
            <section className="card">
              <div className="eyebrow">01 / BATCH</div>
              <h2>Batch transcripts</h2>
              <label>
                YouTube URLs
                <textarea
                  rows={5}
                  value={batchInputText}
                  disabled={busy}
                  onChange={(e) => {
                    setBatchInputText(e.target.value);
                    setRemoved([]);
                  }}
                  placeholder="One URL per line, or paste several links"
                />
              </label>
              <p className="hint">
                {accepted.length} unique videos · {batchValidation.duplicates}{" "}
                duplicates removed · {batchValidation.invalid.length} invalid
              </p>
              {batchValidation.error && (
                <p className="error">{batchValidation.error}</p>
              )}
              {batchValidation.invalid.map((v, i) => (
                <p className="hint" key={i}>
                  Unrecognised URL: {v}
                </p>
              ))}
              <ul className="queue-input">
                {accepted.map((v) => (
                  <li key={v.videoId}>
                    <span>{v.videoId}</span>
                    <button
                      disabled={busy}
                      aria-label={`Remove ${v.videoId}`}
                      onClick={() => setRemoved([...removed, v.videoId])}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="primary"
                disabled={
                  busy || !accepted.length || Boolean(batchValidation.error)
                }
                onClick={() => beginBatch()}
              >
                Extract batch
              </button>
              {batch && (
                <>
                  <div className="section-title">
                    <h3>
                      {
                        batch.items.filter((i) => i.status === "completed")
                          .length
                      }{" "}
                      / {batch.items.length} completed
                    </h3>
                  </div>
                  <p className="hint">
                    Keep this panel or a Vextra tab open. Recovery expires 7
                    days after this batch was created.
                  </p>
                  <div className="row wrap">
                    {busy ? (
                      <button onClick={cancel}>Cancel batch</button>
                    ) : (
                      <button
                        disabled={batch.items.every(
                          (i) => i.status === "completed",
                        )}
                        onClick={() => beginBatch(true)}
                      >
                        Resume / retry unsuccessful
                      </button>
                    )}
                    <button
                      onClick={() => {
                        void latestBatch()
                          .then(setBatch)
                          .catch((e) => setError(errorText(e)));
                      }}
                    >
                      Refresh saved progress
                    </button>
                    <button
                      onClick={() => {
                        void openExpanded().catch((e) =>
                          setError(errorText(e)),
                        );
                      }}
                    >
                      Continue in tab
                    </button>
                  </div>
                  <ul className="batch-results">
                    {batch.items.map((item) => (
                      <li key={item.videoId}>
                        <div className="row">
                          <strong className="grow">{item.videoId}</strong>
                          <span className={`badge ${item.status}`}>
                            {item.interrupted
                              ? "Interrupted · resume available"
                              : item.status.replaceAll("-", " ")}
                          </span>
                        </div>
                        {item.language && (
                          <span className="hint">
                            Language: {item.language}
                          </span>
                        )}
                        {item.error && <p className="hint">{item.error}</p>}
                        {item.documentId && (
                          <div className="row">
                            <button
                              onClick={() => {
                                const epoch = workspaceEpoch.current;
                                void getDocument(item.documentId!)
                                  .then((d) => {
                                    if (epoch !== workspaceEpoch.current)
                                      return;
                                    if (d) {
                                      setDoc(d);
                                      setStatus(
                                        "Completed batch transcript opened.",
                                      );
                                    } else
                                      setError(
                                        "This temporary transcript has expired.",
                                      );
                                  })
                                  .catch((e) => setError(errorText(e)));
                              }}
                            >
                              Read & export
                            </button>
                            <button
                              onClick={() => {
                                const epoch = workspaceEpoch.current;
                                void getDocument(item.documentId!)
                                  .then(async (d) => {
                                    if (epoch !== workspaceEpoch.current)
                                      return;
                                    if (!d)
                                      throw new VextraError("EMPTY_TRANSCRIPT");
                                    const text = await compute<string>({
                                      type: "export",
                                      doc: d,
                                      settings,
                                      selection: { kind: "all" },
                                      format: settings.format,
                                    });
                                    if (epoch !== workspaceEpoch.current)
                                      return;
                                    await downloadBlob(
                                      new Blob([text], {
                                        type: mime[settings.format],
                                      }),
                                      filename(
                                        d,
                                        settings.format,
                                        settings.filename,
                                      ),
                                    );
                                  })
                                  .catch((e) => setError(errorText(e)));
                              }}
                            >
                              Download .{settings.format}
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="row wrap">
                    <button
                      disabled={
                        !batch.items.some((i) => i.status === "completed")
                      }
                      onClick={() => {
                        void batchExport("zip");
                      }}
                    >
                      Download ZIP
                    </button>
                    <button
                      disabled={
                        !batch.items.some((i) => i.status === "completed")
                      }
                      onClick={() => {
                        void batchExport("combined");
                      }}
                    >
                      Combined Markdown
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {doc && (
            <>
              <section className="card document">
                <div className="eyebrow">02 / TRANSCRIPT</div>
                <h2 dir="auto">{doc.title ?? "Transcript"}</h2>
                <p className="hint">
                  {doc.language === "und"
                    ? "Language not identified"
                    : doc.language}{" "}
                  · {doc.captionType} · {doc.segments.length.toLocaleString()}{" "}
                  cues
                </p>
                {doc.warnings.length > 0 && (
                  <details>
                    <summary>Caption timing and formatting notes</summary>
                    <ul>
                      {doc.warnings.map((w) => (
                        <li key={w}>{captionWarningText(w)}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <Reader
                  doc={doc}
                  settings={settings}
                  update={updateSettings}
                  passages={passages}
                  setPassages={setPassages}
                  passageMode={selectionMode === "passages"}
                />
              </section>
              <section className="card export-options">
                <div className="eyebrow">03 / DOCUMENT</div>
                <h2>Export options</h2>
                <label>
                  Export selection
                  <select
                    value={selectionMode}
                    onChange={(e) =>
                      setSelectionMode(e.target.value as Selection["kind"])
                    }
                  >
                    <option value="all">Full transcript</option>
                    <option value="range">Time range</option>
                    <option disabled={!doc.chapters.length} value="chapters">
                      Selected chapters
                    </option>
                    <option value="passages">Selected passages</option>
                  </select>
                </label>
                {selectionMode === "range" && (
                  <>
                    <div className="row">
                      <label>
                        From
                        <input
                          value={start}
                          onChange={(e) => setStart(e.target.value)}
                          placeholder="00:00"
                        />
                      </label>
                      <label>
                        Until
                        <input
                          value={end}
                          onChange={(e) => setEnd(e.target.value)}
                          placeholder="10:00"
                        />
                      </label>
                    </div>
                    <p className="hint">
                      Includes whole cues starting at or after From and before
                      Until. Original absolute timing is preserved.
                    </p>
                  </>
                )}
                {selectionMode === "chapters" &&
                  doc.chapters.map((c) => (
                    <label className="check" key={c.id}>
                      <input
                        type="checkbox"
                        checked={chapterIds.includes(c.id)}
                        onChange={(e) =>
                          setChapterIds(
                            e.target.checked
                              ? [...chapterIds, c.id]
                              : chapterIds.filter((id) => id !== c.id),
                          )
                        }
                      />
                      {time(c.startMs)} · {c.title}
                    </label>
                  ))}
                {selectionMode === "passages" && (
                  <p className="hint">
                    Select passage checkboxes in the transcript above. Clean
                    Reading selects every original cue in that paragraph.
                  </p>
                )}
                <p className={selectionInfo.error ? "error" : "hint"}>
                  {selectionInfo.error ?? selectionInfo.summary}
                </p>
                <label>
                  Markdown preset
                  <select
                    value={settings.preset}
                    onChange={(e) =>
                      updateSettings({
                        ...settings,
                        ...presetOptions(
                          e.target.value as Preferences["preset"],
                        ),
                      })
                    }
                  >
                    <option value="clean">Clean Reading</option>
                    <option value="research">Research</option>
                    <option value="archive">Archive</option>
                  </select>
                </label>
                <label>
                  Document template
                  <select
                    value={settings.templateId}
                    onChange={(e) =>
                      updateSettings({
                        ...settings,
                        templateId: e.target.value,
                      })
                    }
                  >
                    <option value="">Built-in preset</option>
                    {settings.templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row wrap">
                  {(["metadata", "timestamps", "links"] as const).map((key) => (
                    <label key={key} className="check">
                      <input
                        type="checkbox"
                        checked={settings[key]}
                        onChange={(e) =>
                          updateSettings({
                            ...settings,
                            [key]: e.target.checked,
                          })
                        }
                      />
                      {key === "links"
                        ? "Source links"
                        : key[0]!.toUpperCase() + key.slice(1)}
                    </label>
                  ))}
                </div>
                <button
                  className="full"
                  onClick={() => setPreviewOpen(!previewOpen)}
                >
                  {previewOpen
                    ? "Hide document preview"
                    : "Preview Markdown document"}
                </button>
                {previewOpen &&
                  (previewError ? (
                    <p role="alert">{previewError}</p>
                  ) : preview ? (
                    <Preview text={preview} />
                  ) : (
                    <p className="hint">
                      {selectionInfo.error ?? "Preparing preview…"}
                    </p>
                  ))}
              </section>
            </>
          )}
          {!doc && (
            <section className="empty">
              <span className="empty-mark" aria-hidden="true">
                ≡
              </span>
              <h2>Turn captions into documents.</h2>
              <p>
                Read and export available YouTube captions.
                <br />
                Your research, on your device.
              </p>
              <div className="privacy-dot">
                ● <span>Local processing · No account required</span>
              </div>
            </section>
          )}
          {copyFallback && (
            <section className="card">
              <label>
                Copy document manually
                <textarea
                  rows={10}
                  readOnly
                  value={copyFallback}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button onClick={() => setCopyFallback("")}>
                Close copy fallback
              </button>
            </section>
          )}
        </main>
      )}
      {!settingsOpen && doc && (
        <footer>
          <button
            disabled={!selectionInfo.selection}
            onClick={() => {
              void exportDocument(settings.format, true);
            }}
          >
            Copy
          </button>
          <button
            className="primary grow"
            disabled={!selectionInfo.selection}
            onClick={() => {
              void exportDocument(settings.format);
            }}
          >
            Download .{settings.format}
          </button>
          <details className="formats">
            <summary>Other export formats</summary>
            <div>
              {(["md", "txt", "srt", "vtt", "json"] as const).map((f) => (
                <button
                  key={f}
                  disabled={!selectionInfo.selection}
                  onClick={() => {
                    void exportDocument(f);
                  }}
                >
                  Download .{f}
                </button>
              ))}
            </div>
          </details>
        </footer>
      )}
      <div className="app-credit">Vextra / Your videos, in words.</div>
    </div>
  );
}
