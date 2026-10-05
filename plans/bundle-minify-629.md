# bundle-minify-629: minify the component bundle like `next build`

- **Planner**: Claude
- **Executor**: Claude
- **Status**: in progress

## Context

Issue #629. `shadcn-templ bundle` concatenates every component script into `shadcn-templ-<hash>.js` (`cmd/shadcn-templ/utils/updaters/update_scripts.go`). With the goilerplate component set that is 613 KB raw and 146 KB gzipped, esbuild minify brings it to 244 KB and 79 KB.

**The shadcn pendant.** shadcn ships source (`.tsx`) and leaves minifying to the app's bundler: `next dev` serves readable code, `next build` minifies for the browsers in Next's default target (`next/dist/shared/lib/modern-browserslist-target.js` at the pin, Next 16.3: `chrome 111`, `edge 111`, `firefox 111`, `safari 16.4`). A templ app has no Next or Vite, `bundle` is its bundler. So the component sources stay readable in the project, like shadcn's, and only the bundle the browser loads is minified, like `next build`.

**When the bundle is written.** Always on the developer's machine, never at runtime: `init` and `add` (when they write scripts), `bundle --watch` (the `task dev` loop, at start and on every change) and `bundle` (`task build`, the Dockerfile). The server only serves the file.

## Decisions

- **esbuild's Go API** (`github.com/evanw/esbuild/pkg/api`, `api.Transform`), no Node. Whitespace, syntax and identifier minification, `Engines` set to Next's default target, legal comments kept inline.
- **Per file, then concatenated.** Each script is transformed on its own with `Sourcefile: components/<dir>/<file>.js`, so a syntax error names the component file and line. Without a format, esbuild keeps top-level names, so the scripts that share globals across files (`window.templ`, the Floating UI UMD builds) are unaffected.
- **Minified by default, `--watch` unminified.** `init`, `add` and `bundle` minify; `bundle --watch` writes today's readable concatenation with the `// components/...` headers, like `next dev`. No new flag.
- **Deterministic, named by the sources.** Same sources, same bytes on every machine: esbuild's transform output depends only on its input and options. The file name hashes the readable sources, not the minified output, so `task dev` and `task build` write the same name and the committed `scripts_bundle.go` does not flip between them. Dev and production are different origins, so the immutable cache never mixes the two files, and both run the same code.
- **Docs and changelog.** `cli.md` and `installation.md` say when the bundle is written and that it is minified except under `--watch`; a changelog entry for the release.

## Tasks

### 1. Minify in UpdateScripts

- [x] Done

`UpdateScripts(config, minify bool)`. `init` and `add` pass true, `bundle` passes `!opts.Watch`.

Done when: the minified bundle is smaller, valid, deterministic, keeps top-level names, reports a syntax error with its component file, and the unminified path is byte-identical to today's.

Checks: `go test ./cmd/shadcn-templ/...`, `go build ./...`, a minified bundle of this repo's components parses with `node --check`.

### 2. Docs and changelog

- [ ] Done

Done when: `cli.md`, `installation.md` and a changelog entry describe the minified bundle and the unminified watcher.

Checks: the docs pages render on the dev server.

### 3. Release

- [ ] Done

PR, merge, tag `v2.0.0-beta.13`, GitHub release in the beta.12 shape. The owner asked for the release on 2026-10-05.

Done when: the release is published and #629 is closed by the PR.

## Executor log

### Task 1 (Claude, 2026-10-05)

`UpdateScripts(config, minify)` with esbuild v0.28.2, `minifyScript` per file, errors as `components/<dir>/<file>.js:<line>:<col>: <text>`. Deviation from the first draft: the name hashes the sources (see Decisions), found while reading the docs, which tell users to commit the manifest.

This repo's components: 966,893 bytes raw and 227,273 gzipped unminified, 386,898 and 119,596 minified. `node --check` passes; two runs give the same file. jsdom over 21 previews (dialog, sidebar, tooltip, select, combobox, dropdown menu, popover, drawer, slider, tabs, accordion, toast, navigation menu, context menu, hover card, input otp, carousel, resizable, menubar, chart, command dialog), same served HTML for both bundles: the `window.templ` API and every attribute after init are identical, no new error (command-dialog throws jsdom's missing `scrollIntoView` with both). Chromium and WebKit do not start on this machine (missing system libraries), so no Playwright run.

Checks: `go test ./cmd/shadcn-templ/...`, `go vet`, `go build ./...` pass.

## Planner review
