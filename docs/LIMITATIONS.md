# Caption availability and compatibility

## YouTube captions

Vextra uses caption tracks supplied by YouTube. Availability depends on the video, selected language and YouTube's access requirements. A visible track can still return an empty or inaccessible caption response. Vextra reports the condition and keeps existing documents available.

Current Video can read YouTube's legacy or modern transcript panel when direct retrieval returns an empty response. The panel must expose a complete timed model; clear any search in YouTube's panel before extracting. When a modern panel does not confirm the selected language, Vextra extracts the transcript currently shown there and marks its language and caption type as unidentified. A notice explains that the selected track metadata has not been assigned. From URL and Batch URLs automatically use the same reader through one temporary, inactive, muted YouTube tab when direct caption retrieval returns no content. The tab closes after the operation; no manual navigation is required. Consent and sign-in decisions remain with you.

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
- Individual exports, combined Markdown and ZIP contents up to 100 MiB, before compression.
- Up to 300,000 parsed caption events; native-panel reads support up to 100,000 entries and 3 MiB of serialised data.
- Up to 50 templates of 50 KiB each; expanded exports share the 100 MiB output limit.
- Single-document retention of 24 hours and batch recovery of 7 days by default.

Use individual downloads for larger collections, and export documents you want to keep permanently. [Privacy settings](PRIVACY.md) provide retention and clear-data controls.
