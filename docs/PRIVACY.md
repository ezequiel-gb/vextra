# Privacy

Vextra has no accounts, analytics, advertising, telemetry, paid APIs or developer-controlled processing service. Caption text is processed locally and is never sent to an independent Vextra server. YouTube requests are necessary to acquire video/caption information; thumbnail images may be loaded from i.ytimg.com.

Requested permissions: storage for preferences; scripting for a narrow packaged YouTube player snapshot; downloads for document files; sidePanel in the panel variant. Host access is limited to www.youtube.com, m.youtube.com and youtube.com. Short-host links are parsed and canonicalized locally without fetching that host. There is no cookies, history, broad tabs, debugger, webRequest or all-sites permission.

Input URLs are validated before requests. YouTube credentials are omitted from extension-origin acquisition requests. Active-page integration can read caption information already exposed by the ordinary page but does not export browser cookies, authentication headers or unrelated page state. Restricted content and browser challenges are not bypassed. The app contains no remote executable code, remote fonts or external image loading in Markdown previews.

Settings/templates stay in chrome.storage.local, not sync. Temporary documents/queues use IndexedDB with a 100 MiB app limit, 24-hour single-document expiry and 7-day batch recovery expiry. Retention can be disabled; see USER-GUIDE.md for session-only batch behavior. Local clear-data controls invalidate pending acquisition commits. Browser quota errors remain possible below the app limit.

Downloaded documents are ordinary local files and include only selected text and enabled available metadata. JSON and ZIP manifests exclude signed acquisition URLs and private request context. Removing an extension does not delete files already downloaded through the browser.

Development test reports may record public test video IDs, language/type, counts, controlled errors, browser version and timestamps. Test profiles are separate from normal browser profiles; tests do not use existing credentials. Production code does not transmit diagnostic reports or log raw transcripts.
