# scripts-611: the component JS bundle becomes a build artifact in assets/js

- **Planner**: Claude
- **Executor**: Codex
- **Status**: done

## Context

Issue #611 is a feature request, not a bug report: six observations from someone porting a real project onto v2. Four of them are the same problem seen from four sides, and that problem is *when* the component JS bundle is built.

Today it is built at runtime. `components/scripts.go`, shipped verbatim into every user project by the registry `scripts` item (`registry:lib`: `components/scripts.templ`, `components/scripts.go`, `components/embed.go`), walks the components directory, concatenates every `.js` it finds, hashes it, gzips it and serves it from its own route. Everything that the issue complains about follows from that one decision:

- `//go:embed all:*` exists because the handler needs the files at runtime. Measured on `main`: 2,923,243 bytes embedded (79 `.go`, 54 `.templ`, 31 `.js`, one `.DS_Store` - the `all:` prefix takes dot files on purpose) to serve a 555,497 byte bundle. The `.go` and `.templ` files are already in the binary as compiled code; the embed adds a dead second copy of their source text.
- `isDevelopment()` exists because a runtime builder needs to know whether to rebuild per request. It reads `os.Getenv("GO_ENV") != "production"`, so an unset variable means re-concatenating 31 files on every request, `Cache-Control: no-store` and no gzip, silently and permanently.
- The hardcoded `/components/shadcn-templ-<hash>.js` exists because the handler owns the route. v1 did not have this problem: the script base path lived in a constant that the CLI rewrote at install time from `jsPublicPath` in `.templui.json` (`rewriteScriptLoaderURL`, `v1:cmd/templui/add.go:481`). v2 lost that.
- `--noshared` is asked for because `add` writes two files of serving machinery that a project with its own JS pipeline does not want.

**The shape this plan moves to already exists in this repo, twice.**

1. For CSS: `tailwindcss -i ./assets/css/globals.css -o ./assets/css/output.css --watch` in `Taskfile.yml`, output served by the asset handler.
2. For the docs site's own JavaScript: `internal/ui/pages/create.templ:157-160` renders `<script defer nonce={ templ.GetNonce(ctx) } src={ utils.ScriptURL("/assets/js/create.js") }></script>`, files in `assets/js/`, served by the asset handler, cache-busted by `utils.ScriptURL` (`utils/shadcn-templ.go:215`, `?v=<start timestamp>`).

The component bundle becomes one more file in `assets/js/`, produced by the CLI. Nothing is invented; the component JS stops being the odd one out.

**Why not go back to one script tag per component.** That was v1's design and this repo removed it deliberately in `c232777f` ("one bundle serves every component script"): it cost 50 script tags, 28 `.min.js` files, a `Script()` helper per component, an esbuild task and `jsFiles` bookkeeping in the CLI. Bundling stays. Only the moment of bundling changes.

**What shadcn/ui does.** Nothing at runtime: the CLI copies `.tsx` sources, npm carries shared code (`lib/utils.ts` is `export { cn } from "cn"` today), and the user's bundler writes an asset that the framework serves. There is no handler and no route to copy. The Go pendant of "bundler" is our CLI. The one honest divergence is the new `components.json` field below: shadcn has no pendant because its bundler decides the output path. v1 had exactly this field.

**Facts the Executor needs.**

- `components.TemplFiles` has two consumers in this repo that a user project does not have: `internal/ui/modules/docs_component_page.templ:88` renders component source on the docs pages, and `internal/registryapi/styleitems.go:105` serves every component file's content to the CLI in production. Both need the full source embedded. Deleting `components/embed.go` without replacing it stops the registry from serving components in production.
- `transformContent` (`cmd/shadcn-templ/utils/updaters/update_files.go:177-200`) already rewrites module import paths and `const developmentComponentsDir = "components"` in copied files, and rewrites `"github.com/axadrn/shadcn-templ/v2/utils"` to `config.Aliases.Utils`. Task 3 uses both.
- The scaffold's layout links CSS plainly (`layouts/base.templ.tmpl`: `<link rel="stylesheet" href="/assets/css/output.css"/>`); the docs site wraps the same path in `utils.ScriptURL`.
- `main.go` dispatches commands with a `switch` over `os.Args[1]` and one `case` per command (`cmd/shadcn-templ/main.go:96-154`).

