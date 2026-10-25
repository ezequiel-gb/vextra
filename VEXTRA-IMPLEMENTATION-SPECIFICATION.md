# Vextra 1.0 — Technical Implementation Specification

Prepared 24 October 2026 from the supplied Comprehensive Product Brief.

**Status:** historical design specification. It records the original requirements and proposed architecture; it is not a statement of current implementation or completed verification. See [architecture](docs/ARCHITECTURE.md), [development checks](docs/VALIDATION.md) and [caption compatibility](docs/LIMITATIONS.md) for current guidance.

**Purpose:** technical requirements and architectural reference for Vextra 1.0. Numeric limits and algorithms below are engineering defaults that may be adjusted with recorded evidence while retaining the product requirements.

## 1. Assignment and release boundaries

Build Vextra as a polished, local-first Manifest V3 Chromium extension that retrieves accessible YouTube captions and produces accurate, reusable documents. Deliver source, automated tests, a production build, an unpacked install directory, installation documentation and an evidence-based validation report.

Preserve all initial-release functionality: active-video and pasted-URL extraction; caption language selection; original and clean reading; search and timestamp navigation; actual chapters; full, range, chapter and passage selection; Markdown presets and custom templates; TXT, SRT, VTT and JSON; batch processing, individual downloads, combined Markdown and ZIP; local settings; light, dark and system themes; cancellation, retry and recovery.

Do not add accounts, analytics, advertising, mandatory AI, translation, paid APIs, a developer backend, speech recognition, video/audio downloading, a permanent research library, annotations or playlist extraction. A notes placeholder in a document template is permitted; a persistent notes application is future scope. Extraction success must always mean a validated, nonempty timed transcript was obtained.

Implement working behaviour at each milestone. Fixtures belong in tests or an explicitly labelled development harness, never in production extraction paths. Do not expose a control whose only behaviour is a placeholder message. Release acceptance covers the required features and browser checks defined below.

## 2. Technology decisions

| Area                   | Choice                                                                                 | Reason                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Language               | TypeScript, strict mode; `noUncheckedIndexedAccess`                                    | Shared contracts and safe handling of incomplete external data                                                |
| UI                     | React with hooks and a reducer; semantic HTML and CSS custom properties                | Suitable for interacting transcript, preview, selection and batch state without a large application framework |
| Build                  | Vite multipage build plus a small extension packaging script                           | Deterministic paths for panel, settings, background worker and packaged scripts                               |
| Browser types          | `@types/chrome`; small internal API adapter                                            | Chromium target does not justify a large compatibility framework                                              |
| Parsing                | JSON parser, browser `DOMParser` in the runner context, validated adapters             | No evaluation of YouTube page scripts                                                                         |
| Markdown preview       | `react-markdown`, raw HTML disabled, explicit link/image policy                        | Render a safe component tree rather than inserting HTML                                                       |
| ZIP                    | `fflate`, bundled, asynchronous worker operation                                       | Browser-only ZIP creation without a server                                                                    |
| Preferences            | `chrome.storage.local`                                                                 | Local extension settings without cloud synchronisation                                                        |
| Large/recoverable data | IndexedDB through a small repository layer                                             | Transactional batch recovery and temporary document storage                                                   |
| Background computation | Packaged dedicated Web Worker                                                          | Parsing/formatting/search/ZIP work stays off the UI thread where practical                                    |
| Unit/integration tests | Vitest, Testing Library, checked-in sanitised fixtures                                 | Fast deterministic core and UI verification                                                                   |
| Browser automation     | Playwright persistent Chromium profiles where supported; manual branded-browser checks | Tests the installed MV3 build, not just a webpage imitation                                                   |

At implementation time select supported stable dependency versions and a supported Node.js LTS development version, record them in `package.json`, a lockfile and an engines/runtime file, and document the rationale. Pin dependency versions and record minimum browser versions with supporting compatibility checks. Use one package and npm unless repository evidence justifies another choice. Runtime users need only the browser.

## 3. Repository and dependency boundaries

Create a dedicated `vextra/` repository or project folder, separate from unrelated project files. Never edit synced reference files under `sources/`.

```text
vextra/
  package.json                 # scripts, engines and dependency declarations
  package-lock.json
  tsconfig.json
  vite.config.ts
  panel.html
  settings.html
  public/icons/                # original SVG source and generated PNG sizes
  src/
    background/index.ts        # toolbar, routing, lifecycle; no durable queue loop
    browser/                   # capabilities, tabs, scripting, downloads, storage
    content/navigation.ts      # isolated-world YouTube navigation observer
    content/read-player.ts     # packaged, narrowly scoped MAIN-world reader
    source/youtube/
      urls.ts
      active-page.ts
      public-watch.ts
      discovery-adapters.ts
      caption-fetch.ts
      chapter-adapters.ts
      schemas.ts
    model/                     # documents, selections, settings, errors, messages
    processing/                # caption parsers, validation, paragraphs, search
    documents/                 # presets, escaping, templates, Markdown generation
    export/                    # txt, srt, vtt, json, zip, filenames
    batch/                     # queue state machine, coordinator, recovery
    persistence/               # IndexedDB transactions and preferences migrations
    workers/                   # packaged compute worker and typed protocol
    ui/                        # app, components, routes, theme tokens, styles
  tests/
    unit/
    integration/
    fixtures/                  # sanitised captures; provenance and expected output
    browser/
  scripts/                     # manifest generation, icons, packaging, validation
  docs/
    ARCHITECTURE.md
    VALIDATION.md
    INSTALLATION.md
    USER-GUIDE.md
    PRIVACY.md
    LIMITATIONS.md
    JSON-SCHEMA.md
  dist/chromium-panel/         # production unpacked output, generated
  dist/chromium-tab/           # compatibility manifest, generated
  artifacts/                  # distributable ZIPs, checksums, validation report
  README.md
  THIRD-PARTY-NOTICES.md
```

