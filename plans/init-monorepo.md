# init-monorepo: `shadcn-templ init --monorepo` scaffolds one Go module with a shared components package and `apps/web`

- **Planner**: Claude
- **Executor**: Claude
- **Status**: done
- **Branch**: feat/init-monorepo (from feat/parity-components)

## Context

monorepo-623 taught the CLI to run in an app directory below `go.mod` (aliases against the module root, CSS and scripts per app, one shared bundle copied into every sharing app). Its open item: shadcn's `npx shadcn@latest init --monorepo` scaffolds a ready workspace, shadcn-templ has no pendant, so a monorepo starts with `go mod init` and hand-written apps.

**What shadcn does.** `init --monorepo` (`packages/shadcn/src/commands/init.ts`, `templates/create-template.ts` `resolveTemplate`) picks the template's `monorepo` override: another template directory (`next-monorepo`, `vite-monorepo`, ...) whose default project name is that directory name, then runs init in `apps/web`. The template holds `apps/web` (the app, its own `components.json`) and `packages/ui` (the shared components), wired by Turborepo (`turbo dev`, `turbo build` at the root). Without a template the CLI prompts for one; with a template and no flag it asks "Would you like to set up a monorepo?".

**Facts the plan builds on.**

- `cmd/shadcn-templ/templates/templates.go`: the `Templates` map (one entry `templ`, dir `templ-app`), `Create` copies the embedded dir, strips `.tmpl` and replaces the module placeholder `templ-app` with the project name.
- `commands/init.go` `RunInit`: `--template` scaffolds into `<cwd>/<name>`, refuses inside a module, continues init in the scaffold, adds `component-example`, prints `cd`, `go mod tidy`, `task dev`. Its only prompt is the overwrite confirm; design choices are flags.
- The single-app scaffold (`templ-app`): `go.mod.tmpl` with the two `tool` lines, `Taskfile.yml` (`templ`, `tailwind`, `scripts-watch`, `build`, `dev`), `Dockerfile` running `task build`, `.dockerignore`, `.gitignore`, `main.go`, `assets/assets.go` (embed), `layouts/base.templ`, `pages/home.templ`, `components/scripts.templ` (see `plans/scaffold-build.md`).
- monorepo-623: `components.json` in `apps/web` with `go.mod` at the root resolves `aliases.components` to `<root>/components`, `tailwind.css` and `scripts.dir` to `apps/web/...`. `init --cwd apps/admin` in an existing module sets up a second app and bundles it.

## Decisions

- **`--monorepo` selects the template's monorepo variant, like `resolveTemplate`.** `templates.Template` gains `Monorepo *Template`; `templates.Resolve(name, monorepo)` returns the effective template. The `templ` entry's variant is dir `templ-monorepo`, default project name `templ-monorepo` (shadcn: the dir name), app dir `apps/web`. `--monorepo` without `--template` implies `templ`, the only template (shadcn would prompt; with one choice there is nothing to ask). No new prompt: init prompts for nothing but the overwrite confirm. `init [name] --monorepo` is non-interactive.
- **One module, components at the root, one app in `apps/web`.** The Go pendant of shadcn's `packages/ui` is the module's own `components/` and `utils/` packages (monorepo-623: one module, one import path space, no second `components.json`). Layout:

  ```txt
  apps/web/            main.go, Taskfile.yml, assets/{assets.go, css/globals.css, js/}, layouts/, pages/, components.json
  components/          scripts.templ, then everything add installs, scripts_bundle.go
  utils/               installed by init
  go.mod               module <name>, tool lines for templ and shadcn-templ
  Taskfile.yml         includes apps/web as web, dev and build
  Dockerfile           builds apps/web
  .dockerignore, .gitignore
  ```

  `apps/` follows shadcn's monorepo template; `cmd/<app>` keeps working as before. The monorepo docs page switches its examples to `apps/web` and `apps/admin` and says so.
