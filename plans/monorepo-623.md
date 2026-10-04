# monorepo-623: several apps in one Go module share one components package

- **Planner**: Claude
- **Executor**: Claude
- **Status**: in progress
- **Branch**: feat/monorepo-623 (from feat/parity-components)

## Context

Issue #623: one Go module (one `go.mod` at the repo root) with several web services under `cmd/serviceA/`, `cmd/serviceB/`, each with its own `assets/`, its own CSS and theme and its own component script bundle. The shadcn-templ components themselves should be installed once and shared.

Today the CLI assumes one app per module. `utils.ModulePath(cwd)` reads `cwd/go.mod`, and `aliasDir` maps the import path aliases to directories relative to cwd. `components.json` and `go.mod` therefore have to sit in the same directory.

**What shadcn does** (`apps/v4/content/docs/(root)/monorepo.mdx`, `packages/shadcn/src/utils/get-config.ts` `getWorkspaceConfig`, `add-components.ts` `addWorkspaceComponents`): every workspace has its own `components.json`. `add` runs in the app. `getWorkspaceConfig` resolves each alias of the app config; an alias that points into another workspace package loads that package's `components.json`, and the files of each type are written with the config of the workspace that owns their alias. ui components, hooks and libs land in `packages/ui`, app components and page targets land in the app. File paths inside `components.json` (`tailwind.css`) are relative to that file, e.g. `../../packages/ui/src/styles/globals.css`.

**Facts the plan builds on.**

- `cmd/shadcn-templ/utils/get_config.go`: `GetConfig`, `ResolveConfigPaths`, `aliasDir`, `ModulePath`. Every command loads its config through these.
- `cmd/shadcn-templ/utils/updaters/update_scripts.go`: `UpdateScripts` concatenates `<components>/*/*.js`, writes `<scripts.dir>/shadcn-templ-<hash>.js`, prunes other `shadcn-templ-*.js` there, and writes the manifest `<components>/scripts_bundle.go` with `const bundleSrc = "<scripts.path>/shadcn-templ-<hash>.js"`.
- `update_files.go` `resolveFilePath`: registry `components/...` and `blocks/...` paths go to the components dir, `utils/...` and `registry:lib` to the utils dir, a file `target` (block pages) to cwd.
- `init` only installs the `utils` lib item and the theme CSS; components come later through `add`.

## Decisions

- **`go.mod` is found by walking up from cwd, like the `go` command.** `utils.FindModule(dir)` returns the module root and the module path. `ModulePath` keeps its signature and uses it. `components.json` stays in cwd, as in shadcn (no walk up for it).
- **Aliases resolve against the module root, file paths against the `components.json` directory.** `aliases.components` and `aliases.utils` are Go import paths, so `<module>/components` is always `<module root>/components`, whatever directory the app is in. `tailwind.css`, `scripts.dir` and block page targets stay relative to the app's `components.json` directory (`ResolvedPaths.Cwd`). A single-app project has module root equal to cwd and behaves exactly as before. `ResolvedPaths.ModuleRoot` is new.
- **No `components.json` in the shared package.** shadcn needs one per workspace package because each npm package has its own tsconfig aliases. In Go one module has one import path space, so the app's aliases already name the shared directories; there is nothing a second config would add. The Go pendant of the workspace boundary is the module, and apps share components exactly when their `aliases.components` resolve to the same directory.
- **Routing stays by type.** ui components, the scripts item, `utils` and blocks go to the shared aliases. Block page `target` files go into the app directory, like shadcn's page targets. Blocks stay in `<components>/blocks/` (they are Go packages, there is no app components alias in shadcn-templ, see scripts-611 point 5); an app that wants a block private can pass `--path`.
- **CSS is per app.** Each app's `tailwind.css` gets the theme and the vendored stylesheets. This differs from shadcn's monorepo template, where the app points `tailwind.css` into `packages/ui`; in shadcn-templ that layout is still possible by pointing `tailwind.css` at a shared file, the CLI does not care.
- **One bundle content, one manifest, a copy per app.** The bundle only depends on the shared `*/*.js` files, so every app sharing the components gets the same bytes and the same hash, and one shared `scripts_bundle.go` is correct for all of them. `UpdateScripts` finds the other apps of the module that share the components dir (`utils.GetSharedConfigs`: walk the module root for `components.json`, skipping what the `go` tool skips (`.` and `_` dirs, `testdata`, `vendor`, `node_modules`) and nested modules, keep the configs that resolve to the same components dir) and writes the bundle into each app's `scripts.dir`, pruning stale bundles in each. Running `bundle` or `add` in any one app therefore never leaves another app pointing at a bundle file it does not have.
- **Different `scripts.path` for one components package is an error.** The manifest holds one URL. When two apps sharing the components configure different `scripts.path` (compared without a trailing slash), `UpdateScripts` fails before writing anything and names both `components.json` files. Different `scripts.dir` are fine and expected. Apps that need different URL prefixes use different components packages (`aliases.components`).
- **`init` in an app directory installs into the shared packages and bundles if there is something to bundle.** No `go.mod` in cwd but one above: `init` writes the app's `components.json` (aliases `<module>/components` and `<module>/utils`), creates the app's CSS, installs `utils` into the module (skipped when identical). When the shared components dir already holds component scripts, `init` runs `UpdateScripts` so the new app gets its bundle file. `init --template` inside any module, now also from a subdirectory, keeps refusing to scaffold a nested module.
- **Printed paths.** Files outside the app directory print relative to the module root (`components/button/button.templ`), files inside it relative to the app (`assets/css/globals.css`), like shadcn prints workspace files relative to the workspace root.
- **Docs.** A `monorepo` page after CLI, like shadcn's `(root)/meta.json` order, plus a cross link from `components.json` and the CLI page.

