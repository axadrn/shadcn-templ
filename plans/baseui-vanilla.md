# baseui-vanilla: the Base UI port as its own framework-free library

- **Planner**: Claude
- **Executor**: open
- **Status**: planning, starts after `plans/parity-runtime.md` and `plans/parity-components.md` are merged

## Context

`parity-runtime` moves every Base UI building block into `components/baseui/`, one file per Base UI module, and leaves component scripts only wiring parts. That split is already the shape of a library: the blocks know nothing about shadcn, the wiring does.

Checked on `feat/parity-runtime` 94d92461 (12 files, 2576 lines): no file in `components/baseui/` contains `data-slot` or a `cn-*` class. What ties them to this project is only the name: blocks publish on `window.templ.<block>` and keep state in `_templ*` expandos. The only outside dependency is `window.FloatingUIDOM` from `components/floatingui/`, which is what Base UI builds on too.

Base UI itself has no styling and no Tailwind. It renders behavior, ARIA, state attributes (`data-open`, `data-side`, `data-starting-style`, ...) and CSS variables (`--anchor-width`, `--transform-origin`). Tailwind, `data-slot` and `cn-*` are shadcn's layer. So the cut is: Base UI port in the library, shadcn in shadcn-templ.

Goal: anyone can build their own UI kit on server-rendered HTML (templ, Jinja, Blade, PHP, plain HTML) with Base UI behavior, without React and without a build step.

## Decisions

- **Two layers, one direction.** Library: blocks plus one primitive per Base UI component. shadcn-templ: templ markup, Tailwind classes, `data-slot`, reading `data-templ-*`, calling the library. The library never reads `data-slot`, `data-templ-*` or a class. shadcn-templ never copies library behavior.
- **A primitive takes elements, not selectors.** `dialog.mount({ root, trigger, popup, backdrop, ... }, props)` returns the same handle shape the blocks use (cleanup plus the component API). The caller finds the parts however it likes. shadcn-templ finds them by `data-slot` as today, so rule 2 of `AGENTS.md` stays as it is and no new selector attribute exists.
- **Props are Base UI props.** The `props` object uses Base UI names in camel case (`defaultOpen`, `sideOffset`, `closeDelay`), the same names the Go props and `data-templ-*` attributes already use. Value props only, like today. Changes are events on the root, like today's component events.
- **The server renders the markup, the library renders state.** Per primitive the library documents the required elements and the ARIA the server writes, and which attributes the library sets at runtime. Same split as rule 2: ARIA and roles in markup, state attributes from JS.
- **Plain scripts, no build step.** One file per block or primitive, each registering on one global, plus one concatenated file. Same model as today's bundle. Floating UI stays a vendored dependency at the pin in `plans/UPSTREAM.md`.
- **The library version follows the Base UI pin.** Moving the pin moves both. Every file keeps its heading comment with the Base UI source path and version. Base UI is MIT; the library ships its license notice.
- **Extract inside this repo first.** The library lives in its own directory with no imports from the rest of the repo, proven by a test. It moves to its own repo only once the boundary has held through one pin move.

## Open questions for the owner

1. **Name.** Global, expando prefix and package name. "Base UI" is MUI's name, so the package name should not suggest it is official. `baseui-vanilla` is only this plan's topic.
2. **ES modules in addition to plain scripts?** Plain scripts are enough for every server-rendered stack. ESM would matter only for npm users with a bundler.
3. **When to move to its own repo:** after task 5, or later.

## Tasks

### 1. Boundary test

- [ ] Done

A Go test next to `components/scripts_test.go` fails if a file in `components/baseui/` contains `data-slot`, `data-templ-`, `cn-`, or `window.templ.` followed by a name that is not a block in that directory.

Done when: the test is green on the merged `parity-runtime` state and fails when one of those strings is added to any block.

### 2. Primitives

- [ ] Done

For each component, move its Base UI part logic from `components/<name>/<name>.js` into `components/baseui/<name>.js` as a primitive that takes elements and props (Decisions). What stays in the component script: find parts by `data-slot`, read `data-templ-*` into the props object, call `mount`, forward the events it already fires. One commit per component, in the order `parity-runtime` used.

Done when: every component script only finds parts and reads props, the task 1 test is green, and `check.sh` plus `compare.mjs` pass in chromium and webkit for each component's examples.

### 3. Own namespace

- [ ] Done

Blocks and primitives move from `window.templ.<block>` and `_templ*` to the name from open question 1. Public shadcn-templ APIs (`window.templ.<component>`, component events) keep their names. The `AGENTS.md` prefix rule gets one line for the library's prefix.

Done when: `grep -r "templ" components/baseui/` is empty, and the public API check in `check.sh` is unchanged.

### 4. Markup contract and plain HTML examples

- [ ] Done

Per primitive one page in the library's docs: required elements, the ARIA the server renders, the attributes and CSS variables the library sets, the props, the events. Each page has a plain HTML example with no Tailwind and no shadcn, only enough inline CSS to see open and closed.

Done when: the plain HTML examples pass the same `compare.mjs` scenarios as the shadcn-templ examples of that component.

### 5. Package

- [ ] Done

The library directory gets its own README, license notice, version and a concatenated file. Served from a CDN and published under the name from open question 1.

Done when: a page that loads only the published file and one plain HTML example works, and shadcn-templ loads the library the same way it loads its bundle today.

## Executor log

## Planner review
