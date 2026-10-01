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
- **No sonner.** Decided by Axel on 2026-10-01: upstream ships `sonner.tsx` next to `toast.tsx`, we port only the newer Base UI toast. Sonner and its examples are not missing, they are out of scope.
- **Both engines.** Every comparison runs in chromium and webkit (`tmp/a11y-600/node_modules` Playwright).

## Tasks

Tasks 1 and 2 are written in full now; the component tasks are written after task 2, against the exact list.

### 1. Pin and reference app

- [x] Done

The reference app from `parity-runtime` task 1. `compare.mjs` extended by the DOM tree comparison and the screenshot diff from Decisions, scenarios for `button`, `dialog`, `select` as the first three to prove the extension.

Done when: the reference app serves `/preview/<name>` for every upstream example, `compare.mjs chromium dialog-demo` runs end to end on both apps and prints its checks.

Checks: `node tmp/parity-components/compare.mjs chromium dialog-demo`, same for webkit.

### 2. Inventory

- [x] Done

`tmp/parity-components/inventory.md`: one row per upstream `ui/*.tsx` with our directory or "missing", one row per upstream example with our example or "missing", and for every existing component the result of `compare.mjs` over all its examples in both engines. Scenarios for every existing example added to `scenarios.json`.

Done when: every upstream component and example has a row, every existing component has a PASS or FAIL count per engine.

Checks: the table is complete against `gh api repos/shadcn-ui/ui/contents/apps/v4/registry/bases/base/ui` at the pin.

### 3. What every component shares

- [ ] Done

The causes that show up across components in task 2's inventory, fixed first because `compare.mjs` reports only the first DOM difference of a step and these hide the rest:

- A closed trigger renders no `aria-controls` upstream (185 first differences): Base UI links trigger and popup in its store and renders `aria-controls` only while the popup is open. Dialog, alert dialog, sheet, drawer, popover, both menus, select, combobox, command dialog and collapsible. The scripts find the popup through that link today, so the link becomes a port marker under rule 3 (React keeps it in memory) and `aria-controls` follows the open state.
- The tooltip trigger renders no `aria-describedby` upstream (24), the same way: a port marker for the link, the ARIA as Base UI renders it.
- Icons render `data-lucide` (120), lucide-react renders none.
- In Safari Base UI's focus guards are `role="button"` without `aria-hidden` (78, webkit only), the switch `parity-runtime` task 7 left out.
- An attribute literally named `else` on checkbox, field and label parts (42): a templ `else` branch inside an attribute list renders as an attribute.

Done when: none of these shows up in `compare.mjs all` in either engine, `check.sh` green with its URLs on the port of `tmp/parity-components/serve.sh`.

### 4 onward. Written after task 3

Planned shape: after task 3 a new full run, then one task per existing component that still fails, then one task per missing component (11: attachment, bubble, direction, marker, menubar, message, message-scroller, native-select, navigation-menu, questionnaire, scroll-area), then one task per missing example (177, 57 of them the `-rtl` variants that need `direction`), then a final full run of `compare.mjs` over every example in both engines with the result appended to `plans/UPSTREAM.md`.

## Executor log

### Task 1

The reference app from `parity-runtime` task 1 serves every upstream example at `/examples/base/<name>` on port 3100, which is the route the decisions call `/preview`.

`/preview/<name>` renders like it. shadcn's root `app/layout.tsx` puts its children right in `<body>`, the `(app)` routes add `app/(app)/layout.tsx` around them and the `(view)` routes (examples, block and chart views) add nothing. `BaseLayout` was both at once, it always wrapped the page in the `group/layout` flex column. Now `BaseLayout` is the root layout and the new `AppLayout` is the `(app)` one, used by the home, docs, charts, blocks, create, typeset and not found pages. The example preview, the block view and the chart view keep `BaseLayout`. Without the flex column a lone trigger keeps its width, and `tmp/parity-runtime/position.mjs` puts all nine popups where shadcn puts them without the `display: block` override it needed since `parity-runtime` task 6, which is removed there and in its `compare.mjs`.

`tmp/parity-components/compare.mjs <engine> <example...|all|family:<prefix>>` compares after every step the rendered DOM (one line per element with tag, sorted attribute names, the values of `role`, `aria-*` and a few layout attributes, id references as present, `data-templ-*` and both apps' infrastructure left out, unrendered subtrees skipped), the focus, the scroll lock and a screenshot pixel diff (`pixelmatch`, threshold 0.1, a step passes up to 0.2 % differing pixels, the three images of a failing step land in `out/<engine>/`). The steps come from `scenarios.json`, for now the families of `parity-runtime`. `pngjs` and `pixelmatch` are installed in `tmp/parity-components`, Playwright is linked from `tmp/a11y-600`.

`compare.mjs chromium dialog-demo` and the same in webkit run end to end. The DOM check already finds what the step checks of `parity-runtime` could not see: `DialogTitle` is an `h2` upstream, a closed trigger has no `aria-controls`, the select value keeps `data-placeholder`, and in WebKit Base UI's focus guards are `role="button"` instead of `aria-hidden` (Base UI switches them for Safari, not for a screen reader as `parity-runtime` task 7 assumed). Task 2 collects all of it.

### Task 2

`tmp/parity-components/inventory.md` (from `inventory.py`) has a row for every upstream component and example and the `compare.mjs` result of every existing example per component in both engines.

Components: 62 upstream, 50 here, sonner out of scope, 11 missing: attachment, bubble, direction, marker, menubar, message, message-scroller, native-select, navigation-menu, questionnaire, scroll-area.

Examples: 513 upstream, 336 here, 177 missing (57 `-rtl` variants, the chat set, sidebar parts, input group and shimmer and scroll fade examples), 56 more here.

Comparison over the 336 examples, 2930 checks: chromium 2232 pass and 698 fail, webkit 2217 and 713. Every component with examples fails somewhere, mostly on the DOM check. The causes most first differences go back to are listed in task 3; then come the accordion's `dir`, the combobox input's attributes, `data-activation-direction` on tabs and collapsible, `role="group"` on field and slider, `aria-disabled="false"` on collapsible and toggle buttons, the radio input's `name`, `span` where we render `div` (avatar, empty, item), the dialog title's `h2`, the menus' internal backdrop (`MenuPositioner` renders one, `modal` is true by default), the select value's `data-placeholder`, the calendar's `data-mode`, the breadcrumb's `aria-label` case and the drawer's `data-drawer-content`. Example only attributes (`data-*-demo` markers of our examples) also differ.

The harness serves our site on port 8190 through `tmp/parity-components/serve.sh`, a binary built from the working tree, because another project took port 8090 from `task dev` twice during the runs. `compare.mjs` reads `TEMPL_URL`, default `http://localhost:8190`, and runs four examples at a time (`--jobs=4`), about 15 minutes per engine for all of them.

## Planner review
