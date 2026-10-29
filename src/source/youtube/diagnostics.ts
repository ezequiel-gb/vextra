export type ExtractionContext = {
  videoId: string;
  workflow: "current" | "url" | "batch";
};
/** Opt-in developer console records; never include URLs, headers or caption text. */
export function diagnostic(
  context: ExtractionContext,
  stage: string,
  details: {
    status?: number;
    contentType?: string;
    bytes?: number;
    tracks?: number;
    language?: string;
    captionType?: string;
    cues?: number;
    error?: string;
    execution?: string;
  } = {},
) {
  if (
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem("vextra:diagnostics") === "1"
  )
    console.debug("[Vextra extraction]", { ...context, stage, ...details });
}