**Not in this plan.** Issue points 4 and 5 need no code, see Decisions. `blocks/embed.go` and `internal/ui/examples/embed.go` keep their patterns.

## Decisions

- **`shadcn-templ bundle` writes one file.** It concatenates every `*/*.js` under the components directory in lexical path order, each behind its existing `// components/<path>` comment line, and writes the result to the configured scripts directory as `shadcn-templ.js`. Lexical order is what keeps `floatingui/floating_ui_core.js` ahead of `floating_ui_dom.js`, the one pair where load order matters; the comment explaining that moves with the code. Only `*/*.js`: a `.js` sitting at the components root is the user's own file and is never bundled. The file is written only when its bytes differ, so a watcher does not fight itself.
- **`add` rebuilds the bundle, `bundle --watch` is the dev-loop convenience.** `add` calls the builder when it wrote component JS (`result.HasJS()`). The watcher exists only for hand-edited component scripts and sits in `Taskfile.yml` next to `tailwind-watch`.
- **`components.json` gains one field.** `"scripts": {"dir": "assets/js", "path": "/assets/js"}` - where the file is written on disk, and the URL prefix it is served under. Both are needed and neither can be derived: `tailwind.css` names the CSS *source*, not where built assets land or how they are exposed. `init` writes the field; `add` in a project without it defaults to `assets/js` and `/assets/js`, writes the field back, and prints one line naming the file and asking the user to serve it. This is v1's `jsDir` and `jsPublicPath` under shadcn-shaped names.
- **The shipped serving code disappears; a generated manifest replaces it.** `components/scripts.go` and `components/embed.go` leave the `scripts` registry item and the repo. The item carries two files instead: `components/scripts.templ`, hand written, rendering `<script defer nonce={ templ.GetNonce(ctx) } src={ bundleSrc }></script>`, and `components/scripts_bundle.go`, written by `bundle` and headed `// Code generated by shadcn-templ bundle. DO NOT EDIT.` (Go's convention, matched exactly so `gofmt`, linters and reviewers treat it as generated), holding nothing but `const bundleSrc = "<scripts.path>/shadcn-templ-<hash>.js"`. This is an asset plus a manifest, the same split every bundler makes. Because the CLI writes the finished URL into the manifest, `transformContent` needs no rewrite rule for it at all: issue point 3 is answered by the config field alone.
- **The content hash stays in the filename, it just moves from the server to the CLI.** `bundle` writes `shadcn-templ-<hash>.js` and deletes any other `shadcn-templ-*.js` in the same directory, so exactly one bundle is ever present. Caching therefore stays what it is today: one year, immutable, busted by the name. `utils.ScriptURL` and its `?v=<start timestamp>` are deliberately **not** used here - the comment above today's `scriptsSrc` is the reason and it still holds: "query strings are ignored by some CDN caches, path hashes never are". This also matches Next, whose chunks are `/_next/static/chunks/<name>-<hash>.js` served immutable, which is what shadcn's users get.
- **No development branch survives in shipped code.** The asset handler decides disk versus embed for every asset alike. The scaffold's own handler keeps that switch and gets the fix in task 5.
- **The full-source embed stays, under its own name.** `components/source_embed.go` (repo only, listed by no registry item) carries `//go:embed all:*` as `SourceFiles` for the docs pages and the registry API. Go's embed patterns cannot reach into a parent directory, so it has to live in `components/`; being unlisted is what keeps it out of user projects.
- **`WithMode` does not land.** The functional option currently in the working tree (`components/scripts.go`, its `.tmpl`, `components/scripts_test.go`, `installation.md`) is deleted by tasks 2 and 3.
- **The two prose answers.** Point 4 (CSS layer): we already emit exactly shadcn's block, `@layer base { * { @apply border-border outline-ring/50 } body { @apply bg-background text-foreground } }` (`internal/registryapi/build.go:217`); shadcn has no named component layer and keeps `:root`/`.dark` outside every layer; the `@layer components` in `assets/css/globals.css` belongs to the docs site and never ships. Point 5 (blocks directory): shadcn flattens block files into the components directory and routes only pages elsewhere via `files[].target`; there is no top-level `blocks/` and no `aliases.blocks`. Go cannot flatten - 27 blocks carry a `page.templ`, 15 carry an `app_sidebar.templ`, and one directory is one package. `components/blocks/<block>/` stays.
- **The asset is ignored, the manifest is committed.** `assets/css/output.css` is in both `.gitignore` files and rebuilt in `Dockerfile:38`; the bundle follows that rule exactly, so `assets/js/shadcn-templ-*.js` is ignored and built. `components/scripts_bundle.go` is the exception and must be committed, or a fresh clone does not compile. The hash in the committed manifest always matches the rebuilt asset because the inputs (`components/*/*.js`) are themselves committed and the hash is a plain sha256 of the concatenation.
- **The generated manifest takes its package name from `aliases.components`.** `isComponentsRootFile` makes the registry rewrite `package components` for every file copied to the components root, but `scripts_bundle.go` is written by `UpdateScripts`, not by the registry, so it has to do that itself: a user with `aliases.components` of `internal/design` must get `package design`. Mirror `lastSegment(config.Aliases.Components)` the way `transformContent` does.
- **Nothing else changes.** No component, markup, class or demo changes.

## Tasks

### 1. The `scripts` field and the builder

- [x] Done

`cmd/shadcn-templ/utils/get_config.go`: a `Scripts` struct with `Dir` and `Path` (`json:"dir"`, `json:"path"`), a `Scripts` field on the config with `json:"scripts,omitempty"`, resolution into `ResolvedPaths` like the existing entries, and defaults `assets/js` and `/assets/js` when the field is absent. `cmd/shadcn-templ/utils/updaters/update_scripts.go`: `UpdateScripts(config *utils.Config) (path string, written bool, err error)` implementing the builder from Decisions. It concatenates, hashes the result with sha256 truncated to 8 bytes hex (what `buildBundle` does today, so the hash of an unchanged bundle is unchanged), writes `<scripts.dir>/shadcn-templ-<hash>.js`, removes every other `shadcn-templ-*.js` in that directory, and writes `<components dir>/scripts_bundle.go` with the generated-code header and the `bundleSrc` constant. Nothing is written when the hash already matches the file on disk. `init` writes the `scripts` field into the generated `components.json`. The package clause of the generated file follows `aliases.components` per Decisions.

Done when: `UpdateScripts` against this repo's own `components` directory produces exactly the 555,497 bytes that `ScriptsHandler` serves today, byte for byte, under the same hash that `scriptsSrc()` returns today, and a second run writes nothing.

Checks: `go build ./...`, `go test ./cmd/shadcn-templ/...`, and a byte comparison against a dump taken from the current handler before any other task lands.

### 2. `shadcn-templ bundle`, and `add` calls it

- [x] Done

`cmd/shadcn-templ/commands/bundle.go`: a `bundle` command with `--cwd`, `--silent` and `--watch`, in the shape of `add.go`. Without `--watch` it builds once and reports the written path; with it, it rebuilds on create, write and remove of any `*/*.js` under the components directory, debounced 100ms, one log line per rebuild. Dispatch it from the `switch` in `main.go` and document it in the help text next to `add`. `add.go` calls `UpdateScripts` after `UpdateFiles` when `result.HasJS()`, before the CSS step; the existing "Component scripts installed" line becomes one that names the written file and, when the `scripts` field had to be defaulted, says the file needs serving. `Taskfile.yml` in this repo and `cmd/shadcn-templ/templates/templ-app/Taskfile.yml` gain a `scripts-watch` task running `shadcn-templ bundle --watch` and list it in the `task --parallel` line next to `tailwind-watch`.

Done when: `shadcn-templ bundle` writes `assets/js/shadcn-templ.js` in this repo, and editing `components/accordion/accordion.js` under `task dev` rewrites it within a second.

Checks: `go test ./cmd/shadcn-templ/...`, `task dev` with a deliberate edit, `git status` clean apart from the generated file.

### 3. The shipped surface shrinks to `scripts.templ`

- [x] Done

Delete `components/scripts.go`, `components/embed.go` and `cmd/shadcn-templ/templates/templ-app/components/scripts.go.tmpl`, `.../embed.go.tmpl`. `components/scripts.templ` and its `.tmpl` twin become the hand written half from Decisions: the script tag against `bundleSrc`, nothing else, with a comment naming `scripts_bundle.go` as where that constant comes from. The `developmentComponentsDir` rewrite in `transformContent` goes away with the file it targeted, and no rewrite replaces it. In the `scripts` registry item, `components/scripts.go` and `components/embed.go` are replaced by `components/scripts_bundle.go`. `components/scripts_test.go`: render `Scripts()` and assert the tag carries the generated `bundleSrc` and the nonce, replacing the handler tests. Two existing tests assert the old shipped surface and have to follow: `cmd/shadcn-templ/utils/updaters/update_files_test.go:29,42,68` carries `components/scripts.go` as its fixture and asserts its target path, and `cmd/shadcn-templ/commands/add_scripts_test.go:84,89` asserts `internal/design/scripts.go` and `internal/design/embed.go` are written - both move to `scripts_bundle.go`, and the latter is what proves the package clause of Decisions. The comment at `update_files.go:188` names `ScriptsHandler` and needs repointing. The `GET /components/{bundle}` route leaves `cmd/shadcn-templ/templates/templ-app/main.go.tmpl:69` along with the `components` import if it is then unused.

Done when: `add`ing a JS-carrying component into a fresh scaffold writes `scripts.templ` and `scripts_bundle.go` at the components root and nothing else, and the rendered page requests `/assets/js/shadcn-templ-<hash>.js`.

Checks: `go test ./components/... ./cmd/shadcn-templ/...`, `diff components/scripts.templ cmd/shadcn-templ/templates/templ-app/components/scripts.templ.tmpl`, a scaffold smoke test.

### 4. The source embed keeps the docs site and the registry alive

- [x] Done

`components/source_embed.go`: `//go:embed all:*` as `SourceFiles`, with a comment naming its two consumers and stating that no registry item lists this file. Repoint `internal/ui/modules/docs_component_page.templ:88` and `internal/registryapi/styleitems.go:105` at `SourceFiles`. The docs site's own layout keeps `@components.Scripts()`; `cmd/docs/main.go:465` loses the `GET /components/{bundle}` route, and `assets/js/shadcn-templ.js` is served by the existing asset routes.

Done when: with `GO_ENV=production`, `/docs/components/button` still shows every source file and the registry endpoint for `button` still returns non-empty `content` for every file.

Checks: `go test ./internal/...`, `go build ./...`, `task dev` plus a manual look at the docs page and a `curl` of the registry endpoint.

### 5. The scaffold's own development switch becomes an opt-in

- [x] Done

`cmd/shadcn-templ/templates/templ-app/main.go.tmpl:60` still reads `os.Getenv("GO_ENV") != "production"` for the user's CSS, fonts, images and now the bundle, with the same silent failure the issue reports: an unset variable means disk reads and `no-store` in production. Replace it with a small named helper in that file returning `os.Getenv("SHADCN_TEMPL_DEV") == "true" || os.Getenv("TEMPL_DEV_MODE") == "true"`, with `os.Getenv("GO_ENV") == "development"` kept as a deprecated third alias and a comment saying it goes away after this minor version. Both primary forms are positive matches, so anything that is not an explicit yes serves production. The scaffold `Taskfile.yml` dev task sets `SHADCN_TEMPL_DEV: "true"` in its `env:` block; templ sets `TEMPL_DEV_MODE=true` itself before running `--cmd` under `--watch` (`cmd/templ/generatecmd/cmd.go:241`), which covers anyone not using our Taskfile. `internal/registryapi/styleitems.go` keeps its own `isDevelopment`, but its comment claims to mirror `components/scripts.go`, which no longer exists - repoint the comment at the rule itself.

Done when: a scaffolded app started with no environment variable serves assets from the embed with immutable caching, and `task dev` in the same app serves them from disk with `no-store`.

Checks: `go test ./cmd/shadcn-templ/...`, plus `shadcn-templ init` into a temp directory, then `task dev` once and `go run .` once, checking `Cache-Control` on an asset in both.

### 6. Docs and changelog

- [x] Done

`installation.md`: the serving section drops `ScriptsHandler` and `mux.Handle("GET /components/{bundle}", ...)` entirely; it now says that `add` writes `assets/js/shadcn-templ-<hash>.js` plus the generated `scripts_bundle.go`, that the `.js` is ignored and rebuilt like `output.css` while `scripts_bundle.go` is committed, that the hashed name is what makes the one-year immutable cache safe, that `@components.Scripts()` renders the tag, and that `shadcn-templ bundle --watch` keeps them fresh while editing component scripts. State the one deployment consequence plainly: a build from a clean checkout has to run `shadcn-templ bundle` before `go build`, exactly where it already runs Tailwind. Remove the `WithMode` paragraph currently in the working tree and document `SHADCN_TEMPL_DEV=true` for the asset handler with the note that `task dev` sets it. `cli.md`: a `## bundle` section in the shape of `## add`. `components-json.md`: a `## scripts` section with `scripts.dir` and `scripts.path` subsections, in the shape of the existing `## tailwind` block. Add `assets/js/shadcn-templ-*.js` to `.gitignore` and to `cmd/shadcn-templ/templates/templ-app/.gitignore` next to `assets/css/output.css`, and a `RUN` line for the bundle next to `Dockerfile:38`, so a clean build produces it the way it produces the CSS; the scaffold's README or docs say the same for the user's own deployment. A changelog entry under `internal/service/content/docs/changelog/` following the existing naming, covering the four user-visible changes: the bundle is written by the CLI, `scripts.go` and `embed.go` are gone, the served URL now comes from `components.json`, and `GO_ENV` is deprecated in favour of `SHADCN_TEMPL_DEV`.

Done when: a reader who has never seen the old behaviour can set up serving, move the URL and run the dev loop from the docs alone.

Checks: `go build ./...`, docs pages render under `task dev`, `git diff --check`.

## Executor log

### Task 1

Implemented configuration defaults/resolution, init persistence, schema, deterministic builder and alias-aware manifest. Added this repo's missing `components.json` so its own CLI/dev/Docker commands have explicit paths. The builder uses atomic replacements and propagates read/write errors; root-level, nested and `.min.js` sources are excluded. Tests cover lexical bytes/hash, unchanged mtimes, URL changes, defaults persistence and stale-bundle cleanup.

Verified against a dump taken from the original production handler before deleting it: exactly 555,497 bytes, hash `d973fedcd37cd54a`. `go build ./...` and CLI tests pass. Building after deleting the ignored asset restores the identical file. The Go manifest remains committed; the JS asset is ignored per the updated plan.


### Task 2

Added the bundle command/flags, 100ms fsnotify watcher, add integration and both Taskfiles. The repo task uses `go run ./cmd/shadcn-templ` to use this checkout's implementation. Promoted the already pinned fsnotify dependency to direct.

CLI tests pass. The watcher test covers creating a component directory plus script, writes, renames, removals and shutdown. Ran the normal Taskfile watchers; their templ watcher updated the generated Go files. Its browser proxy was blocked by sandbox port permissions, so subsequent HTTP checks used a dedicated production process and watcher behavior used filesystem integration tests. No direct templ generation or minified-asset rebuild was run.

Decision clarification: the hashed-name decision wins over the stale plain `shadcn-templ.js` wording in Tasks 2/4. Add also rebuilds when the tree includes the manifest, even when JS bytes were skipped: otherwise repeated `add --overwrite` could replace the local URL with the registry's hash. This case has an integration regression check.

### Task 3

Removed the runtime handler and component embed from the shipped surface; scripts now render the generated URL with the nonce. Updated the registry, package rewrite fixtures, install tests and repeated-add assertion. A fresh scaffold installation has the two loader files and no legacy handler/embed. The templ source and scaffold twin are identical; generated Go changes came from the normal Taskfile watcher.

`go test ./cmd/shadcn-templ/... ./components` passes. The requested full `./components/...` run has one pre-existing failure in `components/floatingui/positioning_test.go:45`: dropdownmenu contains one `strategy: "absolute"` occurrence, but the test expects two. Neither the test nor the component changed in this work. Task 3's checkbox remains open solely because its full-suite check is not green; implementation and focused checks are complete.

### Task 4

Added repo-only `SourceFiles` and switched the docs source viewer and production registry reader to it. Removed the docs bundle route and obsolete middleware path exception. The asset route now gives the hashed JS one-year immutable caching in production.

`go test ./internal/...` and `go build ./...` pass. Ran the built docs server with `GO_ENV=production` on a dedicated local port: `/docs/components/button` returns 200 with its source path and generated script URL, the button registry endpoint returns non-empty content for every file, and the JS response is byte-identical to the original handler dump with `public, max-age=31536000, immutable`. Stopped the test process afterward.

### Task 5

The scaffold defaults to embedded production assets. Explicit SHADCN_TEMPL_DEV/TEMPL_DEV_MODE enables disk serving and no-store; GO_ENV=development is the deprecated alias. The Taskfile env setting landed with Task 2. Added the scaffold's missing asset embed, which is necessary for the specified production behavior.

A subprocess integration test compiles the actual scaffold main/asset files with a minimal Go page stub (no templ generation), changes the disk asset after compilation, and checks all three dev flags, unset/unknown/false flags, embedded versus disk bytes, and Cache-Control. This replaces a manual scaffold task-dev/go-run cycle and passes. The test caught and fixed the missing leading slash after StripPrefix. Only hashed JS is immutable; unhashed CSS revalidates to avoid stale deployments. Fresh CLI scaffold installation also passes.

### Task 6

Updated installation, CLI/config documentation, both gitignores and Docker's pre-build step; added the September changelog. Documented the ignored JS versus committed manifest, clean-checkout build order, caching/compression ownership, migration from old handler files, and explicit development flags. Corrected the import-workflow page's now-invalid claim that importing a Go package alone provides the same JS setup: behavior sources must be installed locally for this CLI builder.

Final `go build ./...` and `git diff --check` pass. Production HTTP smoke checks returned 200 for installation, CLI and components-json pages. `git check-ignore` confirms the asset is ignored; the generated manifest is committed. No Docker image build was run. The unrelated pre-existing chart plan edits remain untouched and uncommitted.

Ready for Planner review. Implementation is complete; the only open checkbox is Task 3's pre-existing full-component-suite failure recorded above. No component markup, classes, JS behavior or minified assets were changed.

## Planner review

Reviewed the six commits as a whole, then ran the work end to end rather than trusting the unit tests. Verdict: all six tasks pass their "done when" line. One behaviour change nobody wrote down, one test fixed, three notes.

**Verified by running it, not by reading it.**

- Docs site, `GO_ENV=production`, port 8099: `/docs/components/button` renders `<script defer nonce="" src="/assets/js/shadcn-templ-d973fedcd37cd54a.js">`, the asset returns 200 with exactly 555,497 bytes and `Cache-Control: public, max-age=31536000, immutable`. Same bytes and same hash as the deleted handler produced.
- A fresh `init -t templ` against that registry: the components root holds `scripts.templ` and `scripts_bundle.go` and nothing else, `components.json` carries `"scripts": {"dir": "assets/js", "path": "/assets/js"}`, `.gitignore` carries `assets/js/shadcn-templ-*.js`, and the bundle is 165,739 bytes - only the installed components, not the repo's 555,497.
- `add chart` in that project rebuilt to `shadcn-templ-2304792db21c25b8.js`, rewrote the manifest constant and deleted the previous asset. Stale cleanup works.
- That scaffold compiles and runs. With no environment variable at all it serves the bundle with `public, max-age=31536000, immutable`; with `SHADCN_TEMPL_DEV=true` and again with `TEMPL_DEV_MODE=true` it serves `no-store`. The inverted default from task 5 holds in a real binary.

**Finding: gzip is gone, and it was load bearing.** The deleted handler compressed the bundle once at startup, behind a comment saying it existed so "bare Go deployments without a compressing proxy still ship ~5x smaller transfers". The asset route does not compress: verified with `Accept-Encoding: gzip`, no `Content-Encoding` in the response, full 555,497 bytes on the wire against 130,009 gzipped. A deployment behind Caddy, nginx, Cloudflare or any CDN loses nothing, and this is also how Next behaves - static chunks are compressed by the platform, not by the framework. A bare `go build` deployment now ships 4.3x more. `installation.md:305` states the new ownership ("Compression belongs to your asset server or proxy"), so it is documented rather than silent, and neither the plan nor this review asked for it to be kept. Flagged for the owner to accept or to answer with gzip middleware in the scaffold's asset handler.

**Fixed while reviewing: `components/floatingui/positioning_test.go:45`.** Not this work's doing and red on `origin/main` too. Commit `8efbc29a` (19 September, "menu-regressions 1: restore fixed submenu positioning") moved the dropdown's sub content from `absolute` to `fixed` in both `.js` and `.templ` because `absolute` put it under the popup's overflow clip; its plan said "exactly two source lines. Nothing else", so the assertion counting two `strategy: "absolute"` occurrences was never updated. The test now asserts one `absolute` and one `fixed` in `dropdownmenu.js` plus the `hidden fixed inset-auto left-0 top-0` class in the template, which is the shape it already uses for the context menu. `go test ./...` is green.

**Notes, none blocking.**

1. `UpdateScripts` with no component JS at all writes a zero byte asset and a manifest pointing at it. `add` only calls it behind `HasJS()` or an existing manifest, so this is reachable only through a bare `shadcn-templ bundle` in a project with no scripts yet. Harmless, slightly odd.
2. The builder's atomic write, the `.min.js` skip, the `*/*.js` shape and the alias aware package clause all match Decisions, and the temp files (`.bundle-*`) carry no `.js` suffix, so the watcher cannot retrigger itself on its own writes.
3. Task 2's log records a deviation worth keeping visible: `add` rebuilds whenever the tree contains the manifest, not only when JS bytes changed, so a repeated `add --overwrite` cannot leave the registry's URL and hash in a local project. That is the right call and it has a regression test.

**Close, 2026-10-04.** Task 3's box is checked: its only open check was the `positioning_test.go` failure fixed above, `go test ./...` is green. The gzip finding is accepted as documented (`installation.md`: compression belongs to the asset server or proxy), owner decision to work through plans without check-ins. Status done.

