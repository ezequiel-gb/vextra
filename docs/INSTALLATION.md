# Installation and updating

Download [Vextra-1.0.0-chromium.zip](https://github.com/ezequiel-gb/vextra/releases/download/v1.0.0/Vextra-1.0.0-chromium.zip) from [GitHub Releases](https://github.com/ezequiel-gb/vextra/releases). See [caption availability and compatibility](LIMITATIONS.md) for source and browser requirements.

Extract the distribution ZIP first. Open your Chromium browser’s extensions manager, enable Developer mode, choose Load unpacked and select the folder containing `manifest.json`. In a source checkout this is `dist/chromium-panel`. Pin Vextra and click the toolbar icon. The browser’s side panel should open; the header’s arrow opens an expanded Vextra tab.

Use `dist/chromium-tab` if the browser rejects the side-panel manifest or cannot open the panel. Remove the other variant first to avoid independent extension copies with independent local storage. This fallback uses the same compiled app with a different manifest.

To use Current Video, keep the YouTube video as the active tab in the same browser window and use the side panel. An expanded Vextra tab itself becomes the active tab, so use From URL there. Link recognition includes watch, mobile, short-host, Shorts, live and embed video forms. Playlists and arbitrary domains are not supported.

To update a source checkout: run `npm ci`, the documented checks and `npm run build`, then use Reload in the browser’s extensions manager. Reload YouTube tabs after updating if needed. Browser testing uses fresh isolated profiles because previously registered workers may cache code while a build folder is overwritten.

To remove stored data, use Settings → Privacy and data → Clear temporary transcripts. Reset preferences and templates separately if desired. Uninstalling Vextra removes the extension’s local profile data through the browser. Downloaded documents remain in your Downloads folder.

The extracted folder must remain available after installation. Use the named Chromium ZIP rather than GitHub's automatic source-code archives. Store installation and automatic updates are not currently provided.
