# parity-components: every shadcn Base UI component, each one tested against shadcn in the browser

- **Planner**: Claude
- **Executor**: Codex
- **Status**: planning, starts after `plans/parity-runtime.md` is merged (task 1 and 2 can run earlier, they change nothing in the repo)
- **Branch**: `feat/parity-components` from `main` after the parity-runtime merge

## Context

The target is shadcn's Base UI flavor: `shadcn-ui/ui` `apps/v4/registry/bases/base/` with `ui/` (63 files), `examples/` (67 entries), `blocks/`, `hooks/`, `lib/`. Our `components.json` style is `base-nova`. Latest upstream commit touching that tree on 2026-09-22: `c257f688cf` (2026-09-04). No file in this repo records which upstream commit a component was ported from, so "1:1" has had no fixed reference.

A first name diff of `bases/base/ui` against `components/` shows upstream files with no directory here, among them `menubar`, `navigation-menu`, `scroll-area`, `native-select`, `direction`, `sonner` (next to `toast`), and the newer chat set `message`, `message-scroller`, `bubble`, `attachment`, `marker`, `questionnaire`. Task 2 produces the exact list.

After `parity-attributes` and `parity-runtime`, every existing component follows the three rules in `AGENTS.md` and wires the shared blocks in `components/baseui/`. New components are built the same way from the start. This plan also closes the loop the two earlier plans leave open: they prove "no regression against our own baseline", this one proves "same as shadcn" for every component, old and new.

## Decisions

- **One pinned upstream.** `plans/UPSTREAM.md` from `parity-attributes` task 1 holds the `shadcn-ui/ui` commit and the `@base-ui/react` version. Every port and every comparison in this plan uses that pin. Moving the pin is its own later plan.
- **A local shadcn reference app is the ground truth.** `tmp/parity-components/reference/` (gitignored): a Next.js app created with the shadcn CLI at the pinned version, style `base-nova`, base color `neutral`, every `bases/base/ui` component installed, and one route per upstream example rendering it alone, `/preview/<example-name>`, the same shape as our `/preview/<name>`. Our site is not compared to ui.shadcn.com, which renders other styles.
- **Comparison is automated and per example.** `tmp/parity-components/compare.mjs <engine> <example>` opens the example on both apps at the same viewport, then for the initial render and after each scripted interaction (open, arrow keys, typeahead, select, Escape, outside click, Tab) compares: the DOM tree (tag, `data-slot`, sorted attribute names and the values of `role`, `aria-*`, Base UI state attributes; rule 3 `data-templ-*` attributes ignored), the focused element's `data-slot`, scroll lock state, and a screenshot pixel diff with a small tolerance for font rendering. Interactions per example live in `tmp/parity-components/scenarios.json`. Output is one line per check, PASS or FAIL with the first difference.
- **Example names map one to one.** Every upstream example has an example here under the same name in snake case; a missing one is ported as part of its component's task. Our extra examples stay, they are not compared.
- **A new component is ported like the existing ones.** Templ from the upstream `ui/*.tsx` with verbatim classes, props per rule 1, the DOM per rule 2, rule 3 for the rest, behavior only from `components/baseui/` blocks plus the component's own wiring, docs page and registry entry like its siblings. Components that wrap a third party library upstream (`sonner`, `input-otp`, `embla`, `react-day-picker`, `recharts`, `react-resizable-panels`) follow the same rules against that library's rendered DOM.
- **A comparison failure is fixed or recorded, never waved through.** Either the component changes until the check passes, or the Executor log names the difference, the reason it cannot match (server rendering limit, browser API difference) and the Planner accepts it in the review. Accepted differences are listed in `plans/UPSTREAM.md` next to the pin.
- **Both engines.** Every comparison runs in chromium and webkit (`tmp/a11y-600/node_modules` Playwright).

## Tasks

Tasks 1 and 2 are written in full now; the component tasks are written after task 2, against the exact list.

### 1. Pin and reference app

- [ ] Done

`tmp/parity-components/reference/` at the pin in `plans/UPSTREAM.md` per Decisions, with a `README.md` saying how to start it (port 3100). `compare.mjs` and `scenarios.json` with scenarios for `button`, `dialog`, `select` as the first three, to prove the harness.

Done when: the reference app serves `/preview/<name>` for every upstream example, `compare.mjs chromium dialog-demo` runs end to end on both apps and prints its checks.

Checks: `node tmp/parity-components/compare.mjs chromium dialog-demo`, same for webkit.

### 2. Inventory

- [ ] Done

`tmp/parity-components/inventory.md`: one row per upstream `ui/*.tsx` with our directory or "missing", one row per upstream example with our example or "missing", and for every existing component the result of `compare.mjs` over all its examples in both engines. Scenarios for every existing example added to `scenarios.json`.

Done when: every upstream component and example has a row, every existing component has a PASS or FAIL count per engine.

Checks: the table is complete against `gh api repos/shadcn-ui/ui/contents/apps/v4/registry/bases/base/ui` at the pin.

### 3 onward. Written after task 2

Planned shape: one task per existing component that fails a comparison, then one task per missing component, then one task per missing example, then a final full run of `compare.mjs` over every example in both engines with the result appended to `plans/UPSTREAM.md`.

## Executor log

## Planner review
