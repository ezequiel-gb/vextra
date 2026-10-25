export type CaptionType = "manual" | "automatic" | "unknown";
export interface Segment {
  id: string;
  startMs: number;
  durationMs: number;
  text: string;
  timingInferred?: boolean;
}
export interface Chapter {
  id: string;
  title: string;
  startMs: number;
  endMs?: number;
  provenance: "youtube-chapter-metadata";
}
export interface Track {
  id: string;
  languageCode: string;
  displayName: string;
  captionType: CaptionType;
  acquisitionRef: string;
}
export interface Discovery {
  videoId: string;
  sourceUrl: string;
  title?: string;
  channel?: string;
  durationMs?: number;
  thumbnailUrl?: string;
  tracks: Track[];
  chapters: Chapter[];
  adapterId: string;
}
export interface Transcript {
  schemaVersion: "1.0";
  documentId: string;
  videoId: string;
  sourceUrl: string;
  title?: string;
  channel?: string;
  durationMs?: number;
  language: string;
  captionType: CaptionType;
  trackId: string;
  segments: Segment[];
  chapters: Chapter[];
  extractedAt: string;
  warnings: string[];
}
export type Selection =
  | { kind: "all" }
  | { kind: "range"; startMs: number; endMs: number }
  | { kind: "chapters"; chapterIds: string[] }
  | { kind: "passages"; segmentIds: string[] };
export interface Paragraph {
  segmentIds: string[];
  chapterId?: string;
  startMs: number;
  endMs: number;
  text: string;
}
export type Format = "md" | "txt" | "srt" | "vtt" | "json";
export type Preset = "clean" | "research" | "archive";
export interface Template {
  id: string;
  name: string;
  body: string;
}
export interface Settings {
  version: 1;
  theme: "system" | "light" | "dark";
  language: string;
  captionType: CaptionType;
  reading: "clean" | "original";
  showTimes: boolean;
  format: Format;
  preset: Preset;
  metadata: boolean;
  timestamps: boolean;
  links: boolean;
  notes: boolean;
  paragraphs: "compact" | "comfortable";
  filename: string;
  templateId: string;
  templates: Template[];
  retain: boolean;
}
export const defaults: Settings = {
  version: 1,
  theme: "system",
  language: "en",
  captionType: "manual",
  reading: "clean",
  showTimes: true,
  format: "md",
  preset: "clean",
  metadata: true,
  timestamps: false,
  links: true,
  notes: false,
  paragraphs: "comfortable",
  filename: "{{title}}",
  templateId: "",
  templates: [],
  retain: true,
};
export const builtinBody =
  "# {{title}}\n\n{{channel}}\n\n{{url}}\n\n{{transcript}}\n\n{{notes}}";
