import { useEffect, useMemo, useRef, useState } from "react";
import type { Settings, Transcript } from "../model/types.ts";
import {
  paragraphs,
  time,
  searchIndex,
  type SearchMatch,
} from "../processing/text.ts";
import { compute } from "../browser/compute.ts";

function Highlight({
  text,
  ranges,
}: {
  text: string;
  ranges: { start: number; end: number }[];
}) {
  if (!ranges.length) return <>{text}</>;
  const found = ranges,
    nodes = [];
  let start = 0;
  for (const match of found) {
    if (match.start < start) continue;
    nodes.push(
      text.slice(start, match.start),
      <mark key={match.start}>{text.slice(match.start, match.end)}</mark>,
    );
    start = match.end;
  }
  nodes.push(text.slice(start));
  return <>{nodes}</>;
}
export function Reader({
  doc,
  settings,
  update,
  passages,
  setPassages,
  passageMode,
}: {
  doc: Transcript;
  settings: Settings;
  update: (s: Settings) => void;
  passages: string[];
  setPassages: (ids: string[]) => void;
  passageMode: boolean;
}) {
  const [query, setQuery] = useState(""),
    [matches, setMatches] = useState<SearchMatch[]>([]),
    [active, setActive] = useState(0),
    [page, setPage] = useState(0);
  const [chapterTarget, setChapterTarget] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const rows = useMemo(
    () =>
      settings.reading === "clean"
        ? paragraphs(doc, doc.segments, settings.paragraphs === "compact")
        : doc.segments.map((s) => ({
            ...s,
            segmentIds: [s.id],
            chapterId: doc.chapters.findLast((c) => s.startMs >= c.startMs)?.id,
          })),
    [doc, settings.reading, settings.paragraphs],
  );
  const selected = useMemo(() => new Set(passages), [passages]);
  const index = useMemo(() => searchIndex(doc.segments), [doc]);
  const byId = useMemo(
    () => new Map(doc.segments.map((s) => [s.id, s])),
    [doc],
  );
  const rangesFor = (row: { segmentIds: string[]; text: string }) => {
    const ranges: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const id of row.segmentIds) {
      const cue = byId.get(id)!,
        globalStart = index.starts.get(id)!,
        globalEnd = globalStart + cue.text.length;
      const localStart = row.text.indexOf(cue.text, cursor);
      if (localStart < 0) continue;
      cursor = localStart + cue.text.length;
      let lo = 0,
        hi = matches.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (matches[mid]!.end <= globalStart) lo = mid + 1;
        else hi = mid;
      }
      for (
        let n = lo;
        n < matches.length && matches[n]!.start < globalEnd;
        n++
      ) {
        const m = matches[n]!;
        ranges.push({
          start: localStart + Math.max(0, m.start - globalStart),
          end: localStart + Math.min(cue.text.length, m.end - globalStart),
        });
      }
    }
    return ranges;
  };
  useEffect(() => {
    setPage(0);
    setQuery("");
    setMatches([]);
  }, [doc.documentId]);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setMatches([]);
        setActive(0);
        return;
      }
      void compute<SearchMatch[]>(
        { type: "search", doc, query },
        abort.signal,
      ).then(
        (r) => {
          setMatches(r);
          setActive(0);
        },
        () => undefined,
      );
    }, 100);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [doc, query]);
  const activeId = matches[active]?.segmentId;
  useEffect(() => {
    if (!activeId) return;
    const index = rows.findIndex((r) => r.segmentIds.includes(activeId));
    if (index >= 0) setPage(Math.floor(index / 100));
  }, [activeId, rows]);
  useEffect(() => {
    if (activeId)
      container.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: "center" });
    else container.current?.scrollTo({ top: 0 });
  }, [page, activeId]);
  const navigateChapter = (id: string) => {
    const index = rows.findIndex((r) => r.chapterId === id);
    if (index >= 0) {
      setChapterTarget(id);
      setPage(Math.floor(index / 100));
    }
  };
  useEffect(() => {
    if (chapterTarget)
      Array.from(
        container.current?.querySelectorAll<HTMLElement>("[data-chapter]") ??
          [],
      )
        .find((el) => el.dataset.chapter === chapterTarget)
        ?.scrollIntoView({ block: "start" });
  }, [chapterTarget, page]);
  return (
    <section className="reader" aria-label="Transcript reading workspace">
      <div className="row wrap">
        <label className="grow">
          Reading mode
          <select
            value={settings.reading}
            onChange={(e) =>
              update({
                ...settings,
                reading: e.target.value as Settings["reading"],
              })
            }
          >
            <option value="clean">Clean Reading</option>
            <option value="original">Original captions</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.showTimes}
            onChange={(e) =>
              update({ ...settings, showTimes: e.target.checked })
            }
          />
          Timestamps
        </label>
      </div>
      <div className="search row">
        <input
          className="grow"
          type="search"
          aria-label="Search transcript"
          placeholder="Search the complete transcript…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          aria-label="Previous match"
          disabled={!matches.length}
          onClick={() =>
            setActive((active - 1 + matches.length) % matches.length)
          }
        >
          ↑
        </button>
        <button
          aria-label="Next match"
          disabled={!matches.length}
          onClick={() => setActive((active + 1) % matches.length)}
        >
          ↓
        </button>
      </div>
      {query && (
        <p role="status" className="hint">
          {matches.length
            ? `${active + 1} of ${matches.length} matches`
            : "No matches"}
        </p>
      )}
      {doc.chapters.length > 0 && (
        <label>
          Go to chapter
          <select
            defaultValue=""
            onChange={(e) => navigateChapter(e.target.value)}
          >
            <option value="" disabled>
              Choose chapter
            </option>
            {doc.chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {time(c.startMs)} · {c.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div
        className="transcript-scroll"
        ref={container}
        tabIndex={0}
        aria-label="Transcript text"
      >
        {rows.slice(page * 100, page * 100 + 100).map((row, index) => (
          <div
            className="cue"
            key={row.segmentIds[0]}
            data-chapter={row.chapterId}
            data-active={Boolean(activeId && row.segmentIds.includes(activeId))}
          >
            {(index === 0 ||
              rows[page * 100 + index - 1]?.chapterId !== row.chapterId) &&
              row.chapterId && (
                <h3>
                  {doc.chapters.find((c) => c.id === row.chapterId)?.title}
                </h3>
              )}
            <div className="row cue-tools">
              {passageMode && (
                <input
                  type="checkbox"
                  aria-label={`Select passage at ${time(row.startMs)}`}
                  checked={row.segmentIds.every((id) => selected.has(id))}
                  onChange={(e) => {
                    const next = new Set(passages);
                    row.segmentIds.forEach((id) =>
                      e.target.checked ? next.add(id) : next.delete(id),
                    );
                    setPassages([...next]);
                  }}
                />
              )}
              {settings.showTimes && (
                <a
                  className="timestamp"
                  href={`${doc.sourceUrl}&t=${Math.floor(row.startMs / 1000)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {time(row.startMs)}
                </a>
              )}
            </div>
            <p dir="auto">
              <Highlight text={row.text} ranges={rangesFor(row)} />
            </p>
          </div>
        ))}
      </div>
      <div className="row page-controls">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous passages
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(rows.length / 100))}
        </span>
        <button
          disabled={(page + 1) * 100 >= rows.length}
          onClick={() => setPage(page + 1)}
        >
          Next passages
        </button>
      </div>
      {rows.length > 100 && (
        <p className="hint">
          100 passages per page keeps long transcripts responsive. Search covers
          every page.
        </p>
      )}
    </section>
  );
}
