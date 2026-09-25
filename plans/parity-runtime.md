# parity-runtime: one file per Base UI building block, component scripts only wire parts

- **Planner**: Claude
- **Executor**: Claude
- **Reviewer**: none, owner decision 2026-09-25
- **Status**: ready
- **Commits**: one per task on the branch, owner decision 2026-09-25
- **Branch**: `feat/parity-runtime` from `main` 614b9d5c (parity-attributes merged as PR #619)

## Context

After `parity-attributes` the DOM and the props are shadcn and Base UI. The JS is not. Every component script is its own small framework and carries its own copy of what Base UI implements once and shares across all parts (counted on `main` 614b9d5c, excluding `floatingui` and `baseui`):

| Behavior | Base UI source (v1.6.0, `packages/react/src/`) | Own copies in |
|---|---|---|
| Lifecycle, init and re-init on DOM change | React mount and unmount | `MutationObserver` in 22 scripts |
| Portal on open, owner link, orphan sweep | `floating-ui-react/components/FloatingPortal.tsx` | 9: combobox, contextmenu, dialog, drawer, dropdownmenu, hovercard, popover, select, tooltip |
| Escape and outside press | `floating-ui-react/hooks/useDismiss.ts` | Escape in 10, outside `pointerdown` in 12 |
| Open and close transitions (`data-starting-style`, `data-ending-style`, finish after the animation) | `internals/useTransitionStatus.ts`, `internals/useOpenChangeComplete.tsx` | 8: collapsible, dialog, drawer, dropdownmenu, popover, select, toast, tooltip |
| Positioning against an anchor | `utils/useAnchorPositioning.ts` over `@floating-ui/react-dom` | 7: combobox, contextmenu, dropdownmenu, hovercard, popover, select, tooltip |
| Focus trap, initial and return focus | `floating-ui-react/components/FloatingFocusManager.tsx` | dialog (own tabbable and guards), menus and select (focus moves by hand) |
| Inert or aria-hidden outside | `floating-ui-react/utils/markOthers.ts` | dialog, drawer |
| List navigation and typeahead | `floating-ui-react/hooks/useListNavigation.ts`, `useTypeahead.ts` | dropdownmenu, contextmenu, select, combobox |
| Composite roving tab stop | `internals/composite/root/useCompositeRoot.ts` | accordion, radiogroup, tabs, slider; toggle group has none (every item tabindex 0) |
| Scroll lock | `utils/useScrollLock.ts` | done: `components/baseui/scroll_lock.js` |

The cost is visible in the history: `scroll-lock`, `escape-cascade` and `htmx-616` each fixed the same bug five to seven times, and each component drifts from its siblings between fixes.

`components/baseui/scroll_lock.js` is the model: a literal port of one Base UI file under its own names, in a directory that sorts before its consumers in the bundle (`update_scripts.go:22`), exposed on `window.templ`. `floatingui` stays as it is; it is what Base UI itself builds on.

Already done and not part of this plan: the overlay model (z-index portals, no Popover API, since 2026-08-12) and portal on open (`htmx-616`, merged 2026-09-23). The drawer is the one remaining surface on the old model: its viewport is a native `<dialog>` opened with `show()` (`drawer.js:562`), while shadcn's `drawer.tsx` renders Base UI's `Drawer.Viewport`, a `div`, with the modality `dialog.js` already builds by hand.

## Decisions

- **One Base UI building block, one file in `components/baseui/`.** File name is the snake case of the Base UI module (`use_dismiss.js`, `floating_focus_manager.js`, `mark_others.js`, `use_transition_status.js`, `use_list_navigation.js`, `use_typeahead.js`, `portal.js`), heading comment names the source path and commit. Function names are the source's. A hook becomes a function that takes elements and options and returns a cleanup, the way `scrollLock.acquire` returns its release. No file for a module with one consumer; it stays in that consumer until the second one appears.
- **A component script only wires parts.** It reads rule 3 props from the DOM, finds its parts by `data-slot`, calls the building blocks, sets the Base UI state attributes. No second copy of any block behavior. A script that needs something a block does not offer extends the block, it does not fork it.
- **Lifecycle is one block too.** One `MutationObserver` in `components/baseui/` that calls each registered component's `init` and `destroy` for added and removed roots, replacing the 23 observers. Components register by root `data-slot`. This is the React mount and unmount pendant; it is the only place that watches the DOM.
- **The drawer moves to a `div` viewport.** `Drawer.Viewport` becomes a `div` like shadcn renders it, modality comes from the same blocks `dialog.js` uses (focus manager, mark others, scroll lock, dismiss). `showModal`, `show()` and the native `<dialog>` resets in `drawer.templ` are deleted.
- **Proof is behavior, not DOM.** The DOM does not change in this plan except the drawer viewport tag and the state attributes a block adds where Base UI renders them. Every task keeps `tmp/parity-attributes/check.sh` green in chromium and webkit (DOM diff against the previous task, a11y runner, the 30 behavior suites) and adds its block's scenarios to `tmp/parity-runtime/compare.mjs`, which runs the same interaction on our preview and on the shadcn reference app (task 1) and compares focus target, open state, state attributes and scroll lock after each step.
- **The shadcn reference app is built here.** It is the ground truth for this plan's behavior and for `parity-components`; `parity-components` task 1 reuses it instead of building its own.
- **Public API names stay.** `window.templ.<component>` APIs and the component events (`dropdownmenu-open-change`, ...) keep their names and details; blocks are internal and exposed as `window.templ.<block>` like `window.templ.scrollLock` (`window.templ.lifecycle`, `.portal`, `.dismiss`, `.transition`, `.anchor`, `.focusManager`, `.markOthers`, `.listNavigation`, `.typeahead`, `.composite`).
- **Order follows use.** Blocks with the most consumers first, so every later component task finds its blocks ready.
- **Nothing else changes.** No attribute renames, no new components, no class changes.

## Carried over from parity-attributes

Found on `main` while renaming, left alone there because they are behavior (`plans/parity-attributes.md` log, tasks 3, 19, 23):

- dashboard01's range toggle group can be unpressed: the block re-presses inside `toggle-change`, then `toggle.js` commits the unpress. Upstream the group is controlled by `timeRange`.
- combobox popup pattern: after opening, focus stays on the trigger; Base UI moves it to the popup's input.
- drawer: the popup never gets `data-open`/`data-closed`, which Base UI's `DrawerPopup` renders.

## Tasks

Every component task follows the same procedure: read the Base UI source of the block and of each consumer's part, port the block literally under its source names into `components/baseui/`, then switch the consumers one by one; each consumer loses its own copy (checked by the task's grep), keeps its events and API, and passes `check.sh` plus `compare.mjs` for its examples before the next consumer starts. One commit per task, message `parity-runtime N: ...`.

