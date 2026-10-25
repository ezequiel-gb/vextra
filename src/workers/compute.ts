import { exportText } from "../export/formats.ts";
import { archive, combinedMarkdown } from "../export/batch.ts";
import { searchDocument } from "../processing/text.ts";
import { VextraError } from "../model/errors.ts";
import type {
  Format,
  Selection,
  Settings,
  Transcript,
} from "../model/types.ts";
export type ComputeRequest = { id: number } & (
  | {
      type: "export";
      doc: Transcript;
      selection: Selection;
      settings: Settings;
      format: Format;
    }
  | { type: "search"; doc: Transcript; query: string }
  | {
      type: "zip";
      docs: Transcript[];
      settings: Settings;
      format: Format;
      statuses: unknown;
    }
  | { type: "combined"; docs: Transcript[]; settings: Settings; total: number }
);
self.onmessage = async (e: MessageEvent<ComputeRequest>) => {
  const m = e.data;
  try {
    let data: unknown;
    if (m.type === "export")
      data = exportText(m.doc, m.selection, m.settings, m.format);
    else if (m.type === "search")
      data = searchDocument(m.doc.segments, m.query);
    else if (m.type === "zip")
      data = await archive(m.docs, m.settings, m.format, m.statuses);
    else data = combinedMarkdown(m.docs, m.settings, m.total);
    self.postMessage({ id: m.id, data });
  } catch (error) {
    self.postMessage({
      id: m.id,
      error: error instanceof Error ? error.message : "Processing failed.",
      code: error instanceof VextraError ? error.code : undefined,
    });
  }
};
