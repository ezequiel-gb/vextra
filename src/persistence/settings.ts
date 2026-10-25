import { defaults, type Settings, type Template } from "../model/types.ts";
import { object } from "../model/errors.ts";
import { validateTemplate } from "../documents/markdown.ts";
export function validatedSettings(raw: unknown): Settings {
  const r = object(raw),
    s = structuredClone(defaults);
  const enums = {
    theme: ["system", "light", "dark"],
    captionType: ["manual", "automatic", "unknown"],
    reading: ["clean", "original"],
    format: ["md", "txt", "srt", "vtt", "json"],
    preset: ["clean", "research", "archive"],
    paragraphs: ["compact", "comfortable"],
  };
  for (const [key, values] of Object.entries(enums))
    if (typeof r[key] === "string" && values.includes(r[key] as string))
      Object.assign(s, { [key]: r[key] });
  for (const key of [
    "showTimes",
    "metadata",
    "timestamps",
    "links",
    "notes",
    "retain",
  ] as const)
    if (typeof r[key] === "boolean") s[key] = r[key];
  for (const key of ["language", "filename", "templateId"] as const)
    if (typeof r[key] === "string" && r[key].length < 200) s[key] = r[key];
  if (Array.isArray(r.templates))
    s.templates = r.templates.slice(0, 50).flatMap((v: unknown): Template[] => {
      const t = object(v);
      if (
        typeof t.id !== "string" ||
        typeof t.name !== "string" ||
        !t.name.trim() ||
        t.name.length > 100 ||
        typeof t.body !== "string"
      )
        return [];
      try {
        validateTemplate(t.body);
        return [{ id: t.id, name: t.name, body: t.body }];
      } catch {
        return [];
      }
    });
  return s;
}
export async function loadSettings(): Promise<Settings> {
  const raw = (await chrome.storage.local.get("settings")).settings;
  if (raw && object(raw).version !== 1)
    await chrome.storage.local.set({ settingsMigrationBackup: raw });
  return validatedSettings(raw);
}
export async function saveSettings(s: Settings) {
  await chrome.storage.local.set({ settings: validatedSettings(s) });
}
export async function clearSettings(): Promise<void> {
  await chrome.storage.local.remove(["settings", "settingsMigrationBackup"]);
}