`model`, `processing`, `documents` and pure exporters must not import browser APIs or YouTube acquisition adapters. Acquisition returns validated models; UI does not interpret YouTube response fields. IndexedDB access belongs behind repositories, not inside components. All network traffic goes through the restricted source request layer. Tests must enforce these boundaries through lint rules or an import check.

## 4. Execution contexts, browser integration and manifest

Use the panel or expanded extension tab as the foreground task runner. Keep the service worker small: register listeners synchronously, handle toolbar actions, mediate privileged injection, and expose capability information. Do not place the batch loop, document parsing or Blob URL lifetime in the service worker.

Chrome documents that `sidePanel.open()` requires a user action. Open directly from the toolbar listener before unrelated asynchronous work can consume that gesture; use `setPanelBehavior` only if its behaviour is verified in the target browser. Avoid a default popup that suppresses the toolbar listener. [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

Illustrative panel manifest, to be generated and tested rather than copied without validation:

```json
{
  "manifest_version": 3,
  "name": "Vextra",
  "version": "1.0.0",
  "description": "Turn accessible YouTube captions into reusable documents.",
  "permissions": ["storage", "scripting", "downloads", "sidePanel"],
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://m.youtube.com/*",
    "https://youtube.com/*"
  ],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_title": "Open Vextra" },
  "side_panel": { "default_path": "panel.html" },
  "options_ui": { "page": "settings.html", "open_in_tab": true },
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.youtube.com/*",
        "https://m.youtube.com/*",
        "https://youtube.com/*"
      ],
      "js": ["navigation.js"],
      "run_at": "document_idle"
    }
  ],
  "content_security_policy": {
    "extension_pages": "default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; connect-src https://www.youtube.com https://m.youtube.com https://youtube.com; img-src 'self' data: https://i.ytimg.com; style-src 'self'"
  }
}
```

The tab compatibility manifest omits `sidePanel` permission and `side_panel`, retaining the same application assets. Its toolbar action focuses or opens `panel.html` as an extension tab. Try the shared panel build first; supply the tab variant where manifest acceptance or panel behaviour fails. These are generated manifest variations, not divergent application implementations.

Feature-detect APIs and catch operational rejection. Never equate an existing API property with functional support. Include an “Open in tab” command in panel builds. Show a close button only when the host supplies a tested close mechanism. Microsoft documents its sidebar support through `chrome.sidePanel`; Brave, Vivaldi, Opera and specific releases still require direct verification. [Microsoft Edge sidebar documentation](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/sidebar)

Permissions have concrete consumers: `storage` for preferences; `scripting` for the player snapshot; `downloads` for controlled file downloads; YouTube hosts for discovery and caption requests. Existing host permissions cover injection on those hosts. Do not also request broad `tabs`, `activeTab`, `cookies`, `webRequest`, `debugger`, `unlimitedStorage`, `<all_urls>` or unrelated hosts without a demonstrated implemented requirement. `youtu.be` links are parsed locally and converted to canonical watch URLs, requiring no request permission for that host. Thumbnail images use the specific CSP image host and may fail gracefully.

Extension contexts with host permission can make cross-origin requests; content scripts remain subject to their page's origin restrictions. Therefore use the extension runner for public discovery/fetching, with a separately tested narrow page-context adapter only if necessary. [Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

## 5. Shared contracts

Use runtime validation for all external data and cross-context messages, even when the TypeScript producer has the expected type.

```ts
type CaptionType = "manual" | "automatic" | "unknown";
type CaptionFormat = "json3" | "srv3" | "xml" | "vtt";

interface TranscriptSegment {
  id: string; // stable within a document
  startMs: number; // finite, integer, >= 0
  durationMs: number; // finite, integer, > 0
  text: string; // decoded plain text; no executable markup
  timingInferred?: boolean;
}

interface TranscriptChapter {
  id: string;
  title: string;
  startMs: number;
  endMs?: number;
  provenance: "youtube-chapter-metadata";
}

interface CaptionTrack {
  id: string;
  languageCode: string;
  displayName: string;
  captionType: CaptionType;
  // Acquisition-private: never expose signed URLs in JSON exports or logs.
  acquisitionRef: string;
}

interface VideoDiscovery {
  videoId: string;
  sourceUrl: string;
  title?: string;
  channel?: string;
  durationMs?: number;
  thumbnailUrl?: string;
  tracks: CaptionTrack[];
  chapters: TranscriptChapter[];
  adapterId: string;
}

interface TranscriptDocument {
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
  segments: readonly TranscriptSegment[];
  chapters: readonly TranscriptChapter[];
  extractedAt: string; // ISO 8601 UTC
  warnings: string[]; // controlled warning codes
}

type Selection =
  | { kind: "all" }
  | { kind: "range"; startMs: number; endMs: number }
  | { kind: "chapters"; chapterIds: string[] }
  | { kind: "passages"; segmentIds: string[] };

interface Paragraph {
  segmentIds: string[];
  chapterId?: string;
  startMs: number;
  endMs: number;
  text: string;
}

interface SourceAdapter {
  discover(
    input: { videoId: string; tabId?: number },
    signal: AbortSignal,
  ): Promise<VideoDiscovery>;
  fetchTrack(
    discovery: VideoDiscovery,
    trackId: string,
    signal: AbortSignal,
  ): Promise<{
    format: CaptionFormat;
    payload: string;
  }>;
}
```

Add typed settings, batch records, export artifacts and versioned request/reply envelopes. Messages contain `protocolVersion`, `requestId`, discriminant `type` and a validated payload; replies contain the same request ID and either data or a controlled error. Reject unknown message types. Never accept generic “fetch this URL”, “execute this script” or arbitrary IndexedDB commands.

Preserve parsed timed source segments separately from derived paragraphs. Normalization is deterministic and records warnings; do not mutate source segments when switching reading modes, themes, templates or selections. JSON schema documentation must describe units, optional fields, inference warnings, selection semantics and forward compatibility. Include a JSON Schema file in the implementation.

## 6. Extraction feasibility gate

Complete this before investing in the full reading/export UI. Host permissions do not guarantee YouTube will return usable caption data.

The official YouTube Data API caption-download endpoint requires authorization and permission to edit the video. It is unsuitable as the general public-video extraction path for this product. [YouTube captions.download](https://developers.google.com/youtube/v3/docs/captions/download)

Public web-client extraction is an undocumented dependency. The maintainer of `youtube-transcript-api` explicitly warns that its underlying interface may break and reports blocked requests; that project provides context for designing and maintaining browser-native MV3 adapters. Do not add Python, proxy services or that package as a runtime dependency. [Maintainer documentation](https://github.com/jdepoix/youtube-transcript-api)

Record live-check evidence under the ignored `artifacts/` directory, following [docs/VALIDATION.md](docs/VALIDATION.md), with date, OS, browser/version, extension build hash, test video IDs, caption languages/types, signed-in/out state, region where relevant, adapter attempted, result and sanitised failure category. Do not include cookies, authentication headers, signed caption URLs or private data.

Validate at least six distinct accessible public videos, including manual captions, automatic captions, multiple languages, one long recording and Shorts/live URL forms where an archived captioned example exists. Separately exercise no-caption, unavailable/restricted and network-failure cases. Confirm both current-page acquisition and pasted URL acquisition for each applicable positive case. A video that becomes unavailable must be recorded and replaced transparently, not silently removed from the report.

The pasted URL gate must pass from an unrelated active tab without asking the user to navigate to the target video. Success obtained only after manual target-page navigation does not satisfy that workflow. If a browser-native acquisition route cannot satisfy this, record the exact limitation and keep the release gate open. Do not substitute mock transcripts or advertise complete URL support.

No hardcoded client identity, player response field, endpoint or query flag may be labelled stable merely because it works once. A network request returning HTTP 200 is insufficient: validate video identity, selected track, timing and nonempty transcript content.

## 7. Source acquisition strategies

### 7.1 URL validation

Use `URL`, not substring matching. Accept `http`/`https` YouTube video links and canonicalize requests to HTTPS. Reject userinfo, unexpected ports, unsupported schemes and hosts outside an exact input allowlist: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be`. Add another host only with a specific test and reason.

Recognize `/watch?v=ID`, short-host `/ID`, `/shorts/ID`, `/live/ID` and optionally `/embed/ID`. Require an 11-character `[A-Za-z0-9_-]` video ID for current supported patterns; treat that as a tested parser assumption, not an eternal platform guarantee. Reject ambiguous repeated `v` parameters with conflicting values and malformed percent encoding. Canonical output is `https://www.youtube.com/watch?v=ID`; discard tracking, playlists and initial timestamp parameters. Link timestamps are generated later from segment times. Bare IDs are not required input.

Deduplicate batches by video ID, preserving the first occurrence and input order. Unsupported and malformed entries receive line-specific validation errors without any network call. Never fetch an input URL directly.

### 7.2 Current video

1. Obtain the active tab in the owning browser window and validate its URL. Read only permitted YouTube tab information.
2. Observe navigation through the isolated content script, using YouTube navigation events as hints plus debounced location checks on relevant DOM changes and visibility/focus. Remove observers/listeners on disposal; avoid continuous document-wide heavy work. Revalidate the video ID whenever an extraction starts, irrespective of notification delivery.
3. Ask the background adapter to run a packaged, self-contained MAIN-world function in the top frame. Read only known player response data and metadata necessary for the current video. Return a small serializable snapshot through `executeScript` results; avoid a publicly writable `postMessage` bridge where possible.
4. Validate the returned video's identity against the active URL. Reject stale player data during SPA navigation and retry briefly with a bounded deadline.
5. Discover tracks and chapter records through versioned, individually tested parsers. When the page snapshot is unavailable, try the public-watch discovery adapter for the same validated ID.
6. On a video change, update source detection while retaining the already extracted document until the user replaces it. Abort or ignore obsolete request results using request/document generation IDs.

The page environment is untrusted even when the injected code is packaged. Validate returned URLs, strings, sizes and IDs. Inject no remote source and read no cookies or unrelated page state. Chrome's scripting API supports targeted execution with explicit host access. [Chrome scripting reference](https://developer.chrome.com/docs/extensions/reference/api/scripting)

### 7.3 Pasted URL and batch acquisition

Fetch the canonical public watch page from the extension runner using `credentials: "omit"` initially. Treat consent pages, sign-in interstitials, bot challenges and restricted responses as distinct unsupported/access states rather than malformed transcripts.

Extract known embedded JSON objects with an isolated, bounded parser that understands quoted strings, escapes and balanced delimiters. Never use `eval`, `Function`, remotely supplied JavaScript or a regular expression that assumes an entire nested JSON object fits a simple capture. Runtime-validate all candidate objects and their video IDs. Keep page/player and any transcript endpoint schemas in separate adapters with sanitised captures.

An alternate YouTube web-client metadata/transcript request may be implemented only after browser validation demonstrates necessity and reliability. Document exact context fields, provenance, credential behaviour and response schema. Never scrape credentials, spoof privileged clients, solve challenges, or retrieve remotely executable player code. Restriction/challenge/token requirements that the implementation cannot meet produce a truthful failure.

If testing shows public watch retrieval alone is insufficient, a temporary inactive YouTube tab may be evaluated as a documented fallback: no manual user navigation, no playback, one tab at a time, show status, persist its owned tab ID, and close only tabs created by Vextra. It must pass the same privacy, cleanup, cancellation and browser tests. Enable the fallback with documented privacy, cleanup and browser checks; create source tabs only during a user-requested operation.

### 7.4 Track choice and caption fetch

Discovery and extraction are separate operations. Show available tracks before extraction; allow an explicit track override. Match preferred language exactly first, then its base language if available, honoring an explicit caption-type preference. For equivalent language/type candidates use stable ordering. Default to manual over automatic for the same language; never silently select a different language or translate. If the preferred language is absent, show the actual selected fallback language before starting. Batch mode uses this deterministic fallback and records it per item.

Use the discovered signed caption URL only in memory and only after checking HTTPS, exact permitted host and a tested caption path such as `/api/timedtext`. Retain its opaque query parameters; do not reconstruct signatures. Request a known caption representation only where an adapter has verified it. Validate response content instead of trusting `Content-Type` alone. Never follow a redirect to an unrelated host: use a rejecting/manual redirect policy and permit only an explicitly validated same-allowlist redirect flow; fail if safe redirect inspection is unavailable.

Use a 20-second per-request timeout, a 90-second overall item deadline and a 25 MiB bounded response reader as starting safeguards. On an expired/forbidden caption URL, rediscover once without claiming all 403 responses are expiry. Classify challenges/restrictions independently. Never persist a signed URL as a durable resume token.

No-caption-track and inaccessible-track failures are different. A changed discovery schema is not evidence that a video has no captions. An empty HTTP success response is not an extracted transcript.

## 8. Caption parsing and text integrity

Support observed JSON3, legacy XML transcript and SRV3 representations through distinct parsers. Add VTT input only with a parser fixture if it is encountered by the acquisition strategy. Unsupported formats produce a parsing error. Reject XML parser errors, document types/external entities, excessive nesting and oversized inputs.

JSON3 parsing must account for text-bearing events, nested text segments, offsets and non-text events. SRV3 parsing must account for timed paragraphs, nested spans and recognised line breaks. Decode XML entities through the XML parser; do not decode an already decoded string twice. For plain JSON text, preserve literal entity-looking text unless the format explicitly specifies encoding. Preserve Unicode, bidirectional text, punctuation and meaningful line breaks; normalize CRLF and insignificant spacing without inserting missing punctuation.

Assign stable cue IDs, validate finite times and convert to integer milliseconds. Missing duration may be inferred from the next cue; a last cue may use known video duration or a documented 1-second fallback. Mark every inferred timing. Reject or skip malformed individual events with a recorded count; if there is no valid nonempty segment, fail. Stable-sort out-of-order cues for the timed model and record that repair. Never silently clamp an out-of-bounds cue into unrelated content. Display a warning when repairs materially affect timing.

Preserve overlapping captions and exact repeated wording in the source model. In derived reading text, remove only exact duplicate cues at identical time boundaries by default. Do not perform broad string-overlap subtraction: repeated words can be intentional. An adapter-specific rolling-caption normalization requires concrete fixtures and evidence that its redundant display fragments are not independent speech; retain all source cues in Archive/SRT/VTT regardless.

Paragraph generation is a pure transformation with source cue mappings. Break at actual chapter changes, gaps of at least 2 seconds, and a target of 450–800 characters at an existing sentence boundary; enforce a 1,200-character maximum by splitting at a cue boundary. Never split a single oversized cue merely to fabricate timing. Preserve scripts without spaces; use tested Unicode-aware joining rules instead of inserting ASCII spaces between every CJK fragment. Preserve intentional repetitions and do not infer speakers.

Formatting modes: Verbatim follows timed cues; Clean uses derived paragraphs; Structured uses those paragraphs under genuine chapter headings. With no chapters, Structured has a neutral “Transcript” heading. Do not infer chapters from arbitrary timestamp-looking description text in 1.0. Validate chapter starts as increasing/nonnegative; infer ends from the next chapter or known duration. Map cues spanning a chapter boundary by start time and avoid duplicating them.

## 9. Reading, search and selection

Provide a compact header with brand, settings, theme and supported expand/close actions. Source navigation is Current Video / From URL / Batch URLs. Show only retrieved title, channel, thumbnail, duration, actual language and known caption type. Use “Title unavailable” as a UI label, not invented exported metadata.

The extraction workspace has language choice, Extract, progress by phase, Cancel and context-preserving Retry. Discovering tracks may start automatically on a supported active video; downloading the transcript requires the user's extraction action. States include idle, discovering, ready, extracting, processing, success, cancelled and typed error. Do not show fabricated progress percentages when only the current phase is known.

The reading area supports Original and Clean Reading, timestamp visibility, chapter navigation and passage selection. Use a scroll region with stable anchors and render a bounded visible window for long transcripts. Preserve focus and scroll position where possible when changing a presentation preference. Show `dir="auto"` on content text and tabular timestamp numerals.

Timestamp actions use constructed canonical HTTPS YouTube links with `t=floor(startMs/1000)`. Navigate the existing source tab only when it is still the same video; otherwise open a source link. Do not navigate an unrelated active page. Use safe external link attributes in previews.

Search uses a complete-document plain-text index, with offsets mapped back to paragraphs/cues. Default matching is case-insensitive literal Unicode text; do not interpret user input as a regex. Apply at most 100 ms debounce; show total matches, previous/next buttons, active result and accessible match announcements. Matching spans must not break surrogate pairs or graphemes. Highlight with text nodes and `<mark>`, never HTML substitution. Include matches in unrendered content; navigation scrolls/renders the target first. Very large result lists remain indexed rather than mounting every highlighted cue.

Use one explicit export-selection mode at a time:

| Mode       | Deterministic behaviour                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Full       | All nonempty source cues                                                                                   |
| Time range | Parse `hh:mm:ss[.mmm]` or `mm:ss[.mmm]`; require finite `0 <= start < end`, with end within known duration |
| Chapters   | Union of selected chapter intervals; each cue included once                                                |
| Passages   | Explicit whole-cue checkbox/range selection, also reachable from Clean Reading via source mappings         |

For range/chapter selection, include cues whose start is in the half-open interval `[start,end)`. Show that boundary rule in concise help text so partial crossing cues are predictable. Preserve complete text and original absolute timing; do not pretend to cut words at a timestamp. A cue that starts before the interval is excluded. Reject empty selections with a useful message. Do not approximate arbitrary text highlights as precisely timed subtitles. Preview and export must use the same resolved selection snapshot; show count and first/last selected cue time.

## 10. Document formatting, templates and exports

Implement a single document-generation pipeline: validate document → resolve selection → derive selected paragraphs → apply preset/options → generate format. Do not format the whole document and then filter the resulting strings. Discontinuous selections must break paragraphs and retain original source order.

### 10.1 Markdown

Clean Reading preset: title, available basic metadata, optional source link, clean paragraphs and actual chapter headings. Research preset: available detailed metadata, extraction date, chapter headings, timestamped source references by default, optional navigation and notes placeholder. Archive preset: available metadata and original timed cues with minimal transformations. Each preset has explicit defaults for metadata, timestamps and source links; user overrides are remembered. With timestamp links off but timestamps on, emit plain timestamp labels.

Escape untrusted title, channel, chapter and caption text for its Markdown context, including heading/list syntax at line beginnings, links, code delimiters, pipes and raw HTML. Do not alter the plain-text source to accomplish escaping. Metadata omission must remove absent fields rather than output `undefined`, fabricated duration or a guessed channel. Extraction date is an application-generated value from `extractedAt`, formatted explicitly and consistently.

Custom templates support only `{{title}}`, `{{channel}}`, `{{url}}`, `{{duration}}`, `{{language}}`, `{{extracted_date}}`, `{{chapters}}`, `{{transcript}}`, `{{notes}}`. Use a single-pass parser: inserted values are never recursively expanded. Scalars are Markdown-escaped; `url` is a validated canonical URL; `transcript` is generated safe Markdown; `chapters` is a heading/link index so it does not duplicate transcript body content; `notes` is an optional empty notes section. Document these exact meanings in the template editor.

No expressions, loops, imports or executable code. Unknown placeholders show a validation error and block saving until corrected; absent optional metadata expands to empty text. Cap custom templates at 50 KiB each and 50 templates, with a helpful local-limit message. Built-in templates are read-only; users can duplicate them. Support create, rename, edit, duplicate, delete custom, restore defaults and live preview. Restore defaults restores preset definitions without silently deleting custom templates; deleting all custom data belongs in privacy settings.

Render Markdown safely with raw HTML disabled. Restrict links to HTTPS YouTube sources generated by the app or validated HTTPS links in a user's template; reject JavaScript/data/file and protocol-relative links. Disable remote image rendering and embedded frames in template previews. Never feed raw HTML into `dangerouslySetInnerHTML`. Preview the entire generated document with incremental/section rendering for long output. Provide a source view for inspection and copy exactly the generated file text.

### 10.2 Other formats

| Format | Requirements                                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TXT    | UTF-8 text, selected clean or verbatim content, optional metadata/plain timestamps, no Markdown escaping artifacts                                                         |
| SRT    | Original selected cues, sequential numbers, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, blank line between cues, positive duration                                                    |
| VTT    | `WEBVTT` header and blank line, original selected cues, `HH:MM:SS.mmm` times, escaped cue markup where necessary                                                           |
| JSON   | `schemaVersion: "1.0"`, documented document fields, selected source segments, relevant original chapters, selection descriptor and timing warnings; no acquisition secrets |

SRT/VTT ignore paragraph, metadata and Markdown preset preferences; explain this in export settings. Subtitle times remain absolute relative to the source video. Do not rebase selected cues to zero. Format hours beyond 24 correctly, do not wrap at one day, preserve overlapping cues, and avoid introducing cue delimiters or markup through text. Verify with independent format parsers where practical, not just snapshot comparisons.

Use a sticky footer with Copy, Download .md and Other export formats. Settings may change the primary download format while Markdown remains easy to reach. Copy reports clipboard failures and offers a selectable text fallback. Keep the document on all export failures.

### 10.3 Files and downloads

Create Blobs in the foreground extension runner; download through `chrome.downloads.download` with `conflictAction: "uniquify"`. Keep Blob URLs alive until completion/interruption is observed or a bounded cleanup timeout, and clean up on teardown. A download ID means started, not saved successfully. Monitor completion/interruption and offer retry. Browser download APIs require the downloads permission. [Chrome downloads reference](https://developer.chrome.com/docs/extensions/reference/api/downloads)

Default stem is the retrieved title or `youtube-VIDEO_ID` when absent. Preserve valid Unicode, normalize consistently, remove Windows forbidden/control characters, trim terminal dots/spaces, reject path components and reserved device names even with extensions. Limit stems to 120 Unicode code points, truncating at a grapheme boundary; always retain a valid nonempty fallback. Treat filename patterns as a limited placeholder language, never as paths.

ZIP filenames use sanitised flat basenames; add video IDs and deterministic numeric suffixes for collisions before archiving. Reject `../`, separators and absolute archive entry paths. Combined Markdown has one batch heading, ordered video sections, explicit source attribution and correctly shifted heading levels. Prefix per-video chapter anchors to prevent collisions. ZIP/combined generation includes completed documents only and labels its successful/total count. Include a compact batch manifest with IDs/statuses and no signed URLs; never create empty “successful” exports for failed videos.

## 11. Batch coordination and recovery

Batch input accepts one URL per line and whitespace-separated pasted URL tokens. Show each validation result, duplicate count and removable item before processing; allow a maximum of 100 unique videos per run with an explanatory limit. Preserve original order. Start with one active video and one network request at a time, plus at least 1 second between videos. All open runners share that global limit; do not let separate panels multiply traffic.

Persist each item with batch/item IDs, video ID, canonical URL, preferred/selected language, status, attempt count, last safe error, timestamps and completed document ID. Durable state contains no signed caption URL. Legal states are pending, extracting, completed, no-accessible-transcript, failed and cancelled. Model interruption separately in recovery metadata and expose “Interrupted — resume available” without presenting extracting items as complete.

Use an IndexedDB transactional runner lease with owner UUID, expiry and monotonically increasing fencing token. Refresh periodically while the foreground runner is alive. Every claim/result commit verifies the fencing token transactionally. A second panel attaches as an observer or asks to resume once an old lease expires; it cannot claim work concurrently. Cancel writes a durable flag, aborts the owned request and prevents late response commits. UI request cancellation and worker cancellation carry the same run generation ID.

Persist an item claim before network work and the validated document plus completed status atomically afterward. A crash between fetch and commit leaves an interrupted item eligible for fresh discovery. Preserve completed documents across browser restart. On reopen, reclassify expired in-flight claims as interrupted, show a resumable batch and wait for Resume rather than silently starting network traffic.

Closing the only runner stops progress. Explain this while a batch is active and provide “Continue in tab” to keep a durable foreground surface available. Do not claim background operation while the browser is closed, rely on an offscreen document to stay immortal, or keep the MV3 worker alive with artificial pings. Chrome warns that service workers may terminate and global variables are lost; recovery must be based on persisted data. [Service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

Retry network errors, timeout, HTTP 429 and transient 5xx at most twice after the original attempt with 2s/4s backoff and jitter. Honor a valid `Retry-After`; if it exceeds the remaining item deadline, pause for an explicit later retry. Stop repeated requests on challenges, restrictions, schema errors or missing captions. On rate limiting, pause the queue and explain the reason. Retry failed items explicitly without discarding successes or repeating completed items.

Show per-item status, aggregate `completed / total`, failures and cancellation. Finished processing can contain failures; label it accordingly. Cancellation preserves completed results; mark unstarted pending items cancelled and allow an explicit retry. Progress changes after durable commits, never before.

## 12. Settings, retention and privacy

Settings sections: Appearance, Transcript, Export, Privacy and Data, About. Include theme; preferred language/type; default reading mode/timestamps; paragraph preference; default export format/preset; metadata, timestamps and links; filename pattern; template management; clear temporary documents; clear preferences; local usage; version and license information.

Use a versioned settings schema, validate every stored value and migrate with fixtures. Invalid fields fall back individually, with recoverable backup on migration failure. Use `storage.onChanged` to update multiple open UI surfaces. Use local storage only, not `storage.sync`. Restrict storage access to trusted extension contexts where supported. Chrome exposes storage access-level controls; verify them for the selected minimum version. [Chrome storage reference](https://developer.chrome.com/docs/extensions/reference/api/storage)

Default theme follows the OS. Apply the stored or system theme before first meaningful paint, then respond immediately to changes without resetting documents. Store preferences/templates separately from temporary transcript and batch records.

Use IndexedDB only for bounded recovery/cache, not a research-library UI. Engineering default: expire completed single-document data after 24 hours and completed batch recovery data after 7 days; retain unfinished batches for at most 7 days with a visible expiry notice. Provide “Do not retain completed transcripts” and a clear-data action. Bound transcript data at 100 MiB per extension profile; evict expired/unreferenced data first. Never evict an active document or unfinished batch silently; fail with an actionable storage message if space cannot be made. Document browser quota failures separately from this app limit. Clear transcript data atomically invalidates pending run tokens so late work cannot repopulate it.

No telemetry, third-party processing, remote fonts or remote executable assets. Requests go only to the validated YouTube hosts for acquisition and the fixed thumbnail host for display. Do not enumerate browsing history or persist unrelated URLs. Diagnostic logs use controlled codes and IDs; transcript contents, authentication state, raw response bodies and signed URLs are excluded. Export developer diagnostics only on explicit user action.

Use a packaged-code-only CSP and no inline scripts, eval or sandbox escape path. The proposed CSP is an engineering starting point that must be tested against the packaged worker and preview dependencies. [Chrome extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)

## 13. Visual design and accessibility

Implement CSS tokens for two deliberate themes:

| Token              | Light     | Dark                         |
| ------------------ | --------- | ---------------------------- |
| Background         | `#F7F9FC` | `#17191A`                    |
| Card               | `#FFFFFF` | `#222527`                    |
| Secondary/elevated | `#EAF3FC` | `#2C3032`                    |
| Input              | `#FFFFFF` | `#1E2123`                    |
| Primary text       | `#182332` | `#F2F2EF`                    |
| Secondary text     | `#66758A` | `#ADB2B4`                    |
| Border             | `#D8E4F0` | `#41474A`                    |
| Primary action     | `#2878E8` | `#EFC15B` with charcoal text |
| Accent             | `#F3C861` | `#EFC15B`                    |

Check actual token pair contrast and adjust values where required; use measured contrast when finalizing the palette. Use a system sans-serif stack or bundled licensed font, 13–14px compact controls and 14–16px transcript text with approximately 1.6 line height. Prefer 10–14px radii, restrained shadows, balanced spacing and neutral secondary controls. No blue dark theme, neon outlines, gradients or ornamental yellow overload. Create a simple original Vextra icon in SVG source and package 16/32/48/128px PNGs.

Test 320, 400, 600 and 1200 CSS-pixel widths and 200% browser zoom. Reading content scrolls independently; export actions remain reachable and do not obscure the final lines. Long metadata wraps; settings use compact logical groups and templates get an adequate editing surface. No fixed screenshot dimensions as a layout assumption.

Use native buttons, inputs, labels, fieldsets and heading structure. Segmented navigation must have correct selected states and keyboard behaviour. Provide visible focus, logical tab order, meaningful icon labels, accessible dialogs with focus return, polite live statuses and alert errors. Do not announce every progress tick. Respect reduced motion, support RTL text, and provide textual status in addition to color. Target WCAG 2.2 AA contrast and keyboard behaviour; verify with automated checks and manual keyboard/screen-reader smoke tests.

## 14. Errors and user-facing recovery

Use `VextraError { code, messageKey, retryable, phase, diagnosticId? }`. Keep raw technical details out of standard UI while preserving useful controlled diagnostics.

| Code family                                        | User-facing meaning and action                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| INVALID_URL                                        | This is not a supported YouTube video link; correct the input                                       |
| UNSUPPORTED_PAGE                                   | Open a YouTube video or use From URL                                                                |
| PERMISSION_REQUIRED                                | Explain the specific missing YouTube/extension permission and how to restore it                     |
| VIDEO_UNAVAILABLE / ACCESS_RESTRICTED              | Video cannot be accessed; no promise of bypass                                                      |
| CONSENT_REQUIRED / REQUEST_BLOCKED                 | YouTube returned a consent/challenge/access response; explain any tested ordinary navigation remedy |
| NO_CAPTION_TRACKS                                  | No accessible tracks were found in a recognised response                                            |
| DISCOVERY_CHANGED                                  | The video information format could not be recognised; do not claim there are no captions            |
| CAPTION_FETCH_FAILED / RATE_LIMITED                | Preserve video/track context; allow appropriate retry or wait                                       |
| NETWORK / TIMEOUT                                  | Check connection and retry                                                                          |
| UNSUPPORTED_CAPTION_FORMAT / INVALID_CAPTIONS      | Caption response could not be parsed safely                                                         |
| EMPTY_TRANSCRIPT                                   | No usable captions with timestamps were returned; exports remain disabled                                   |
| INVALID_SELECTION                                  | Correct the interval or select at least one passage/chapter                                         |
| STORAGE_FULL / RECOVERY_FAILED                     | Preserve current in-memory work where possible; clear old local data or export now                  |
| COPY_FAILED / EXPORT_FAILED / DOWNLOAD_INTERRUPTED | Retain document; retry or choose another format                                                     |
| CANCELLED / INTERRUPTED                            | Preserve completed batch items; offer explicit resume/retry                                         |

Use phase-based progress for discovery, fetching, processing and preparing export. Cancellation is a neutral status. An inability to abort a browser API immediately must still prevent its late result from replacing the current document.

## 15. Performance budgets and limits

Measure on a documented Windows reference machine using a production build. These budgets exclude remote response time and are acceptance targets, not claims of present performance.

| Operation              | Target                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Cold UI startup        | Ready for input within 1 second, median of 10 launches                                               |
| Large transcript       | 30,000 cues / at least 6 hours renders without mounting all cues                                     |
| Search                 | Updated count and first visible match within 200ms after debounce, p95 over 20 queries               |
| Theme/control response | Visible response within 100ms during large-document processing                                       |
| Cancellation           | UI acknowledgement within 100ms; owned fetch aborted or late commit blocked within 1 second          |
| Core formatting        | 30,000 cues to Markdown within 2 seconds in compute worker on reference hardware                     |
| UI blocking            | No repeated main-thread tasks above 50ms from parsing/search/export; record traces for exceptions    |
| Recovery               | At least one 100-item persisted batch can reopen and accurately list states without network requests |

Apply input/response/template/batch caps before expensive work and explain limits. A resource-limit error is preferable to a frozen panel or silent truncation. For very large ZIPs, estimate size, keep memory bounded, and offer individual downloads when the configured archive memory budget would be exceeded. Record measured package size and peak memory; investigate any unexplained growth. Do not add speculative caching or frameworks before profiling.

## 16. Automated and live acceptance tests

Automated core tests must run offline using sanitised fixtures. Live YouTube probes are separate, explicit and rate-limited so CI is deterministic. A passing fixture proves parsing against that fixture, not current YouTube compatibility.

| ID                         | Required measurable acceptance                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Packaging              | Manifest parses, every declared entry/icon exists, unpacked MV3 build loads without extension errors, no remote code or development server references                         |
| A02 URL handling           | All required URL forms normalize identically; hostile lookalikes, credentials, unsupported schemes, bad IDs and conflicting parameters fail before fetch                      |
| A03 Current video          | Correct ID/metadata/tracks before extraction; navigating A→B without reload updates detection and rejects stale A results                                                     |
| A04 URL extraction         | From an unrelated tab, a validated captioned URL yields actual timed captions without manual target-page navigation                                                           |
| A05 Languages              | Multiple tracks display correct actual language/type; manual preference works; explicit automatic selection wins; no translation requests                                     |
| A06 Failure classification | Fixtures for no tracks, unrecognised schema, restriction, challenge, consent, network, 403, 429, empty body and HTML-instead-of-captions yield distinct appropriate states    |
| A07 Parsers                | JSON3/XML/SRV3 fixtures preserve Unicode, entities, punctuation and timing; malformed times/markup produce warnings/errors; missing final duration is explicitly inferred     |
| A08 Integrity              | Intentional repeated phrases/overlaps survive source, JSON and subtitle output; paragraph changes leave source cue arrays unchanged                                           |
| A09 Chapters               | Only proven chapter records become headings; no-chapter output uses neutral structure; chapter boundaries do not duplicate cues                                               |
| A10 Selection              | Full/range/chapter/passage selections yield exact expected cue IDs, half-open boundary cases, source order and no empty success document                                      |
| A11 Search                 | Mixed case, RTL, CJK, combining marks and multi-cue queries are counted across all content; next/previous reaches results outside the rendered window                         |
| A12 Markdown               | All three presets have exact expected source/metadata/heading behaviour; missing fields omitted; malicious Markdown/HTML stays inert in preview                               |
| A13 Templates              | All placeholders, single-pass behaviour, unknown-token validation, built-in protection, CRUD and local persistence pass; executable-looking input never executes              |
| A14 Text/subtitles         | TXT has no escaping artifacts; SRT/VTT round-trip timing/text with independent parsers; long hours, overlap, inferred timing and literal cue markup are covered               |
| A15 JSON                   | Versioned JSON validates against schema; includes selected original timed segments and selection context; excludes signed URLs and secrets                                    |
| A16 Files/ZIP              | Reserved names, invalid characters, emoji, long names, duplicates and path traversal inputs produce safe files; independent ZIP reader verifies all expected entries/content  |
| A17 Batch                  | Mixed valid/duplicate/invalid input, partial failures, rate limit, concurrency bound, cancellation and failed-only retry preserve successful documents                        |
| A18 Recovery               | Terminate runner after claim, after fetch and after commit; restart browser; states never falsely become completed; completed records remain; Resume rediscovers expired URLs |
| A19 Multiple UIs           | Two panels/tabs cannot claim the same item; expired old owner cannot commit after lease takeover; cancellation is durable across contexts                                     |
| A20 Preferences            | All settings survive restart; migrations handle older/corrupt data; system theme changes live without transcript loss                                                         |
| A21 Local data             | Retention/caps/clear actions work; cancelled generations cannot repopulate cleared data; quota errors offer recovery                                                          |
| A22 Security               | Reject unauthorized/oversized messages, external caption redirects and unsafe links; inspect network log for only approved hosts; no analytics/remote code                    |
| A23 UX/accessibility       | Keyboard-only extract/search/select/export/settings succeeds; focus is visible; status announced; both themes at all required widths and 200% zoom remain usable              |
| A24 Performance            | Record results for every budget using 30,000-cue fixtures and worker/UI traces                                                                                                |
| A25 Real browsers          | Dated actual packaged-build checklist passes on Chrome, Brave, Edge and Vivaldi; Opera result recorded if tested                                                              |

For A25, record browser version, OS, build checksum and panel/tab variant. On each primary browser test toolbar opening, current and pasted URL extraction, language switch, SPA navigation, search, range selection, Markdown preview, all five file formats, template persistence, both themes and a mixed-result batch ZIP. Test service-worker termination separately from foreground-runner termination. Test browser restart with an unfinished batch. Use an independent ZIP/subtitle reader and inspect exported Unicode files in a text editor.

Automated extension tests should use a supported persistent Chromium profile and the actual unpacked artifact. If a branded browser cannot be automated, complete its manual matrix; do not replace it with a Chromium simulation. Record the browser versions and workflow checks covered by each validation run.

## 17. Implementation milestones and exit criteria

1. **Foundation and feasibility.** Create tooling, manifest variants, browser adapter, theme shell and source contracts. Complete URL tests, load unpacked builds, and run the live extraction gate. Exit only with documented current-page and pasted-URL evidence or a clearly identified unresolved release blocker.
2. **Source and processing.** Implement language discovery/selection, request policies, parsers, warnings, timed model and chapter adapters. Pass A02–A09 and sanitised adapter integration tests. Preserve original data before adding derived presentation.
3. **Reading workspace.** Implement original/clean modes, full-document search, timestamp navigation, virtualized rendering and all selection modes. Pass A10–A11 and initial accessibility/performance checks.
4. **Documents and downloads.** Implement presets, safe preview, templates, settings, filenames and every format. Pass A12–A16, A20 and failure-preservation tests. Demonstrate real downloads from an installed build.
5. **Batch and recovery.** Implement queue, transaction/lease fencing, bounded retry, cancellation, retention, individual/combined/ZIP outputs and restart behaviour. Pass A17–A19 and A21.
6. **Release validation.** Complete security, accessibility, performance and primary-browser matrix; fix defects; build fresh artifacts; finish installation, user, privacy and limitations documentation. Exit only when all A01–A25 requirements have evidence.

Each milestone should leave the application buildable. Maintain a concise feature checklist showing implemented, tested, externally validated and unresolved states. Do not call a subsystem verified merely because its UI or unit fixtures exist.

## 18. Build, packaging and final handoff

Provide these scripts with matching documented behaviour:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run validate:package
npm run test:browser
npm run package
```

`build` emits production panel and tab unpacked directories. `validate:package` checks manifest/resource paths, icons, CSP, extension IDs/paths, absent sourcemap secrets and no remote execution/dev references. `package` creates ZIPs from validated production output and writes SHA-256 checksums. Tests must exit nonzero on failure. Document any browser-test prerequisites without putting them in runtime installation requirements.

Use a lockfile, fixed development runtime and deterministic asset ordering. Rebuild twice in a clean environment and compare content/checksums; normalize archive timestamps if necessary or explicitly document the remaining packaging nondeterminism. Release output must be regenerated from the delivered source, not hand-edited. CI runs typecheck, lint, core/integration tests, production build and package validation; live probes are not automatic on every commit.

Installation instructions must show loading the correct unpacked directory in developer mode, pinning/opening Vextra, using tab fallback, updating by rebuilding/reloading, and removing local data. User documentation covers every workflow, actual selection boundary semantics, language fallback, batch runner lifetime and recovery, supported limits and known YouTube access failures. Explain that a transcript comes from available captions and may inherit their transcription errors.

Deliver:

- Complete maintainable source and lockfile, typed contracts and fixture provenance.
- Production unpacked directories, original icon source and packaged icons, distributable ZIPs and checksums.
- Automated test results plus dated live extraction, browser, accessibility and performance reports.
- README, architecture, installation, user guide, privacy statement, limitations and versioned JSON schema documentation.
- MIT Licence and dependency notices, preserving applicable third-party attribution and licence texts.
- A final report distinguishing completed implementation, automated verification, actual browser validation and any remaining release blockers.

Build completion alone does not authorize store publication and does not establish cross-browser support. Store submissions are outside this deliverable. All product requirements remain release requirements even where development is staged across milestones.

## 19. Evidence and source interpretation

The browser and YouTube links above support the API constraints and architectural decisions in this specification. The module layout, algorithms, privacy limits, retry defaults, data structures and acceptance budgets derive from the product requirements. Adapter fixtures, browser checks and source-compatibility records support ongoing maintenance of the YouTube integration.