### 1. Reference app and comparison harness

- [ ] Done

`tmp/parity-runtime/reference/` (gitignored): a Next.js app with the shadcn CLI at the pin in `plans/UPSTREAM.md`, style `base-nova`, base color `neutral`, every `bases/base/ui` component, and `/preview/<example>` routes rendering each upstream example alone, served on port 3100 (`README.md` says how to start it). `compare.mjs <engine> <example> [scenario]` opens the example on both apps at the same viewport and runs the scenario from `scenarios.json` (open, arrows, typeahead, select, Escape, outside press, Tab), after each step comparing the focused element's `data-slot` and role, the open state of popups, Base UI state attributes on the parts, and whether the page scroll is locked. Scenarios for the examples of every component in the Context table. Run it on `main` in both engines and save `baseline-{engine}.log`: the list of today's behavior differences, which the component tasks close.

Done when: the reference app serves every upstream example, `compare.mjs` runs every scenario on both apps in both engines, the baseline logs exist.

Checks: `node tmp/parity-runtime/compare.mjs chromium all`, same for webkit.

### 2. Lifecycle

- [ ] Done

`components/baseui/lifecycle.js`: one `MutationObserver` on `document.body` and `window.templ.lifecycle.register(selector, { init, destroy })`; `init(el)` runs once per matching element when it appears (and for the initial document at registration), `destroy(el)` when it leaves the document. It is the only DOM watcher, the mount and unmount pendant. The 22 scripts register their root selector and move their setup and teardown into `init` and `destroy`; their own observers, `_templInit`-style flags and re-init sweeps go.

Done when: `grep -l "new MutationObserver" components/*/*.js` lists only `components/baseui/lifecycle.js` and scripts that observe something other than DOM presence (the progress value observer, named in the log), `check.sh` green, htmx swaps still wire and unwire (`tmp/htmx-616` probe).

Checks: the grep, `check.sh`, `node tmp/htmx-616/htmx.mjs` against its server.

### 3. Portal

- [ ] Done

`components/baseui/portal.js`, the `FloatingPortal` pendant as the nine scripts already implement it after `htmx-616`: move to `<body>` on open, `_templPortalOwner` as the declaration site, the orphan sweep that removes portaled content whose owner left the document. The sweep becomes the `destroy` of task 2's lifecycle for the owner.

