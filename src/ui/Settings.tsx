import { useState } from "react";
import type { Settings as Preferences } from "../model/types.ts";
import { builtinBody, defaults } from "../model/types.ts";
import { validateTemplate, presetOptions } from "../documents/markdown.ts";
import { clearSettings } from "../persistence/settings.ts";
import { clearData, cleanup } from "../persistence/database.ts";
import { errorText } from "../model/errors.ts";

export function Settings({
  value,
  change,
  onClear,
}: {
  value: Preferences;
  change: (s: Preferences) => void;
  onClear: () => void;
}) {
  const [name, setName] = useState("My template"),
    [body, setBody] = useState(builtinBody),
    [editing, setEditing] = useState("");
  const [message, setMessage] = useState(""),
    [usage, setUsage] = useState<number>();
  const set = <K extends keyof Preferences>(key: K, v: Preferences[K]) =>
    change({ ...value, [key]: v });
  const checkbox = (
    key: "showTimes" | "metadata" | "timestamps" | "links" | "notes" | "retain",
    label: string,
  ) => (
    <label className="check">
      <input
        type="checkbox"
        checked={value[key]}
        onChange={(e) => set(key, e.target.checked)}
      />
      {label}
    </label>
  );
  const saveTemplate = () => {
    try {
      validateTemplate(body);
      if (
        !name.trim() ||
        name.length > 100 ||
        (!editing && value.templates.length >= 50)
      ) {
        setMessage(
          "Choose a name of 1–100 characters. Up to 50 custom templates are supported.",
        );
        return;
      }
      const template = {
        id: editing || crypto.randomUUID(),
        name: name.trim(),
        body,
      };
      set("templates", [
        ...value.templates.filter((t) => t.id !== template.id),
        template,
      ]);
      setEditing(template.id);
      setMessage(
        "Template saved. Select it in the export workspace to preview it with a transcript.",
      );
    } catch (e) {
      setMessage(errorText(e));
    }
  };
  return (
    <div className="settings">
      <h2>Settings</h2>
      <fieldset>
        <legend>Appearance</legend>
        <label>
          Theme
          <select
            value={value.theme}
            onChange={(e) =>
              set("theme", e.target.value as Preferences["theme"])
            }
          >
            <option value="system">Follow system</option>
            <option value="light">Light blue & white</option>
            <option value="dark">Ash grey & charcoal</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Transcript</legend>
        <label>
          Preferred language code
          <input
            value={value.language}
            maxLength={30}
            onChange={(e) => set("language", e.target.value)}
            placeholder="en"
          />
        </label>
        <label>
          Preferred caption type
          <select
            value={value.captionType}
            onChange={(e) =>
              set("captionType", e.target.value as Preferences["captionType"])
            }
          >
            <option value="manual">Creator provided</option>
            <option value="automatic">Automatic</option>
            <option value="unknown">No preference</option>
          </select>
        </label>
        <label>
          Default reading mode
          <select
            value={value.reading}
            onChange={(e) =>
              set("reading", e.target.value as Preferences["reading"])
            }
          >
            <option value="clean">Clean Reading</option>
            <option value="original">Original captions</option>
          </select>
        </label>
        <label>
          Paragraph spacing
          <select
            value={value.paragraphs}
            onChange={(e) =>
              set("paragraphs", e.target.value as Preferences["paragraphs"])
            }
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact paragraphs</option>
          </select>
        </label>
        {checkbox("showTimes", "Show reading timestamps")}
      </fieldset>
      <fieldset>
        <legend>Export</legend>
        <label>
          Default Markdown preset
          <select
            value={value.preset}
            onChange={(e) =>
              change({
                ...value,
                ...presetOptions(e.target.value as Preferences["preset"]),
              })
            }
          >
            <option value="clean">Clean Reading</option>
            <option value="research">Research</option>
            <option value="archive">Archive</option>
          </select>
        </label>
        <label>
          Default format
          <select
            value={value.format}
            onChange={(e) =>
              set("format", e.target.value as Preferences["format"])
            }
          >
            {["md", "txt", "srt", "vtt", "json"].map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filename pattern
          <input
            value={value.filename}
            maxLength={160}
            onChange={(e) => set("filename", e.target.value)}
          />
        </label>
        <p className="hint">
          Use {"{{title}}"}, {"{{videoId}}"} and {"{{channel}}"}. Filenames are
          sanitised for Windows.
        </p>
        {checkbox("metadata", "Include available metadata")}
        {checkbox("timestamps", "Include export timestamps")}
        {checkbox("links", "Include source and timestamp links")}
        {checkbox("notes", "Include an empty Notes section")}
        <p className="hint">
          SRT and VTT always use original caption timing; document formatting
          settings do not change subtitles.
        </p>
      </fieldset>
      <fieldset>
        <legend>Custom Markdown templates</legend>
        <label>
          Saved template
          <select
            aria-label="Edit saved template"
            value={editing}
            onChange={(e) => {
              const t = value.templates.find((t) => t.id === e.target.value);
              setEditing(t?.id ?? "");
              setName(t?.name ?? "My template");
              setBody(t?.body ?? builtinBody);
            }}
          >
            <option value="">Create template</option>
            {value.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Template name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          Markdown template
          <textarea
            className="code"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
          />
        </label>
        <p className="hint">
          Placeholders: title, channel, url, duration, language, extracted_date,
          chapters, transcript, notes, each inside double braces. Chapters
          inserts an index; transcript inserts the selected formatted content.
          Placeholders insert text; they do not run code. Raw HTML is hidden in
          the preview.
        </p>
        <div className="row wrap">
          <button onClick={saveTemplate}>
            {editing ? "Save template" : "Create template"}
          </button>
          <button
            onClick={() => {
              setEditing("");
              setName(`${name} copy`);
            }}
          >
            Duplicate
          </button>
          <button
            disabled={!editing}
            onClick={() => {
              change({
                ...value,
                templateId:
                  value.templateId === editing ? "" : value.templateId,
                templates: value.templates.filter((t) => t.id !== editing),
              });
              setEditing("");
              setName("My template");
              setBody(builtinBody);
            }}
          >
            Delete template
          </button>
          <button
            onClick={() => {
              setEditing("");
              setName("My template");
              setBody(builtinBody);
            }}
          >
            Reset template editor
          </button>
        </div>
        <p className="hint">
          Built-in presets stay available and cannot be overwritten. To
          duplicate a preset, start with the default editor and save a custom
          copy.
        </p>
      </fieldset>
      <fieldset>
        <legend>Privacy and data</legend>
        {checkbox("retain", "Retain completed transcripts temporarily")}
        <p className="hint">
          Retained single transcripts expire after 24 hours; batch recovery
          expires after 7 days. With retention off, single transcripts stay in
          the open workspace. Batch outputs are stored until the next cleanup
          after processing stops. Expired records are removed when Vextra next
          starts or cleans its storage. Keep a Vextra panel or tab open while
          processing.
        </p>
        <div className="row wrap">
          <button
            onClick={() => {
              void cleanup()
                .then(setUsage)
                .catch((e) => setMessage(errorText(e)));
            }}
          >
            Review local usage
          </button>
          <button
            onClick={() => {
              void clearData()
                .then(() => {
                  onClear();
                  setUsage(0);
                  setMessage("Temporary transcripts and batches cleared.");
                })
                .catch((e) => setMessage(errorText(e)));
            }}
          >
            Clear temporary transcripts
          </button>
          <button
            onClick={() => {
              void clearSettings()
                .then(() => {
                  change(structuredClone(defaults));
                  setMessage("Preferences and custom templates reset.");
                })
                .catch((e) => setMessage(errorText(e)));
            }}
          >
            Reset preferences & templates
          </button>
        </div>
        {usage !== undefined && (
          <p>
            {(usage / 1024 / 1024).toFixed(2)} MiB of the 100 MiB app limit
            used.
          </p>
        )}
      </fieldset>
      <fieldset>
        <legend>About Vextra</legend>
        <p>
          Vextra {chrome.runtime.getManifest().version} · Local-first YouTube
          transcript documents.
        </p>
        <p>
          Captions must be accessible from YouTube. Vextra cannot transcribe
          audio or unlock restricted videos. Caption availability depends on
          YouTube.
        </p>
        <p className="hint">
          Vextra is released under the MIT Licence. Bundled dependency notices
          are included in the release documentation.
        </p>
      </fieldset>
      <p role="status">{message}</p>
    </div>
  );
}
