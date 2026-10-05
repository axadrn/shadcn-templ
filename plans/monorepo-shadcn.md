# monorepo-shadcn: the monorepo as shadcn's, workspace by workspace

- **Planner**: Claude
- **Executor**: Claude
- **Status**: in progress
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
- [ ] Done

### 5. Docs: monorepo page 1:1 with shadcn's sections and examples (Go)
- [ ] Done

### 6. Verification
- [ ] Done

Unit tests per task. End to end with a CLI built from the branch against the local registry: `init demo --monorepo`, `add button dialog combobox sidebar-07 --cwd apps/web` (sidebar-07 is a block: it must land in `apps/web/components/blocks/` with imports into `packages/ui`), a second app `init --cwd apps/admin`, `add popover --cwd apps/admin`, `task build`, both apps served, each page checked in Chromium (dialog opens, combobox selects, popover opens, no console errors), `task dev` for both apps side by side on free ports, the Docker build. Single-app scaffold: `init`, `add`, `task build` unchanged.

## Executor log

### Task 1

`utils.Aliases.UI` (`"ui,omitempty"`, so a config without it writes byte for byte as before), `RawConfig.UIAlias()` (ui, else components), `ResolvedPaths.UI`. `utils.WorkspaceConfig` {Components, UI, Utils} and `GetWorkspaceConfig`, the `getWorkspaceConfig` pendant: per alias directory the closest `components.json` at or above it up to the module root, loaded unless it is the app itself. A config with `aliases.ui` and no `scripts` is a library workspace (Decisions). `static/schema/components.json` gains `aliases.ui`. Test `TestGetWorkspaceConfig`: apps/web plus packages/ui resolve ui and utils to the ui config, components to the app, the ui config to itself and without scripts; a single app and a beta.11 app under `cmd/` are their own workspace with default scripts. `go test ./cmd/shadcn-templ/...` green.

Environment: the branch `feat/monorepo-shadcn` is checked out in the main checkout, so this worktree works on `feat/monorepo-shadcn-exec` from `origin/feat/monorepo-shadcn`; it fast forwards onto `feat/monorepo-shadcn`.

### Task 2

`addComponents` loads `GetWorkspaceConfig` once; the ui workspace is the main target: its style, menu color and rtl resolve the tree, its `tailwind.css` takes the CSS and the vendored stylesheets land next to it. `UpdateFilesOptions.Workspace`; `targetConfig` (the `getTargetConfigKeyForFile` pendant, by registry path, see Decisions) picks the config per file, `resolveFilePath` and `transformContent` run with it: `components/` to `ResolvedPaths.UI`, imports of `components/...` to `aliases.ui`, `blocks/...` to `aliases.components` + `/blocks`, the ui root package name from `aliases.ui`. In a workspace install the summary prints paths relative to the module root, like shadcn's workspace root. `apply` lists installed components in the ui dir. A single app has every workspace equal to itself, so its files, imports and output are unchanged. Test `TestUpdateFilesWorkspace` (apps/web plus packages/ui): ui component, its JS, `scripts.templ` and utils in `packages/ui`, the sidebar07 page in `apps/web/components/blocks/sidebar07` importing `packages/ui/components/sidebar` and its own block package under `apps/web/components/blocks`, nothing at the module root. `go test ./cmd/shadcn-templ/...` green. The bundle is still keyed on `aliases.components` until task 4.

### Task 3

Template `templ-monorepo`: `components/scripts.templ` moved to `packages/ui/components/`, the app's `assets/css/globals.css` replaced by `packages/ui/styles/globals.css` (`@import "tailwindcss"`, `@source "../../../apps"`, `@source ".."`), the app layout imports `<module>/packages/ui/components`, the home page `<module>/packages/ui/components/componentexample`, the app Taskfile runs Tailwind with `-i ../../packages/ui/styles/globals.css`. `init --monorepo` writes `packages/ui/components.json` first (same preset, aliases into itself, `tailwind.css` `styles/globals.css`, no scripts), then the app's: `components` `<module>/apps/web/components`, `ui` and `utils` from the ui config, `tailwind.css` `../../packages/ui/styles/globals.css`, default scripts. The same join runs for any app below a module with `packages/ui/components.json` (`joinUIWorkspace`). After writing the app config `syncWorkspaceConfigs` propagates `menuColor`, `menuAccent`, `rtl`, `iconLibrary` (init.ts' set, style not) into the other workspaces; `apply` uses the same helper with `syncApplyWorkspaceConfigs`' set. The base item and `component-example` install through the app config, so the workspace routing of task 2 puts the theme into the ui CSS and `utils` and `component-example` into `packages/ui`. A single app has no other workspace and no `packages/ui`, its init is unchanged. Test `TestInitMonorepoScaffold` rewritten: the layout and both configs, nothing at the module root, `add button dialog sidebar-07` from `apps/web` (ui components in `packages/ui`, the block in `apps/web/components/blocks/sidebar07` importing `mono/packages/ui/components/sidebar`), `init` of `apps/admin` with `--preset maia` (joins, `iconLibrary` hugeicons propagates to `packages/ui`, its style does not, `apps/web` untouched), `add popover` from admin into `packages/ui`, `apply vega` in `apps/web` syncing `packages/ui` to `base-vega`. `TestMonorepoAppsShareComponents` (the beta.11 layout) passes unchanged. `go test ./cmd/shadcn-templ/...` green.

## Planner review