## Tasks

### 1. Module root lookup and alias resolution

- [x] Done

`FindModule` walks up for `go.mod`; `ResolveConfigPaths` resolves aliases against the module root; `ResolvedPaths.ModuleRoot`; `GetSharedConfigs`. Done when a `components.json` in `cmd/serviceA` with `go.mod` at the root resolves `components` to `<root>/components` and css/scripts to `cmd/serviceA/...`, and a single app resolves as before. Checks: `go test ./cmd/shadcn-templ/...`.

### 2. Bundle into every sharing app

- [x] Done

`UpdateScripts` returns all written bundle paths, writes the bundle into each sharing app's `scripts.dir`, prunes each, writes one manifest, errors on differing `scripts.path`. `bundle` and `add` print each path. Done when the unit tests for two apps (bundle in both dirs, one manifest, conflict error) pass. Checks: `go test ./cmd/shadcn-templ/...`.

### 3. init and add in an app directory

- [ ] Done

`init` in a subdir of a module sets up the app and bundles existing shared component scripts; `add` prints shared files relative to the module root. Done when a commands test runs init and add for two apps under `cmd/` against the in-process registry and both apps share `components/` with their own CSS and bundle. Checks: `go test ./cmd/shadcn-templ/...`.

### 4. Docs

- [ ] Done

`internal/service/content/docs/monorepo.md`, slug and sidebar link in `internal/shared/menudata.go`, links from `components-json.md` and `cli.md`. Done when the page renders through the docs slug list. Checks: `go test ./internal/...`.

### 5. End to end smoke test

- [ ] Done

Build the CLI, scratch module with two apps under `cmd/`, `init`/`add`/`bundle` for both against a local registry, `go build ./...` in the scratch module. Done when the commands and results are recorded below.

## Executor log

### Task 1

`FindModule` walks up from cwd to the closest `go.mod`; `ModulePath` wraps it. `ResolveConfigPaths` resolves aliases against `ResolvedPaths.ModuleRoot`, css and scripts against the `components.json` directory. `GetSharedConfigs` walks the module for the other apps sharing the components dir. `DisplayPath` prints app files relative to the app, shared files relative to the module root. Tests in `cmd/shadcn-templ/utils/get_config_test.go`: single app unchanged, app in `cmd/servicea` with go.mod above, shared config discovery (another components package, a foreign shadcn `components.json`, `testdata` and a nested module are excluded). `go test ./cmd/shadcn-templ/...` green.

### Task 2

`UpdateScripts` now returns every written asset path: config's app first, then each other app sharing the components dir (deduplicated by `scripts.dir`). It checks `scripts.path` of all sharing apps first and fails before writing anything on a mismatch, then writes the asset into every app's `scripts.dir`, then the one manifest, then prunes stale `shadcn-templ-*.js` in every dir. `add` and `bundle` print one `Bundle:` line per app, as a display path (relative to the app, shared files relative to the module root) instead of the absolute path. Walk cost at the repo root of this project: 970 directories after pruning, a few milliseconds per rebuild, so `bundle --watch` rediscovers apps on every build instead of caching them. Test `TestUpdateScriptsSharedComponents`: two apps with different `scripts.dir`, the bundle lands in both, the other app's stale bundle is pruned, bundling from the other app is a no-op, a differing `scripts.path` errors without writing. `go vet` and `go test ./cmd/shadcn-templ/...` green.
