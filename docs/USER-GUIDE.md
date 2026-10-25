# Using Vextra

## Extract a transcript

Open a supported YouTube video and Vextra’s side panel. Choose Current Video, refresh detection if needed, and select Find caption languages. Alternatively choose From URL, paste a video link and find its caption languages without navigating to that video. Choose the actual language/type shown, then Extract Transcript. If your preferred language is missing, the visible selected track is the fallback that will be used. Vextra does not translate.

Progress shows actual phases. Cancel stops the owned request or prevents its late result from replacing your document. Retry discovery or extraction from the retained source context. No-caption, restricted, changed-format, network and inaccessible-caption results are failures; they never generate an empty success document. See [validation and compatibility](VALIDATION.md) for acquisition coverage.

In Current Video mode, an empty direct caption response triggers an automatic native-panel attempt: Vextra expands YouTube's description, clicks Show transcript and selects Transcript when it is combined with Chapters. The page may visibly open that panel. The fallback checks the selected language and reads a complete timed native model before creating a document. Consent and login prompts remain under your control. From URL mode uses public caption acquisition without opening a source tab.

## Read, search and select

Original mode preserves timed cues; Clean Reading conservatively joins them without rewriting. Timestamps open the source video at that position. Genuine YouTube chapters appear when discovered. A neutral Transcript heading is used otherwise. Large transcripts show 100 passages per page with previous/next navigation; search covers the entire transcript and navigates to matches on other pages. Search is literal and case-insensitive, with count and previous/next controls.

Export selection has four mutually exclusive modes. Full includes everything. Time range includes complete cues whose **start** is at or after From and strictly before Until; it does not cut words or rebase subtitles. Use `mm:ss` or `hh:mm:ss`, optionally `.mmm`. Chapters unions the selected intervals. Passages uses the checkboxes in the reader; a clean paragraph selects its original source cues. Discontinuous selections do not merge across omitted cues. The selection summary reports cue count and absolute boundaries.

## Format and export

Clean Reading produces comfortable paragraphs. Research includes detailed available metadata and timestamp links by default. Archive preserves original caption segmentation. Presets provide defaults; metadata, timestamps and source-link overrides are remembered. Custom templates are selected separately. Preview is safe rendered Markdown with an optional source view; very large previews reveal more incrementally. Copy and downloads always use the complete selected output, not only the visible preview.

Use Copy, Download .md (or the configured default format) and More formats for TXT/SRT/VTT/JSON. SRT/VTT always use original selected timing and ignore paragraph/preset metadata settings. A download is marked complete only after the browser reports it. Clipboard denial opens a manual-copy text area. Export failures preserve the document.

## Templates and settings

Settings provides appearance, transcript preferences, export defaults, template management, local data controls and About. Templates support create, rename, edit, duplicate, delete custom and restoring the default editor. Built-in presets cannot be overwritten. Select a saved template in the export workspace to preview it with a transcript.

Supported placeholders: `{{title}}`, `{{channel}}`, `{{url}}`, `{{duration}}`, `{{language}}`, `{{extracted_date}}`, `{{chapters}}`, `{{transcript}}`, `{{notes}}`. Chapters inserts an index; transcript inserts selected formatted content; notes inserts an empty Notes heading if enabled. Optional missing metadata becomes empty. Expansion is single-pass; unknown placeholders are rejected, and no code is evaluated. Remote images and unsafe links do not execute in preview. Limits: 50 custom templates, 50 KiB each.

Filename patterns support title, videoId and channel placeholders. Windows-invalid characters and device names are sanitized; long stems are limited to 120 Unicode code points at grapheme boundaries. Browser collision handling uniquifies downloads.

## Batch processing and recovery

Paste one or more URLs. Review invalid entries and duplicate removal; remove accepted entries before starting. Up to 100 unique videos are accepted. Requests run sequentially with a delay; each result has its own status. Creator-caption preference and preferred language apply deterministically, and actual language is recorded.

Keep the panel or an expanded Vextra tab open while processing. Closing the only runner interrupts work; a browser service worker is not kept alive artificially. Resume / retry unsuccessful reclaims interrupted or failed items while preserving completed results. Another open Vextra window cannot process the same queue concurrently. Allow up to 15 seconds for an abandoned runner lease to expire before resuming.

Continue in tab opens a runner surface; stop/close the original panel if transferring ownership, then use Resume in the tab after the previous lease releases/expires. It does not falsely promise that closing a panel transfers a running JavaScript task automatically. Cancel preserves completed items. Rate limiting pauses processing for a later explicit retry. Other transient network/timeouts have bounded retry.

Read/export a completed item individually, download individual files, combine completed results into Markdown or download a ZIP with a status manifest. Failed videos never produce placeholder documents. ZIP memory is limited to 100 MiB of uncompressed generated content; use individual files for larger output.

## Retention

Single-video documents normally expire after 24 hours; batch recovery expires 7 days after creation. These are temporary recovery records, not a permanent library. Disabling completed-transcript retention prevents single-document persistence. Batch outputs remain available during their active session, then are removed at the next startup/cleanup after the runner releases its lease; affected batch items require re-extraction instead of claiming their files are still recoverable. Clear temporary transcripts invalidates running leases. Preferences and custom templates are stored separately.
