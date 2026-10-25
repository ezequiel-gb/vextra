import { VextraError } from "./errors.ts";
/** Limits apply to decoded input and generated output, before compression. */
export const limits = {
  responseBytes: 25 * 1024 * 1024,
  captionCues: 300_000,
  exportBytes: 100 * 1024 * 1024,
  batchCharacters: 100_000,
  batchVideos: 100,
  templateBytes: 50 * 1024,
} as const;

export function boundedExport(text: string): string {
  if (
    text.length > limits.exportBytes ||
    new TextEncoder().encode(text).byteLength > limits.exportBytes
  )
    throw new VextraError("EXPORT_SIZE_LIMIT");
  return text;
}
