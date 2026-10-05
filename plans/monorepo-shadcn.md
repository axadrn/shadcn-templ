# monorepo-shadcn: the monorepo as shadcn's, workspace by workspace

- **Planner**: Claude
- **Executor**: Claude
- **Status**: done
- **Branch**: `feat/monorepo-shadcn` from `main` at `v2.0.0-beta.11`, owner decision 2026-10-05 ("mache es einfach 1:1 shadcn pendantisch, skalierbar, idiomatisch, grug brain, clear statt clever")

## Context

`plans/monorepo-623.md` and `plans/init-monorepo.md` shipped in `v2.0.0-beta.11` with a model of our own: the shared components have no `components.json`, every app carries its own CSS and theme, apps alias the shared `components` and `utils` directly, and each app may pick its own style. Testing the release showed what that costs: the docs' second app (`--preset vega`) compiles the shared components in another style than the first (`base-nova`), against the docs' own requirement.

shadcn's model (`apps/v4/content/docs/(root)/monorepo.mdx`, `templates/next-monorepo/`, `packages/shadcn/src/utils/get-config.ts` `getWorkspaceConfig`, `commands/init.ts` design settings propagation, `utils/add-components.ts` `addWorkspaceComponents`):

- `apps/web` and `packages/ui` are workspaces, each with its own `components.json`.
- The app's aliases: `components` and `hooks`/`lib` app local, `ui` and `utils` into the ui package. The ui package's aliases all point into itself.
- `getWorkspaceConfig` resolves every alias to the workspace that holds it (the closest `components.json` above the alias' directory) and loads that config.
- `add` run in the app installs each file with the config of its target workspace: `registry:ui` files and lib/utils into `packages/ui` with ui's config (its style), blocks and pages into the app. Imports are rewritten to the aliases of the importing side.
- The theme lives once in `packages/ui/src/styles/globals.css`; the app's `tailwind.css` points at it (`../../packages/ui/src/styles/globals.css`), the ui package's globals.css `@source`s the apps and itself.
- Requirement: the same `style`, `iconLibrary` and `baseColor` in both files. `init` propagates `menuColor`, `menuAccent`, `rtl` and `iconLibrary` to the other workspaces' `components.json`.

## Decisions

- **Same workspaces, Go paths.** `init --monorepo` scaffolds one Go module (one `go.mod`, `go.work` is not needed) with `apps/web` and `packages/ui`. Each has a `components.json`. `packages/ui` holds `components/`, `utils/` and `styles/globals.css` (Go has no `src/` convention; the rest is shadcn's layout). Import paths: `<module>/packages/ui/components/<name>`, `<module>/packages/ui/utils`.
- **One new alias: `ui`.** `Aliases` gets `UI` (`"ui"`), shadcn's alias for ui components. Unset means the components alias, so every single-app `components.json` stays valid and resolves exactly as before. App: `components` = `<module>/apps/web/components` (blocks and app parts), `ui` = `<module>/packages/ui/components`, `utils` = `<module>/packages/ui/utils`. ui package: `components` = `ui` = `<module>/packages/ui/components`, `utils` = `<module>/packages/ui/utils`.
- **Workspace config like getWorkspaceConfig.** For each alias the CLI finds the closest directory with a `components.json` above the alias' directory (stopping at the module root); if that is not the app, it loads that config. No walking of the whole module for discovery.
- **add routes files by target workspace.** `registry:ui` and lib files (and the component JS and `scripts_bundle.go`) go to the ui workspace with its config (its style, its icon library); blocks, pages and other app files go to the app. Imports in installed templ/Go files are rewritten by kind: ui component imports to the `ui` alias, utils to `utils`, block-local to `components`.
- **CSS once, in the ui package.** Theme and CSS variables are written to the ui workspace's `tailwind.css`; the app's `tailwind.css` points at the same file (`../../packages/ui/styles/globals.css`). The ui globals.css carries `@source "../../../apps";` and `@source "..";`. An app that wants its own theme points `tailwind.css` at its own CSS file that imports or replaces the shared one (documented like shadcn's apps can).
- **The bundle.** The component JS lives in the ui package, so the bundle is built from it and `scripts_bundle.go` sits in the ui components package. Every app whose `ui` alias resolves to that package gets the bundle in its own `scripts.dir`; apps sharing a ui package use the same `scripts.path` (one manifest), a different one stops with an error as before. Apps are found from the ui package side by the apps' configs, keep it simple: the module walk from monorepo-623 stays only for this, keyed on the `ui` directory.
- **init.**
  - `init --monorepo` writes both configs from the preset (ui first, then the app), installs the base item into the ui package, the app's `tailwind.css` points at the ui CSS.
  - `init` in an app below a module that already has a ui workspace (an app whose would-be `ui` alias resolves to an existing ui `components.json`) writes the app's config with the `ui`/`utils` aliases into that package and its `tailwind.css` pointing at the ui CSS, then propagates `menuColor`, `menuAccent`, `rtl` and `iconLibrary` to the other workspaces' `components.json`, exactly shadcn's set. Style is not propagated (shadcn's requirement 3 is documented, like shadcn).
- **Dev ports.** Each app's `task dev` picks a free app port (already) and a free templ proxy port (`--proxyport`), so two apps run side by side like shadcn's `turbo dev`.
- **Single app unchanged.** No `ui` alias, no workspace lookup beyond the app itself: byte for byte the same files, configs and output as `v2.0.0-beta.11`.
- **Migration from beta.11's model** is a release note: move `components/` and `utils/` into `packages/ui/`, add `packages/ui/components.json`, set the app aliases.
- **The ui package has no `scripts` block** (Executor, task 1). shadcn's `packages/ui/components.json` has nothing app-like, and the ui package serves no bundle. A `components.json` with `aliases.ui` and without `scripts` is a library workspace: `Config.Scripts` stays nil, no defaults. Without `aliases.ui` a missing `scripts` block keeps getting the defaults (the beta.10 migration), so every existing config resolves as before.
- **Routing by registry path** (Executor, task 2). shadcn routes by file type (`registry:ui` to ui, `registry:hook`/`registry:lib` to hooks/lib, the rest to components). Our registry paths say the same for every installable kind (`components/` holds `registry:ui` and the `scripts` lib item, `utils/` the utils lib, `blocks/` the block components and pages) except `registry:example` (`component-example`, `example`), which live under `components/` and import ui packages and each other as one tree of Go packages. So `components/` goes to the ui workspace, `utils/` and `registry:lib` to the utils workspace, file targets, `blocks/` and the rest to the app. Imports follow the same split, so a Go import never points into the wrong workspace.
- **One tree, the ui workspace resolves it** (Executor, task 2). shadcn resolves the registry tree with the app config and transforms each file with its target config; its requirement 3 makes the style the same anyway. Our style, menu color and rtl are resolved by the registry at fetch time for the whole tree, so the tree is fetched with the ui workspace's config (the main target, like `mainTargetConfig` for the CSS). The shared components therefore always install in the ui package's style, whichever app runs `add`.
- **An app finds the ui workspace at `packages/ui`** (Executor, task 3). shadcn's `init` in an existing app reads the app's tsconfig paths to know its aliases; a Go app has none before its `components.json` exists. So `init` in an app below a module with `packages/ui/components.json` joins that workspace, the layout `init --monorepo` scaffolds; the aliases themselves are read from the ui config. Without it `init` writes the single-app or beta.11 config as before. Re-init keeps the existing aliases (`ui` travels with `components`).
- **apply syncs the linked workspaces too** (Executor, task 3), `syncApplyWorkspaceConfigs`: `style`, `tailwind.baseColor`, `tailwind.cssVariables`, `iconLibrary`, `rtl`, `menuColor`, `menuAccent` into the other workspaces' `components.json` unless `--only` excludes the theme. shadcn syncs after the install; here before it, because the ui workspace resolves the tree.
- **The workspace lookup stops at the module root and starts at the alias directory itself** (Executor, task 1). shadcn's `findPackageRoot` globs `package.json` below the common root; the Go pendant walks up from the alias directory to the closest `components.json`. The app itself, or no `components.json` up to the module root (a beta.11 app sharing root `components/`), means the app's own config, so single apps and beta.11 monorepos are their own workspace.

## Tasks

### 1. Config: ui alias and workspace configs
- [x] Done

### 2. add: route files and imports by workspace
- [x] Done

### 3. init: --monorepo scaffold as apps/web plus packages/ui, init in an app, design settings propagation
- [x] Done

### 4. Bundle keyed on the ui package, dev proxy ports
- [x] Done

### 5. Docs: monorepo page 1:1 with shadcn's sections and examples (Go)
- [x] Done

### 6. Verification
- [x] Done

Unit tests per task. End to end with a CLI built from the branch against the local registry: `init demo --monorepo`, `add button dialog combobox sidebar-07 --cwd apps/web` (sidebar-07 is a block: it must land in `apps/web/components/blocks/` with imports into `packages/ui`), a second app `init --cwd apps/admin`, `add popover --cwd apps/admin`, `task build`, both apps served, each page checked in Chromium (dialog opens, combobox selects, popover opens, no console errors), `task dev` for both apps side by side on free ports, the Docker build. Single-app scaffold: `init`, `add`, `task build` unchanged.

## Executor log

### Task 1

`utils.Aliases.UI` (`"ui,omitempty"`, so a config without it writes byte for byte as before), `RawConfig.UIAlias()` (ui, else components), `ResolvedPaths.UI`. `utils.WorkspaceConfig` {Components, UI, Utils} and `GetWorkspaceConfig`, the `getWorkspaceConfig` pendant: per alias directory the closest `components.json` at or above it up to the module root, loaded unless it is the app itself. A config with `aliases.ui` and no `scripts` is a library workspace (Decisions). `static/schema/components.json` gains `aliases.ui`. Test `TestGetWorkspaceConfig`: apps/web plus packages/ui resolve ui and utils to the ui config, components to the app, the ui config to itself and without scripts; a single app and a beta.11 app under `cmd/` are their own workspace with default scripts. `go test ./cmd/shadcn-templ/...` green.

Environment: the branch `feat/monorepo-shadcn` is checked out in the main checkout, so this worktree works on `feat/monorepo-shadcn-exec` from `origin/feat/monorepo-shadcn`; it fast forwards onto `feat/monorepo-shadcn`.

### Task 2

`addComponents` loads `GetWorkspaceConfig` once; the ui workspace is the main target: its style, menu color and rtl resolve the tree, its `tailwind.css` takes the CSS and the vendored stylesheets land next to it. `UpdateFilesOptions.Workspace`; `targetConfig` (the `getTargetConfigKeyForFile` pendant, by registry path, see Decisions) picks the config per file, `resolveFilePath` and `transformContent` run with it: `components/` to `ResolvedPaths.UI`, imports of `components/...` to `aliases.ui`, `blocks/...` to `aliases.components` + `/blocks`, the ui root package name from `aliases.ui`. In a workspace install the summary prints paths relative to the module root, like shadcn's workspace root. `apply` lists installed components in the ui dir. A single app has every workspace equal to itself, so its files, imports and output are unchanged. Test `TestUpdateFilesWorkspace` (apps/web plus packages/ui): ui component, its JS, `scripts.templ` and utils in `packages/ui`, the sidebar07 page in `apps/web/components/blocks/sidebar07` importing `packages/ui/components/sidebar` and its own block package under `apps/web/components/blocks`, nothing at the module root. `go test ./cmd/shadcn-templ/...` green. The bundle is still keyed on `aliases.components` until task 4.

### Task 3

Template `templ-monorepo`: `components/scripts.templ` moved to `packages/ui/components/`, the app's `assets/css/globals.css` replaced by `packages/ui/styles/globals.css` (`@import "tailwindcss"`, `@source "../../../apps"`, `@source ".."`), the app layout imports `<module>/packages/ui/components`, the home page `<module>/packages/ui/components/componentexample`, the app Taskfile runs Tailwind with `-i ../../packages/ui/styles/globals.css`. `init --monorepo` writes `packages/ui/components.json` first (same preset, aliases into itself, `tailwind.css` `styles/globals.css`, no scripts), then the app's: `components` `<module>/apps/web/components`, `ui` and `utils` from the ui config, `tailwind.css` `../../packages/ui/styles/globals.css`, default scripts. The same join runs for any app below a module with `packages/ui/components.json` (`joinUIWorkspace`). After writing the app config `syncWorkspaceConfigs` propagates `menuColor`, `menuAccent`, `rtl`, `iconLibrary` (init.ts' set, style not) into the other workspaces; `apply` uses the same helper with `syncApplyWorkspaceConfigs`' set. The base item and `component-example` install through the app config, so the workspace routing of task 2 puts the theme into the ui CSS and `utils` and `component-example` into `packages/ui`. A single app has no other workspace and no `packages/ui`, its init is unchanged. Test `TestInitMonorepoScaffold` rewritten: the layout and both configs, nothing at the module root, `add button dialog sidebar-07` from `apps/web` (ui components in `packages/ui`, the block in `apps/web/components/blocks/sidebar07` importing `mono/packages/ui/components/sidebar`), `init` of `apps/admin` with `--preset maia` (joins, `iconLibrary` hugeicons propagates to `packages/ui`, its style does not, `apps/web` untouched), `add popover` from admin into `packages/ui`, `apply vega` in `apps/web` syncing `packages/ui` to `base-vega`. `TestMonorepoAppsShareComponents` (the beta.11 layout) passes unchanged. `go test ./cmd/shadcn-templ/...` green.

### Task 4

`UpdateScripts` bundles `<ui dir>/*/*.js` and writes `scripts_bundle.go` into the ui components package (package name from `aliases.ui`). The apps it serves are config itself when it has scripts plus `GetSharedConfigs`, now keyed on `ResolvedPaths.UI` and leaving out library workspaces; run from `packages/ui` it bundles for the apps that use it and writes nothing into the ui package, with no app it does nothing. The `scripts.path` check compares all those apps and names `aliases.ui` in its error. `bundle --watch` and init's "components already carry scripts" check look at the ui dir. Single app and beta.11 apps: the ui dir is the components dir, so the walk, the bundle and the manifest are the same as before. `apps/web/Taskfile.yml` of the monorepo template: `FREE_PROXY_PORT` from 7331 up like `FREE_PORT` from 8090, `PROXY_PORT` overridable, passed as `--proxyport`. `TestInitMonorepoScaffold` gained the bundle checks: after `add` in `apps/web` the bundle holds `components/dialog/...` from `packages/ui`, the manifest is `packages/ui/components/scripts_bundle.go` naming it, nothing in `apps/web/components/scripts_bundle.go` or `packages/ui/assets`; `apps/admin` gets the same bundle on init; `add popover` from admin renews both apps' bundle and the manifest; `bundle --cwd packages/ui` passes without writing a scripts block or assets into the ui package. `go test ./cmd/shadcn-templ/...` green.

### Task 5

`monorepo.md` follows `(root)/monorepo.mdx` section by section: intro, Getting started (Create a new monorepo project with `init my-app --monorepo` and "two workspaces: `web` and `ui`", Add components to your project with shadcn's `button` and `login-01` examples on our paths, Importing components from `my-app/packages/ui/components/button` and `my-app/packages/ui/utils`), File Structure (apps/web plus packages/ui), Requirements 1 to 4 (a `components.json` per workspace; both configs as `init` writes them; same `style`, `iconLibrary`, `baseColor`, with what `init` and `apply` propagate; shadcn's Tailwind v4 point becomes the `@source` lines of the ui CSS) and the closing sentence. Kept as Go additions: an "Add another app" step (copy, `init --cwd apps/admin` joins `packages/ui`, one Taskfile include, ports picked per app), a callout on an app's own theme, and the Scripts section (one bundle from `packages/ui` into every app, same `scripts.path`). shadcn's `package.json#imports` section has no Go pendant and is left out. `components-json.md` gains `aliases.ui` (shadcn's wording), the `scripts.path`, `cli.md` and `installation.md` mentions say ui package. The page renders at `/docs/monorepo` with its TOC on a docs server built from this branch; `go test ./internal/...` green.

### Task 6

Scratch `S=$CLAUDE_JOB_DIR/tmp/mshadcn`, `GOTMPDIR`/`TMPDIR` in the job dir. The main checkout's docs server on 8090 was not listening during the whole run (not touched), so the registry was a docs server built from this branch on 8198 (`PORT=8198 GO_ENV=production`, started and stopped by pid). CLI `go build -o $S/cli ./cmd/shadcn-templ`.

Fixed during the run (this commit):
- `apps/web/Taskfile.yml` of the monorepo template. templ runs `--cmd` in its `-path`, so `go run .` ran at the module root ("no Go files"); now `--cmd="cd '{{.TASKFILE_DIR}}' && go run ."`. `task dev PORT=...` did not reach the nested `task --parallel`, which picked its own ports (also 8090); the picked `PORT` and `PROXY_PORT` are now passed on. Both were already wrong in beta.11's monorepo template, which was never run with `task dev`.
- The monorepo `Dockerfile` uses `golang:1.26`: `go mod tidy` raises the scaffold to `go 1.26.0` (shadcn-templ's own go.mod requires it, beta.11 too) and `golang:1.25` with `GOTOOLCHAIN=local` refuses that module.

Results:
- Single app against beta.11 (`$S/bin/shadcn-templ`, `go install ...@v2.0.0-beta.11`), same commands with both CLIs: `init single -t templ` plus `add button dialog combobox sidebar-07 popover`; a `go mod init` module with `init --preset vega`, `add button dialog sidebar-07`, `bundle`; the beta.11 layout `cmd/a` and `cmd/b` with `init`, `add`, `bundle`. 218 files including every command's output: identical, except `assets/css/globals.css` in two places, where only the position of the `.dark` block differs (same sorted lines). beta.11 itself writes either order run to run (`update_css.go` ranges over a map of `:root` and `.dark`), measured 2 of 4 runs each way; the branch CLI shows the same two variants. Single scaffold `task build` with the branch as tool: OK, the bundle hash unchanged.
- Monorepo: `init demo --monorepo`, `add button dialog combobox sidebar-07 --cwd apps/web` (ui components in `packages/ui/components`, `sidebar07` in `apps/web/components/blocks/sidebar07` importing `demo/packages/ui/components/...`), `apps/admin` copied from `apps/web` without `components.json`, `components` and bundle, import paths changed, `init --cwd apps/admin` (joins `packages/ui`, its bundle written, `apps/web`'s renewed), `add popover --cwd apps/admin` (2 created, 15 skipped, both apps' bundle renewed), both configs as in the docs, the theme only in `packages/ui/styles/globals.css`. Pages: web renders a dialog and a combobox, `/sidebar` the sidebar-07 block, admin a popover. `go mod edit -replace github.com/axadrn/shadcn-templ/v2=<worktree>`, `go mod tidy`, root `task build` (web and admin: Tailwind from the ui CSS, 93457 bytes each, `bundle`, `templ generate -path ../..`, `go build`): OK.
- Served `apps/web/bin/app` on 8197 and `apps/admin/bin/app` on 8199. Chromium (Playwright from `parity/node_modules`, the script in `$S` since this worktree cannot write into the main checkout): dialog opens with `data-open`, combobox selects `htmx`, the sidebar-07 block renders, popover opens, 0 console errors, 0 page errors. Stopped by pid.
- `task dev` side by side: `apps/web` with `PORT=8197 PROXY_PORT=7397`, `apps/admin` with `PORT=8199` and the proxy port picked automatically (7332, since 7331 is taken). Both proxies serve, the same Chromium check against the two proxies passes with 0 errors. Both process groups stopped.
- `docker build` of the monorepo scaffold (the branch CLI copied into the context as `_cli` with a replace, one extra `COPY _cli ./_cli` before `go mod download` in the test copy only): OK, `task web:build` inside; the container served `/`, the bundle and `output.css` with 200. Container and image removed.
- `go build ./...`, `go vet ./cmd/shadcn-templ/...`, `go test ./cmd/shadcn-templ/... ./internal/...` green, `git diff --check` clean.

Open:
- The single-app scaffold's `Dockerfile` has the same `golang:1.25` problem after `go mod tidy`, and its `task dev PORT=...` does not reach the nested `task --parallel` either. Not changed here, single-app output stays byte for byte beta.11; a one-line fix each for the next release.
- The `.dark` block order in the CSS writer is random (above), from before this branch.
- The scaffold's `task build` and Docker build need a shadcn-templ release that contains this branch; with beta.11 as the tool `bundle` still keys on `aliases.components`.

Planner fixes after the executor's hand-back (main checkout, 2026-10-05): the single-app scaffold gets the same two fixes as the monorepo one (`golang:1.26`, `task dev` passes `PORT` and a free `PROXY_PORT` on), the CSS variables are written `:root` before `.dark` instead of in map order, and `init` stops with a clear error when its directory does not exist (preflight-init's `MISSING_DIR_OR_EMPTY_PROJECT`), instead of failing on `components.json`.

## Planner review


### Review (Claude, 2026-10-05)

Accepted. The model is shadcn's: two workspaces with their own `components.json`, the app's `ui` and `utils` aliases into `packages/ui`, `getWorkspaceConfig` by the closest `components.json`, ui files installed with the ui workspace's config, blocks in the app, one theme in `packages/ui/styles/globals.css`, the design settings propagated by `init` and `apply`. The deviations are Go's (no tsconfig, so `packages/ui` is found by convention; `registry:example` shares Go imports with the ui packages) and recorded in Decisions.

Planner verification with a CLI built from this branch, registry on the local docs server, scaffolds outside the repository:
- `init demo --monorepo`, `add button dialog combobox sidebar-07 --cwd apps/web`: ui components in `packages/ui/components`, the block in `apps/web/components/blocks/sidebar07` importing `demo/packages/ui/components/...`.
- A second app exactly as the docs say (copy `apps/web`, rename the imports, `init --cwd apps/admin`, Taskfile include), `add popover --cwd apps/admin`: the three `components.json` match shadcn's (same style, the apps' `tailwind.css` at `../../packages/ui/styles/globals.css`), the same bundle in both apps.
- `task build` for both apps; both binaries served, Chromium: the dialog opens and closes, the combobox selects `htmx` and keeps the focus in its input, the popover opens; no console, page or network error.
- `task web:dev` and `task admin:dev` side by side while this repository's own dev stack holds 8090 and 7331: apps on 8091 and 8092, proxies on 7332 and 7333, the dialog and the popover open through both proxies without errors.
- `docker build` of the monorepo scaffold: the container serves the page, the bundle and `output.css` (200).
- Single app: `init app --template templ`, `add dialog combobox`, `task build`, `docker build` on `golang:1.26` (200), `task dev PORT=8301` serves on 8301 with a free proxy port.
