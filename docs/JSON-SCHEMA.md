# JSON export schema 1.0

The machine-readable contract is `transcript.schema.json` (JSON Schema 2020-12). Schema version is the string `1.0`. All times are integer milliseconds relative to the original source video. `extractedAt` is an application-generated ISO 8601 UTC timestamp. Missing title/channel/duration are omitted, never guessed.

Exports include videoId, canonical sourceUrl, documentId, language, known captionType, trackId, selected source segments, relevant real chapters, extraction date, warnings and the selection descriptor. Chapter provenance is always `youtube-chapter-metadata`. Segment IDs are stable inside a document; they are not guaranteed to match a fresh extraction. `timingInferred` identifies inferred duration. Warning codes include `TIMING_INFERRED`, `CUES_REORDERED` and `INVALID_CUES_SKIPPED:N`.

Selection is `all`, a half-open cue-start `range` with startMs/endMs, `chapters` with chapterIds, or `passages` with segmentIds. Source order and original absolute times are retained; selecting a subrange does not rebase subtitles or JSON. Cue IDs are not renumbered after selection. Caption type is manual, automatic or unknown. Original parsed cues stay distinct from reading paragraphs; JSON does not replace them with inferred prose.

Signed caption URLs, browser cookies, request headers, visitor/player request context and other acquisition references are excluded. Additional fields require a schema/version decision; consumers should inspect schemaVersion. This contract defines exported document structure and preserved caption timing.

`NATIVE_PANEL_TIMING` identifies native-panel timestamps, whose precision may be lower than direct captions. `NATIVE_LANGUAGE_UNKNOWN` means the modern panel did not identify its language/type: `language` is `und` and `captionType` is `unknown`. Source text and timestamps remain available.
