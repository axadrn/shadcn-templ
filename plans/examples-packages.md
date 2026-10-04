# examples-packages: one Go package per component's examples

- **Planner**: Claude
- **Executor**: Claude
- **Status**: done
- **Branch**: `feat/parity-components`, one commit, owner decision 2026-10-04 ("der richtige Weg")

## Context

`internal/ui/examples` is one Go package with about 560 `.templ` files and their generated `_templ.go`. Every edit to any example recompiles the whole package: about 4 GB of RAM and 3 to 4 minutes on an 8 GB machine, and the OOM killer ended builds several times during `parity-components` task 16 and 17. Go compiles and caches per package, so the size of one package is the cost of every rebuild.

Upstream keeps every example as its own file under `apps/v4/examples/base/`; how we group them into Go packages is a build detail of our docs site. Nothing rendered changes: no component, prop, DOM, class, script or example content.

## Decisions

- **One package per component directory.** `internal/ui/examples/<dir>/`, `<dir>` the component's directory name (`button`, `dropdownmenu`, `messagescroller`), holding that component's examples (`<name_snake>.templ`), its `-example` create example and its data files. Utility examples (`shimmer`, `scrollfade`) and the few that belong to no single component get a directory by their upstream name prefix.
- **The registry stays the one entry point.** `internal/ui/examples` keeps `RegistryEntry` and `Registry` with the same keys; `internal/ui/examples/all` fills it from the subpackages (each aliased `ex<dir>`), imported for its side effect by `cmd/docs` only, so the docs packages do not depend on the examples. `RegistryEntry.File` becomes the path relative to `internal/ui/examples` (`button/button_demo.templ`), and the source embed covers the subdirectories, so code blocks show the same files.
- **Shared helpers go to `internal/ui/examples/shared`.** `serverRendered`, the select item data, avatar helpers and every other function used by more than one directory. A helper used by one directory moves with it.
- **No behavior change is the proof.** `parity/compare.mjs all` gives the same result before and after, `go test ./...` is green, and touching one example rebuilds in seconds.

## Tasks

### 1. Split the package

- [x] Done

Move every example with `git mv` into its directory, fix package clauses, imports and cross references, rewrite `registry.go` and the embed, move the shared helpers. The `create` list and the docs keep the same names.

Done when: `go build ./...` and `go test ./...` green, `compare.mjs all` unchanged against the run before the move, an edit to one example rebuilds `cmd/docs` in under 30 seconds with less than 1 GB peak for the compile.

## Executor log

### Task 1

570 files in 67 packages, one per component directory (`select` and `switch` are Go keywords: `selectex`, `switchex`), `internal/ui/examples/shared` for `ServerRendered`. Six helpers were used across packages and are exported now: the attachment example's image URLs (message), `DialogExampleOption` (field), `InputOTPState` (field), `SideRtlLabel`, `SideRtlPhysical`, `SideRtlLogical` (popover). `RegistryEntry.File` is relative to `internal/ui/examples` (`button/button_demo.templ`), the source embed is `*/*.templ`.

Splitting alone took an edit from 3 to 4 minutes to 60 s: `internal/ui/examples` still imported every package, and the docs packages (`modules`, `pages`, `service`) import it, so they rebuilt too. The registry package now holds only `RegistryEntry` and an empty `Registry`; `internal/ui/examples/all` fills it in `init` and only `cmd/docs` imports it. That left `all` at 33 s, because calling 555 constructors in one map literal inlines every template body into its `init`; it registers `lazy(constructor)` function values instead, called on render.

Checks: every one of the 555 previews renders byte for byte the same HTML as before (random ids and asset versions masked), `go test ./...` green. A real edit to one example (`button_demo`) rebuilds `cmd/docs` in 4.2 s: 0.6 s its package, the rest `all`, `cmd/docs` and the link.

## Planner review
