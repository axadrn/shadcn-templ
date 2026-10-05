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

## Tasks

### 1. Config: ui alias and workspace configs
- [ ] Done

### 2. add: route files and imports by workspace
- [ ] Done

### 3. init: --monorepo scaffold as apps/web plus packages/ui, init in an app, design settings propagation
- [ ] Done

### 4. Bundle keyed on the ui package, dev proxy ports
- [ ] Done

### 5. Docs: monorepo page 1:1 with shadcn's sections and examples (Go)
- [ ] Done

### 6. Verification
- [ ] Done

Unit tests per task. End to end with a CLI built from the branch against the local registry: `init demo --monorepo`, `add button dialog combobox sidebar-07 --cwd apps/web` (sidebar-07 is a block: it must land in `apps/web/components/blocks/` with imports into `packages/ui`), a second app `init --cwd apps/admin`, `add popover --cwd apps/admin`, `task build`, both apps served, each page checked in Chromium (dialog opens, combobox selects, popover opens, no console errors), `task dev` for both apps side by side on free ports, the Docker build. Single-app scaffold: `init`, `add`, `task build` unchanged.

## Executor log

## Planner review
