# Contributing to Vextra

Useful contributions include extraction compatibility, accessibility, formatting quality, browser testing and clear bug reports.

## Set up

1. Fork and clone the repository.
2. Use Node.js 24.22.0 and run `npm ci`.
3. Run `npm run build` and load `dist/chromium-panel` through your browser's **Load unpacked** control.
4. Rebuild and reload the extension after changing source files. Development uses this build-and-reload workflow.

## Propose a change

Use an issue to describe a bug or discuss a substantial feature. Include browser/version, relevant public video URL, chosen caption language/type, steps and expected versus actual behaviour. Do not post cookies, tokens, private video contents or browser-profile data.

Keep pull requests focused. Explain the user-visible change and link the relevant issue. Preserve the local-first architecture, original caption wording/timing, source-layer boundaries and approved themes. Format TypeScript, React and styles consistently with the existing Prettier output. Add meaningful tests for behaviour changes.

Before submitting:

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run validate:package
npm run check:docs
npm audit
npm run test:reproducibility
```

For browser checks, install the Playwright Chromium runtime and run `npm run test:browser -- --fixtures`; Windows contributors can use `--edge` with installed Edge. Include the browser, video and caption language when reporting source-compatibility checks.

Keep dependencies, build output, test profiles, environment files and credentials out of commits. Release ZIPs belong in GitHub Releases. Preserve dependency notices and update them with `node scripts/notices.mjs` when dependencies change.

Report vulnerabilities privately through [SECURITY.md](SECURITY.md).