Done when: `grep -l "_templPortalOwner" components/*/*.js` lists only `portal.js`, `check.sh` green, the htmx probe green.

### 4. Dismiss

- [ ] Done

`components/baseui/use_dismiss.js`, `useDismiss.ts`: Escape with the nesting and bubbling rules from `plans/escape-cascade.md`, outside press on pointerdown with the `intentional` click variant for backdrops, returning a cleanup. The 10 Escape handlers and 12 outside press handlers switch to it; the Escape cascade probe from `escape-cascade` stays green.

Done when: `grep -lE "'Escape'|\"Escape\"" components/*/*.js` lists only `use_dismiss.js` and scripts whose Escape is not a dismissal (chart tooltip, named in the log), `check.sh` and `compare.mjs` green for every consumer.

### 5. Transitions

- [ ] Done

`components/baseui/use_transition_status.js`, `useTransitionStatus.ts` plus `useOpenChangeComplete.tsx`: set `data-starting-style` for the first frame of an open, `data-ending-style` during close, finish on `animationend`/`transitionend` or immediately when there is no animation. The 8 consumers switch; the drawer popup gets Base UI's `data-open`/`data-closed` here (carried over).

Done when: `grep -l "data-ending-style" components/*/*.js` lists only the block, the drawer popup carries `data-open`/`data-closed`, `check.sh` and `compare.mjs` green.

### 6. Anchor positioning

- [ ] Done

`components/baseui/use_anchor_positioning.js`, `useAnchorPositioning.ts` over `floatingui`: side and align from `data-templ-side`/`-align`, offsets, `flip`/`shift`/`size`, the Base UI variables (`--available-width`, `--available-height`, `--anchor-width`, `--transform-origin`), `data-side`/`data-align` on positioner and popup, `autoUpdate` with cleanup. The 7 consumers switch; select keeps its item-aligned mode as its own code, it has no Base UI counterpart in the block.

Done when: `grep -l "computePosition" components/*/*.js` lists only the block and select's item-aligned path, `check.sh` and `compare.mjs` green.

### 7. Focus manager and mark others

- [ ] Done

`components/baseui/floating_focus_manager.js` (`FloatingFocusManager.tsx`: guards, initial focus, return focus, modal trap) and `components/baseui/mark_others.js` (`markOthers.ts`: `aria-hidden` or `inert` outside, exempting `[data-base-ui-portal]`). Dialog first, then drawer, menus, select, combobox, popover. The combobox popup pattern moves focus into its input (carried over).

Done when: `dialog.js` has no `tabbable`, no guard creation and no `aria-hidden` sweep of its own, the combobox popup pattern focuses its input, `check.sh` and `compare.mjs` green.

### 8. List navigation and typeahead

- [ ] Done

`components/baseui/use_list_navigation.js` and `use_typeahead.js` from their sources: arrows, Home, End, loop, disabled items, orientation, RTL, highlight by focus or `aria-activedescendant` as each consumer uses it, typeahead with Base UI's timeout. Consumers: dropdownmenu, contextmenu, select, combobox (command stays cmdk).

Done when: none of the four consumers handles `ArrowDown` itself, typeahead works in menus as in Base UI, `check.sh` and `compare.mjs` green.

### 9. Composite roving tab stop

- [ ] Done

`components/baseui/composite.js`, `useCompositeRoot.ts`: one tab stop, arrows by orientation, Home and End, loop. Consumers: accordion, radiogroup, tabs, toggle group (gains roving like Base UI), slider keeps its own thumb keys.

Done when: toggle group items have one tab stop, accordion, radiogroup and tabs have no arrow handling of their own, `check.sh` and `compare.mjs` green.

### 10. Drawer on a div viewport

- [ ] Done

`Drawer.Viewport` becomes a `div` with `data-slot="drawer-viewport"`, modality from the blocks (focus manager, mark others, scroll lock, dismiss), `showModal`, `show()` and the `<dialog>` resets gone. The dashboard01 range toggle is controlled like upstream's `timeRange` (carried over).

Done when: `drawer.templ` renders no `<dialog>`, the drawer suites of `behavior.mjs` and `compare.mjs` green, the dashboard01 range cannot be unpressed.

### 11. Sweep

- [ ] Done

No component script defines a behavior a block owns (the greps of tasks 2 to 9 together), every difference in task 1's baseline logs is closed or listed in `plans/UPSTREAM.md` as accepted with its reason, a changelog entry if any public behavior changed.

Done when: the greps hold, `compare.mjs all` in both engines has no unexplained difference.

## Executor log

## Planner review
