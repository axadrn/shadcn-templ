# parity-components: every shadcn Base UI component, each one tested against shadcn in the browser

- **Planner**: Claude
- **Executor**: Claude, one commit per task
- **Status**: in progress, `plans/parity-runtime.md` is merged (PR #624)
- **Branch**: `feat/parity-components` from `main` after the parity-runtime merge

## Context

The target is shadcn's Base UI flavor: `shadcn-ui/ui` `apps/v4/registry/bases/base/` with `ui/` (63 files), `examples/` (67 entries), `blocks/`, `hooks/`, `lib/`. Our `components.json` style is `base-nova`. Latest upstream commit touching that tree on 2026-09-22: `c257f688cf` (2026-09-04). No file in this repo records which upstream commit a component was ported from, so "1:1" has had no fixed reference.

A first name diff of `bases/base/ui` against `components/` shows upstream files with no directory here, among them `menubar`, `navigation-menu`, `scroll-area`, `native-select`, `direction`, `sonner` (next to `toast`), and the newer chat set `message`, `message-scroller`, `bubble`, `attachment`, `marker`, `questionnaire`. Task 2 produces the exact list.

After `parity-attributes` and `parity-runtime`, every existing component follows the three rules in `AGENTS.md` and wires the shared blocks in `components/baseui/`. New components are built the same way from the start. This plan also closes the loop the two earlier plans leave open: they prove "no regression against our own baseline", this one proves "same as shadcn" for every component, old and new.

## Decisions

- **One pinned upstream.** `plans/UPSTREAM.md` from `parity-attributes` task 1 holds the `shadcn-ui/ui` commit and the `@base-ui/react` version. Every port and every comparison in this plan uses that pin. Moving the pin is its own later plan.
- **A local shadcn reference app is the ground truth.** It is built in `parity-runtime` task 1 (`tmp/parity-runtime/reference/`, `/preview/<example-name>` on port 3100) and reused here. Our site is not compared to ui.shadcn.com, which renders other styles.
- **Comparison is automated and per example.** `tmp/parity-components/compare.mjs <engine> <example>` opens the example on both apps at the same viewport, then for the initial render and after each scripted interaction (open, arrow keys, typeahead, select, Escape, outside click, Tab) compares: the DOM tree (tag, `data-slot`, sorted attribute names and the values of `role`, `aria-*`, Base UI state attributes; rule 3 `data-templ-*` attributes ignored), the focused element's `data-slot`, scroll lock state, and a screenshot pixel diff with a small tolerance for font rendering. Interactions per example live in `tmp/parity-components/scenarios.json`. Output is one line per check, PASS or FAIL with the first difference.
- **Example names map one to one.** Every upstream example has an example here under the same name in snake case; a missing one is ported as part of its component's task. Our extra examples stay, they are not compared.
- **A new component is ported like the existing ones.** Templ from the upstream `ui/*.tsx` with verbatim classes, props per rule 1, the DOM per rule 2, rule 3 for the rest, behavior only from `components/baseui/` blocks plus the component's own wiring, docs page and registry entry like its siblings. Components that wrap a third party library upstream (`sonner`, `input-otp`, `embla`, `react-day-picker`, `recharts`, `react-resizable-panels`) follow the same rules against that library's rendered DOM.
- **A comparison failure is fixed or recorded, never waved through.** Either the component changes until the check passes, or the Executor log names the difference, the reason it cannot match (server rendering limit, browser API difference) and the Planner accepts it in the review. Accepted differences are listed in `plans/UPSTREAM.md` next to the pin.
- **A merged part renders what shadcn renders.** With `render={<Button />}` shadcn keeps the trigger's slot in most examples (`dropdown-menu-trigger`, `dialog-trigger`, `drawer-trigger`), but not everywhere (the collapsible example renders `button`). The DOM comparison decides per example, and the merged part rule in `AGENTS.md` changes with it: the JS then finds a trigger by its slot, the ARIA lookup goes away. Found by `parity-runtime` task 1.
- **The preview renders like upstream's examples route.** shadcn's `/examples/base/<name>` renders the example directly in `<body>`, our `/preview/<name>` inside the site layout (`[data-slot=layout]`, a flex column), which stretches a lone trigger to the full width and moves every popup. Found by `parity-runtime` task 6, where `tmp/parity-runtime/position.mjs` sets that wrapper to `display: block` to compare positions. Task 1 makes `/preview` match, the DOM and screenshot comparison depend on it.
- **Tooltip and hover card get their positioner.** shadcn renders a positioner element around `tooltip-content` and `hover-card-content` that carries the position, `data-side`, `data-align` and the variables, ours positions the content itself. Found by `parity-runtime` task 6.
- **Example content is upstream's.** Found by `parity-runtime` task 6: shadcn's `select-demo` has a sixth item "Select a fruit" with `value: null`, selected by default, ours has five, so the aligned popup is one item shorter. The example ports copy the upstream items.
- **Listbox and menu items as upstream renders them.** Found by `parity-runtime` task 8: shadcn's select and combobox popups have `role="presentation"`, the `listbox` role sits on the list inside (`SelectList`, `ComboboxList`). Its menu items are `div` elements with an id (`MenuItem`), ours are `button` or `a`. The trigger of `combobox-popup` (input inside the popup) is `role="combobox"` with `aria-haspopup="dialog"` and `tabindex="0"` (`ComboboxTrigger`), ours has no role, so `compare.mjs` finds no element there, and `combobox.js` tells the input from a trigger by that role today.
- **`data-rootownerid` on menu popups.** Found by `parity-runtime` task 8b: Base UI's `MenuPopup` renders the root menu's id there, `useHoverFloatingInteraction` uses it as the fallback scope for `safePolygon`. Ours has none.
- **Slider thumbs hold an input.** Found by `parity-runtime` task 11: Base UI renders an `<input type="range">` in each thumb, which takes the focus and, disabled, cannot be focused. Ours is a `div` with `role="slider"`, focusable by script even when disabled.
- **TooltipProvider.** Found by `parity-runtime` task 8b: shadcn exports `TooltipProvider` (Base UI's delay group, `delay` 0 by default, which shadcn's docs wrap the app in). Ours has none and every tooltip behaves as inside a provider with `delay` 0 but without the group: a neighbouring tooltip does not open at once within the group's `timeout`, and no popup renders `data-instant`.
- **One menu script.** Found by `parity-runtime` task 8b: the submenu code of `dropdownmenu.js` and `contextmenu.js` is the same apart from the event names and the positioning. Base UI has one `Menu` for both, so one shared script is the simpler pendant, done with the menu task.
- **Both engines.** Every comparison runs in chromium and webkit (`tmp/a11y-600/node_modules` Playwright).

## Tasks

Tasks 1 and 2 are written in full now; the component tasks are written after task 2, against the exact list.

### 1. Pin and reference app

- [x] Done

The reference app from `parity-runtime` task 1. `compare.mjs` extended by the DOM tree comparison and the screenshot diff from Decisions, scenarios for `button`, `dialog`, `select` as the first three to prove the extension.

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

### Task 1

The reference app from `parity-runtime` task 1 serves every upstream example at `/examples/base/<name>` on port 3100, which is the route the decisions call `/preview`.

`/preview/<name>` renders like it. shadcn's root `app/layout.tsx` puts its children right in `<body>`, the `(app)` routes add `app/(app)/layout.tsx` around them and the `(view)` routes (examples, block and chart views) add nothing. `BaseLayout` was both at once, it always wrapped the page in the `group/layout` flex column. Now `BaseLayout` is the root layout and the new `AppLayout` is the `(app)` one, used by the home, docs, charts, blocks, create, typeset and not found pages. The example preview, the block view and the chart view keep `BaseLayout`. Without the flex column a lone trigger keeps its width, and `tmp/parity-runtime/position.mjs` puts all nine popups where shadcn puts them without the `display: block` override it needed since `parity-runtime` task 6, which is removed there and in its `compare.mjs`.

`tmp/parity-components/compare.mjs <engine> <example...|all|family:<prefix>>` compares after every step the rendered DOM (one line per element with tag, sorted attribute names, the values of `role`, `aria-*` and a few layout attributes, id references as present, `data-templ-*` and both apps' infrastructure left out, unrendered subtrees skipped), the focus, the scroll lock and a screenshot pixel diff (`pixelmatch`, threshold 0.1, a step passes up to 0.2 % differing pixels, the three images of a failing step land in `out/<engine>/`). The steps come from `scenarios.json`, for now the families of `parity-runtime`. `pngjs` and `pixelmatch` are installed in `tmp/parity-components`, Playwright is linked from `tmp/a11y-600`.

`compare.mjs chromium dialog-demo` and the same in webkit run end to end. The DOM check already finds what the step checks of `parity-runtime` could not see: `DialogTitle` is an `h2` upstream, a closed trigger has no `aria-controls`, the select value keeps `data-placeholder`, and in WebKit Base UI's focus guards are `role="button"` instead of `aria-hidden` (Base UI switches them for Safari, not for a screen reader as `parity-runtime` task 7 assumed). Task 2 collects all of it.

## Planner review