- **Init runs in `apps/web`.** After `Create`, `RunInit` continues with cwd `<project>/apps/web`; everything else is the monorepo-623 path (aliases `<name>/components`, `<name>/utils`, the app's CSS and bundle). `component-example` is added from there, so it lands in the shared `components/`. Next steps print `cd <name>`, `go mod tidy`, `task dev`.
- **Per app Taskfile, root Taskfile includes it.** `apps/web/Taskfile.yml` is the single-app Taskfile with two changes: `templ generate` gets `-path ../..` (the shared components are `.templ` files outside the app, so the app's watcher and its build generate the whole module; `--cmd "go run ."` still runs in the app, so `./assets` resolves in dev mode), and nothing else. The root `Taskfile.yml` includes it as `web` with `dir: apps/web` and defines `dev` (`web:dev`) and `build` (`web:build`). A second app is one more include. The root `.gitignore` uses `**/` patterns so it covers every app.
- **The app's CSS sources the shared components.** Tailwind v4 detects sources from the working directory, `apps/web`, which does not hold the components. The template ships `apps/web/assets/css/globals.css` as `@import "tailwindcss";` plus `@source "../../../../components";`, init merges the theme into it. The monorepo docs page gets the same line as a requirement for any app below the module root (it holds for `cmd/<app>` too).
- **Dockerfile builds `apps/web`.** Same three stages as the single-app scaffold; `RUN task web:build`, `COPY --from=build /app/apps/web/bin/app ./app`.
- **Templates stay separate directories.** `templ-monorepo` duplicates `main.go`, `assets.go`, `layouts`, `pages` and `scripts.templ` from `templ-app` with the import paths changed, like shadcn's `next-app` and `next-monorepo`. The module placeholder stays `templ-app` in both.
- **Second app.** Documented: copy `apps/web` to `apps/admin` without its `components.json`, fix the import paths, `shadcn-templ init --cwd apps/admin`, add an include to the root `Taskfile.yml`.

## Tasks

### 1. Monorepo template and `--monorepo`

- [x] Done

`templates/templ-monorepo/`, `Template.Monorepo`, `templates.Resolve`, `InitOptions.Monorepo`, `--monorepo` flag, usage line in `main.go`. Unit test next to the init tests: `init mono --monorepo` against the in-process registry writes the layout above, the root `go.mod` has both tools, `apps/web` has no `go.mod` and no `components/`, `apps/web/components.json` resolves components and utils to the module root, CSS and scripts to `apps/web`, the app's CSS carries the theme and the `@source` line, the bundle lands in `apps/web/assets/js` and `components/scripts_bundle.go` names it; `--monorepo` inside a module is refused. Done when the test passes. Checks: `go build ./...`, `go vet ./cmd/shadcn-templ/...`, `go test ./cmd/shadcn-templ/...`.

### 2. Docs

- [x] Done

`monorepo.md` Getting started starts with `shadcn-templ init --monorepo` (existing module path kept as the alternative), File Structure and examples on `apps/`, the `@source` requirement, adding a second app. `cli.md` init usage with `[name]`, `--template`, `--monorepo`. Done when `go test ./internal/...` passes.

### 3. End to end smoke test

- [x] Done

Build the CLI, `init demo --monorepo` and `add button dialog --cwd apps/web` against the local registry in a scratch dir, `go mod tidy`, `task build`, run `apps/web/bin/app` on a free port, curl `/` and the hashed bundle. Done when the commands and results are recorded below.

## Executor log

### Task 1

`templates/templ-monorepo/` per Decisions: root `go.mod.tmpl` (tool lines as `templ-app`), `Taskfile.yml` including `apps/web` as `web` with `dev` and `build`, `Dockerfile` (`task web:build`, copies `apps/web/bin/app`), `.dockerignore` and `.gitignore` with `**/` patterns, `components/scripts.templ.tmpl`; `apps/web/` with `main.go.tmpl`, `Taskfile.yml` (`templ generate -path ../..`), `assets/assets.go.tmpl`, `assets/css/globals.css` (`@import "tailwindcss"` plus `@source "../../../../components"`), `layouts/`, `pages/` with the import paths under `apps/web`. `templates.Template` gained `AppDir` and `Monorepo`, `templates.Resolve(name, monorepo)` picks the variant. `init --monorepo` implies `--template templ`, scaffolds `templ-monorepo` (default name `templ-monorepo`) and continues init in `apps/web`; the existing module refusal covers it. Usage line in `main.go`. Test `TestInitMonorepoScaffold` in `commands/monorepo_test.go` (in-process registry): every scaffold file with its key lines, no `go.mod`, `components/` or `utils/` in `apps/web`, the app config resolving components and utils to the root and CSS and scripts to the app, `component-example` and `utils` at the root, `add dialog` from the app installing at the root and bundling into `apps/web/assets/js` with the manifest naming it, `--monorepo` inside the scaffold refused.

The worktree's generated `*_templ.go` (gitignored) were copied from the main checkout for 687 files whose `.templ` source is identical, none differed. With `GOTMPDIR` and `TMPDIR` set to the job dir: `go build ./...`, `go vet ./cmd/shadcn-templ/...`, `go test ./cmd/shadcn-templ/...` green.

## Planner review

### Task 2

`monorepo.md`: intro names `apps/web` and `apps/admin` (or `cmd/...`, the CLI does not care), Getting started opens with `shadcn-templ init my-app --monorepo` and its next steps, "Or start from an existing module" keeps the per app `init` path, Add components and Import components on `apps/web` and the `my-app` module, a new "Add another app" step (copy `apps/web` without `components.json`, fix import paths, `init --cwd apps/admin`, one more include in the root Taskfile). File Structure is the scaffold's. Requirements gain 3: each app's CSS needs `@source` to the root components (measured in the task 3 smoke test: without it the scaffold's `output.css` drops from 67127 to 9164 bytes and no component class is in it; this holds for the existing module path as well, which monorepo-623 had not covered). Scripts mentions the per app and root `task build`. `cli.md` init: the new-project paragraph with `-t templ` and `--monorepo` examples, the usage line with `[name]`, `--template`, `--monorepo` and both flags in the options. `installation.md` Create Project: one line pointing to the monorepo page. A throwaway test (deleted) parsed `monorepo`, `cli`, `installation` through `DocsService.GetPage`, the monorepo TOC lists the five steps. `go test ./internal/...` green.

### Task 3

Scratch `S=$CLAUDE_JOB_DIR/tmp/initmono` (outside any module), `GOTMPDIR` and `TMPDIR` in the job dir, registry `R=http://localhost:8090` (the running docs server, not started or stopped here). Scripts `smoke1.sh` to `smoke4.sh` in `$S`.

```shell
go build -o $S/cli ./cmd/shadcn-templ
cd $S && $S/cli init demo --monorepo --registry $R
  # Creating a new templ monorepo project in demo. ... Next steps: cd demo, go mod tidy, task dev
cd demo && $S/cli add button dialog --cwd apps/web --registry $R
  # components/... at the module root, Bundle: assets/js/shadcn-templ-37c1316ab4a74363.js
  # tree: go.mod, Taskfile.yml, Dockerfile, .dockerignore, .gitignore, utils/shadcn-templ.go, components/{scripts.templ,
  # scripts_bundle.go,button,dialog,componentexample,...}, apps/web/{components.json,main.go,Taskfile.yml,layouts,pages,
  # assets/{assets.go,css/{globals,tw-animate,shadcn-tailwind}.css,js/shadcn-templ-37c1316ab4a74363.js}}
  # apps/web/components.json: aliases demo/components, demo/utils
go mod tidy && task build
  # FAILS at web:build 'go tool shadcn-templ bundle': "no go.mod found at .../demo/apps/web"
  # tidy pins the tool to the published v2.0.0-beta.10, which predates monorepo-623 (go.mod walk up)
go mod edit -replace github.com/axadrn/shadcn-templ/v2=<this worktree> && go mod tidy
  # tools: templ v0.3.1070, shadcn-templ v2.0.0-beta.10 => this branch
task build
  # [web:build] tailwindcss --minify, go tool shadcn-templ bundle (Bundle: assets/js/shadcn-templ-37c1316ab4a74363.js),
  # go tool templ generate -path ../.. (updates=18, root components and app), go build -o bin/app . -> apps/web/bin/app OK
cd $S && PORT=8197 demo/apps/web/bin/app &     # run from outside the project, assets from the embed
curl http://localhost:8197/                                   # 200, <script ... src="/assets/js/shadcn-templ-37c1316ab4a74363.js">
curl http://localhost:8197/assets/js/shadcn-templ-37c1316ab4a74363.js  # 200, 385830 bytes, Cache-Control: public, max-age=31536000, immutable
curl http://localhost:8197/assets/css/output.css              # 200
kill <pid of that app>                                        # stopped, only that process
$S/cli init --monorepo --registry $R                          # default name templ-monorepo, exit 0 (removed after)
```

`@source` check: the same Tailwind build in `apps/web` without the `@source` line gives 9164 bytes instead of 67127 and lacks every component class (`rounded-4xl`: 0 hits), so the line is required, see task 2.

Not run: `task dev` (its templ proxy defaults to port 7331, off limits here) and the Docker build. `git status` in the repo clean after the smoke test.

Open: the scaffold's `task build` needs a shadcn-templ release that contains monorepo-623; with the current published v2.0.0-beta.10 the `go tool shadcn-templ bundle` step fails in `apps/web` until the next release is tagged (the single-app scaffold is unaffected).

### Review (Claude, 2026-10-04)

Accepted. `--monorepo` resolves the template's monorepo variant like shadcn's `resolveTemplate` and then continues through the monorepo-623 path in `apps/web`, so there is one way configs resolve. The `@source` line for the shared components is the real find of the smoke test (Tailwind only scans the app otherwise) and is now a documented requirement for every app. The scaffold's `task build` needs a CLI release with monorepo-623, which `v2.0.0-beta.11` is; the release smoke test reruns it against the published tag.
