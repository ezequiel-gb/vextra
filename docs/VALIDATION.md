# Development checks

Vextra includes automated checks for caption parsing, conservative formatting, selection, templates, text exports, subtitle and ZIP parsing, JSON Schema validation, batch ownership/recovery, cancellation, retention and safe previews.

[GitHub Actions](https://github.com/ezequiel-gb/vextra/actions) runs the deterministic project checks for published changes. Fixture-based checks cover the installed extension and document workflows; live acquisition checks separately exercise YouTube's current responses.

## Run the checks

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run validate:package
npm run check:docs
npm audit
npm run package
npm run test:reproducibility
npx playwright install chromium
npm run test:browser -- --fixtures
```

On Windows with Edge installed, use `npm run test:browser -- --edge --fixtures`. Add `--tab` to test the tab fallback. The browser suite exercises startup, themes, recovery, reading, search, preview, selection and downloads in an isolated profile. Generated reports are written under the ignored `artifacts/` directory, with browser channel and manifest variant in their filenames.

Run `npm run test:live -- VIDEO_ID` for a credential-free Node acquisition probe, `npm run test:browser -- --edge --live` for the installed extension's From URL and player-snapshot checks, and `node scripts/test-native-extension.mjs` for the packaged native-panel reader. The native-panel check uses the public video ID defined in that script. A successful player snapshot or track list does not establish successful transcript extraction: confirm non-empty parsed cues and the selected language/type.

Record the date, browser/version, public video ID, caption language/type, execution context, cue count or exact failure code, and build/package checksum when reporting source compatibility. Keep cookies, signed caption URLs, authentication headers and private transcripts out of reports. Reports under `artifacts/` are local evidence and are not shipped in source or installation archives. See [caption availability](LIMITATIONS.md) for user-facing requirements.

## Live URL and batch regression

After building, run the installed-extension comparison with at least two public videos that expose captions in the test session:

```sh
node scripts/test-url-batch-live.mjs --edge M8j_Py_TQ9k P0887k67PF4 uU2WeAX2w8g
```

Omit `--edge` to use Playwright Chromium. A fresh-profile consent prompt can block live acquisition. For repeat runs, `VEXTRA_TEST_PROFILE` may point to a dedicated test profile under this project's `.profiles` directory where YouTube consent has already been reviewed. Normal user browser profiles are rejected. Production code and this harness do not make consent decisions. This creates an isolated test profile, extracts each video through From URL before opening its Current Video comparison page, compares all source segments, and downloads JSON and Markdown. It then runs a batch containing two captioned URLs and one unavailable URL, checks individual statuses, and independently reads the downloaded ZIP and combined Markdown. Live source availability can change; the test fails if captions are unavailable rather than substituting fixtures. The named videos are public regression examples, not bundled transcript data.
