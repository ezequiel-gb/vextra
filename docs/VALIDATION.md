# Development checks

Vextra includes automated checks for caption parsing, conservative formatting, selection, templates, text exports, subtitle and ZIP parsing, JSON Schema validation, batch ownership/recovery, cancellation, retention and safe previews.

The v1.0.0 publication passed 52 unit tests and 22 integration tests, along with type checking, linting, production builds, package validation and reproducibility checks. [GitHub Actions](https://github.com/ezequiel-gb/vextra/actions) runs the project checks for published changes.

## Run the checks

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run validate:package
npx playwright install chromium
npm run test:browser -- --fixtures
```

On Windows with Edge installed, add --edge to the browser-test command. The browser suite exercises startup, themes, recovery, reading, search, preview, selection and downloads in an isolated profile.

Network probes are available with npm run test:live and npm run test:browser -- --live. Include the browser/version, public video URL, caption language/type and observed result when reporting a source-compatibility issue. See [caption availability](LIMITATIONS.md) for user-facing requirements.
