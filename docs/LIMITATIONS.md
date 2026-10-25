# Caption availability and compatibility

## YouTube captions

Vextra uses caption tracks supplied by YouTube. Availability depends on the video, selected language and YouTube's access requirements. A visible track can still return an empty or inaccessible caption response. Vextra reports the condition and keeps existing documents available.

Current Video can attempt YouTube's native transcript panel when direct retrieval returns an empty response. The panel must provide a complete timed transcript in the selected language. From URL uses public acquisition without opening a source tab. Consent and sign-in decisions remain with you.

Vextra does not transcribe audio, translate captions or bypass private/restricted content. It preserves the wording and timing provided by the source captions.

## Browser interface

Vextra targets Manifest V3 Chromium browsers. The primary build uses a side panel; the tab fallback shares the same application code and is available for browsers without side-panel support. See [installation](INSTALLATION.md).

## Longer documents and batches

The reader displays 100 passages per page while search covers the full transcript. Markdown previews reveal long documents incrementally; exports include the full selection.

Keep a Vextra panel or expanded tab open during batch processing. Closing the only runner interrupts work; the saved queue can be resumed after its ownership lease expires. Completed results are preserved according to the retention setting.

## Resource and retention limits

- Up to 100 unique videos per batch.
- Caption responses up to 25 MiB.
- Up to 100 MiB of temporary document data per profile, subject to browser quotas.
- ZIP exports up to 100 MiB of generated uncompressed content.
- Single-document retention of 24 hours and batch recovery of 7 days by default.

Use individual downloads for larger collections, and export documents you want to keep permanently. [Privacy settings](PRIVACY.md) provide retention and clear-data controls.
