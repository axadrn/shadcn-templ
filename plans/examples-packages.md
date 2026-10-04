# examples-packages: one Go package per component's examples

- **Planner**: Claude
- **Executor**: Claude
- **Status**: ready, after `parity-components` task 17 (no example moves while examples are being added)
- **Branch**: `feat/parity-components`, one commit, owner decision 2026-10-04 ("der richtige Weg")

## Context

`internal/ui/examples` is one Go package with about 560 `.templ` files and their generated `_templ.go`. Every edit to any example recompiles the whole package: about 4 GB of RAM and 3 to 4 minutes on an 8 GB machine, and the OOM killer ended builds several times during `parity-components` task 16 and 17. Go compiles and caches per package, so the size of one package is the cost of every rebuild.

Upstream keeps every example as its own file under `apps/v4/examples/base/`; how we group them into Go packages is a build detail of our docs site. Nothing rendered changes: no component, prop, DOM, class, script or example content.

## Decisions

- **One package per component directory.** `internal/ui/examples/<dir>/`, `<dir>` the component's directory name (`button`, `dropdownmenu`, `messagescroller`), holding that component's examples (`<name_snake>.templ`), its `-example` create example and its data files. Utility examples (`shimmer`, `scrollfade`) and the few that belong to no single component get a directory by their upstream name prefix.
- **The registry stays the one entry point.** `internal/ui/examples/registry.go` keeps `Registry` with the same keys, now importing the subpackages (aliased where a package name collides with a component import). `RegistryEntry.File` becomes the path relative to `internal/ui/examples` (`button/button_demo.templ`), and the source embed covers the subdirectories, so code blocks show the same files.
- **Shared helpers go to `internal/ui/examples/shared`.** `serverRendered`, the select item data, avatar helpers and every other function used by more than one directory. A helper used by one directory moves with it.
- **No behavior change is the proof.** `parity/compare.mjs all` gives the same result before and after, `go test ./...` is green, and touching one example rebuilds in seconds.

## Tasks

### 1. Split the package

- [ ] Done

Move every example with `git mv` into its directory, fix package clauses, imports and cross references, rewrite `registry.go` and the embed, move the shared helpers. The `create` list and the docs keep the same names.

Done when: `go build ./...` and `go test ./...` green, `compare.mjs all` unchanged against the run before the move, an edit to one example rebuilds `cmd/docs` in under 30 seconds with less than 1 GB peak for the compile.

## Executor log

## Planner review
