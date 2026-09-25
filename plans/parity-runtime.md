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

- [x] Done

`tmp/parity-runtime/reference/` (gitignored): `shadcn-ui/ui` itself at the pin in `plans/UPSTREAM.md`, `apps/v4` after `registry:build`, which serves every upstream example alone at `/examples/base/<name>` on port 3100 (`tmp/parity-runtime/README.md` says how to start it). `compare.mjs <engine> <example|all|family:<name>>` opens the example on both apps at the same viewport and runs the steps of its component family (open, arrows, select, Escape, Tab), after each step comparing the focused element's `data-slot` and role, the open popups, Base UI state attributes on the rendered parts, and whether the page scroll is locked. Steps for every interactive family in the Context table. Run it on `main` in both engines and save `baseline-{engine}.log`: the list of today's behavior differences, which the component tasks close.

Done when: the reference app serves every upstream example, `compare.mjs` runs every family on both apps in both engines, the baseline logs exist.

Checks: `tmp/parity-runtime/baseline.sh chromium`, same for webkit.

### 2. Lifecycle

- [x] Done

`components/baseui/lifecycle.js`: one `MutationObserver` on `document.body` and `window.templ.lifecycle.register(selector, { init, destroy })`; `init(el)` runs once per matching element when it appears (and for the initial document at registration), `destroy(el)` when it leaves the document. It is the only DOM watcher, the mount and unmount pendant. The 22 scripts register their root selector and move their setup and teardown into `init` and `destroy`; their own observers, `_templInit`-style flags and re-init sweeps go.

Done when: `grep -l "new MutationObserver" components/*/*.js` lists only `components/baseui/lifecycle.js` and scripts that observe something other than DOM presence (the progress value observer, named in the log), `check.sh` green, htmx swaps still wire and unwire (`tmp/htmx-616` probe).

Checks: the grep, `check.sh`, `node tmp/htmx-616/htmx.mjs` against its server.

### 3. Portal

- [x] Done

`components/baseui/portal.js`, the `FloatingPortal` pendant as the nine scripts already implement it after `htmx-616`: move to `<body>` on open, `_templPortalOwner` as the declaration site, the orphan sweep that removes portaled content whose owner left the document. The sweep becomes the `destroy` of task 2's lifecycle for the owner.

Done when: `grep -l "_templPortalOwner" components/*/*.js` lists only `baseui/portal.js` and `baseui/lifecycle.js`, which reads the owner, `check.sh` green, the htmx probe green.

### 4. Dismiss

- [x] Done

`components/baseui/use_dismiss.js`, `useDismiss.ts`: Escape with the nesting and bubbling rules from `plans/escape-cascade.md`, outside press on pointerdown with the `intentional` click variant for backdrops, returning a cleanup. The 10 Escape handlers and 12 outside press handlers switch to it; the Escape cascade probe from `escape-cascade` stays green.

Done when: `grep -lE "'Escape'|\"Escape\"" components/*/*.js` lists only `use_dismiss.js` and scripts whose Escape is not a dismissal (chart tooltip, named in the log), `check.sh` and `compare.mjs` green for every consumer.

### 5. Transitions

- [x] Done

`components/baseui/use_transition_status.js`, `useTransitionStatus.ts` plus `useOpenChangeComplete.tsx`: set `data-starting-style` for the first frame of an open, `data-ending-style` during close, finish on `animationend`/`transitionend` or immediately when there is no animation. The 8 consumers switch; the drawer popup gets Base UI's `data-open`/`data-closed` here (carried over).

Done when: `grep -l "data-ending-style" components/*/*.js` lists only the block, the drawer popup carries `data-open`/`data-closed`, `check.sh` and `compare.mjs` green.

### 6. Anchor positioning

- [x] Done

`components/baseui/use_anchor_positioning.js`, `useAnchorPositioning.ts` over `floatingui`: side and align from `data-templ-side`/`-align`, offsets, `flip`/`shift`/`size`, the Base UI variables (`--available-width`, `--available-height`, `--anchor-width`, `--transform-origin`), `data-side`/`data-align` on positioner and popup, `autoUpdate` with cleanup. The 7 consumers switch; select keeps its item-aligned mode as its own code, it has no Base UI counterpart in the block.

Also from task 5: `select-demo` opens in popper mode here (`data-align-trigger="false"`) where shadcn aligns the popup with the trigger (`"true"`, no animation). Find out why ours falls back and match upstream.

Done when: `grep -l "computePosition" components/*/*.js` lists only the block and select's item-aligned path, `select-demo` aligns with its trigger like upstream, `check.sh` and `compare.mjs` green.

### 7. Focus manager and mark others

- [x] Done

`components/baseui/floating_focus_manager.js` (`FloatingFocusManager.tsx`: guards, initial focus, return focus, modal trap) and `components/baseui/mark_others.js` (`markOthers.ts`: `aria-hidden` or `inert` outside, exempting `[data-base-ui-portal]`). Dialog first, then drawer, menus, select, combobox, popover. The combobox popup pattern moves focus into its input (carried over).

Also from task 4: after an outside press shadcn returns focus to the trigger of a menu, select and popover, ours leaves it on the body (`compare.mjs dismiss`, the `down` and `up` steps). And `use_dismiss.js` gets the source's check for elements injected after opening, which needs the `data-base-ui-inert` marker from `mark_others.js`.

Done when: `dialog.js` has no `tabbable`, no guard creation and no `aria-hidden` sweep of its own, the combobox popup pattern focuses its input, focus after an outside press matches shadcn in `compare.mjs dismiss`, `check.sh` and `compare.mjs` green.

### 8. List navigation and typeahead

- [x] Done

`components/baseui/use_list_navigation.js` and `use_typeahead.js` from their sources: arrows, Home, End, loop, disabled items, orientation, RTL, highlight by focus or `aria-activedescendant` as each consumer uses it, typeahead with Base UI's timeout. Consumers: dropdownmenu, contextmenu, select, combobox (command stays cmdk).

Also from task 6: the submenus of both menus get a positioner there but stay nested in the root popup, positioned fixed, because the keyboard handling of the menus still finds them inside the root content. Base UI portals every submenu like a menu (`DropdownMenuSubContent` is a `DropdownMenuContent`), positions it absolute and renders `data-nested` on positioner and popup. With the list navigation rewritten here the submenu portals on open like its root, and `tmp/parity-runtime/position.mjs chromium --offset dropdown-menu-submenu context-menu-submenu` shows shadcn's positioner.

Also from task 7: menu and select items are tabbable buttons here, Base UI's items are out of the tab order (`tabindex="-1"`, the highlighted one `0`), so the focus managers of the menus and the select name the popup or the selected item as `initialFocus`. With the list navigation owning the item tabindex, those scripts drop that and the focus manager's default applies, as in `MenuPopup` and `SelectPopup`. The submenus get their `MenuPopup` focus manager too (non modal, no initial focus, no return focus), once they portal.

Done when: none of the four consumers handles `ArrowDown` itself, typeahead works in menus as in Base UI, the submenus portal and render `data-nested` like upstream and have their focus manager, no focus manager names an item as initial focus, `check.sh` and `compare.mjs` green.

### 8b. Hover

- [ ] Done

`components/baseui/use_hover.js` and `safe_polygon.js` from `useHover`, `useHoverReferenceInteraction`, `useHoverFloatingInteraction`, `useHoverInteractionSharedState` and `safePolygon.ts`: open and close delays, rest time, the safe triangle toward the popup, `closeDelay`, and the per trigger hover state. Consumers: tooltip, hover card and the submenu triggers of both menus, which each have their own simplified hover intent today. Found in task 8, the plan's Context table did not list it.

Also from task 8: the submenu triggers of both menus open on any click in our script. Base UI's `MenuSubmenuTrigger` uses `useClick` with `mousedown`, `toggle: !openOnHover`, `ignoreMouse: openOnHover` and `stickIfOpen: false`, so with hover opening a mouse press does nothing and the keyboard click opens.

Done when: no consumer has its own hover timers or `mouseover`/`mouseout` intent handling, the submenu triggers use `useClick` like `MenuSubmenuTrigger`, `transition.mjs` and `compare.mjs` green for tooltip, hover card and the submenus, with a scenario that moves the pointer diagonally from a submenu trigger into its submenu.

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

Also from task 4: Base UI's popover trigger opens on `click` (`useClick` with its default event), ours on `pointerdown`. Menu triggers open on `mousedown` in Base UI, dialog triggers on `click`. Task 7 ported `useClick` and moved the dropdown menu and the popover to it, check the remaining triggers (dialog, drawer, collapsible) against it. And from task 7: the context menu closes on every scroll and resize (`contextmenu.js`), Base UI's does not.

No component script defines a behavior a block owns (the greps of tasks 2 to 9 together), every difference in task 1's baseline logs is closed or listed in `plans/UPSTREAM.md` as accepted with its reason, a changelog entry if any public behavior changed.

Done when: the greps hold, `compare.mjs all` in both engines has no unexplained difference.

## Executor log

### Task 1

The reference is shadcn's own `apps/v4` at the pin, not a CLI app, because the CLI pulls the online registry. Its route `(view)/examples/[base]/[name]` already renders each example alone, so there is nothing to build beyond `registry:build`. The steps live in `compare.mjs` as one list per family instead of a `scenarios.json`, since they are the same for every example of a family. 336 examples exist on both sides (`both.txt`), 177 only upstream, 56 only here.

The harness compares roles and slots, not text, because our example data differs (names, emails). It counts state only on rendered parts, since Base UI does not mount closed popups and we keep them hidden. The slider step focuses the thumb's range input when there is one.

Baseline on the branch point (614b9d5c plus this plan), 20 families, 122 examples: 292 pass and 175 fail, the same lines in chromium and webkit. Every fail is a real difference. Grouped by cause:

- Trigger state. Base UI renders `data-popup-open`, `data-pressed` and `aria-expanded` on the trigger while its popup is open. We miss `data-pressed` and `data-popup-open` on menu, context menu, combobox and hover card triggers.
- Merged trigger slot. With `render={<Button />}` shadcn keeps the trigger's own slot (`dropdown-menu-trigger`, `dialog-trigger`, `drawer-trigger`), we keep `button`. This contradicts the merged part rule in `AGENTS.md` and belongs to plan 3, the scripts here find triggers by ARIA either way. The collapsible is the other way round: shadcn's example renders a plain `button`, ours `collapsible-trigger`.
- Highlight on open. Base UI highlights the first menu item on ArrowDown and the selected select item on open, we highlight later or not at all. The select popup keeps focus on its list (`select-content`), ours moves it to the item. Task 8.
- Focus on open. The popover moves focus to its first input, ours to the popup. Task 7, like the combobox popup.
- Drawer. The popup never gets `data-open`, focus lands on a popup without `role=dialog`, the scroll stays locked after Escape. Tasks 5 and 10.
- Server rendered state. An initially open accordion item misses `data-panel-open` on its trigger and `data-open` on its content until clicked. Disabled parts miss `data-disabled` on the select trigger, accordion trigger, toggle group root, switch thumb, slider track and range and a disabled tooltip trigger. A disabled slider thumb is still focusable. These are attributes, fixed in the task that touches the component or in the sweep.

Tabs, radio group, checkbox, toggle, dialog, alert dialog and sheet pass every step.

### Task 2

`components/baseui/lifecycle.js` is the React mount and unmount pendant: one `MutationObserver` on the document and `register(selector, { init, destroy })`. `init` runs once per matching element, for the document at registration and for every element that appears later. `destroy` runs once when the element is gone. A portaled subtree counts as gone once its portal owner leaves the document, like React unmounts a portal with the component that rendered it. The orphan sweeps of the nine overlays became their `destroy`, the `_templInit` style flags and the per script re-scans went. 229 lines in, 594 out.

The 22 observers are gone. `grep -l "new MutationObserver" components/*/*.js` lists `baseui/lifecycle.js` and `progress/progress.js`, whose second observer watches `aria-valuenow`, not DOM presence. `lifecycle.js` is in the 22 registry entries and docs pages next to the component script. Checkbox, radio group and switch never listed their script on the docs page, that stays as it was.

Two behaviors change on purpose:

- Tabs, select and combobox synced their state from the DOM on every mutation, now once per mounted root. React re-renders on a change inside a component, we have no render. Swapped HTML comes from the server with its state, so a fresh root is enough.
- The drawer recomputed its inert siblings on every mutation, now when a drawer mounts or unmounts. Elements added to `<body>` while a modal drawer is open stay interactive until then. Tasks 7 and 10 replace this with `markOthers`.

One fix for free: carousel autoplay kept running after its carousel was removed, `destroy` stops it now. The drawer read its server open state only when no trigger had registered it first, now always.

Checks: `check.sh` in chromium and webkit with 0 DOM changes against t36, a11y 30 of 30, behavior 30 of 30, `go test ./...` green (the inliner test counts component scripts, 32 became 33). `tmp/htmx-616/htmx.mjs` against a rebuilt probe server 110 of 110 in both engines, same as the htmx-616 final run.

### Task 3

`components/baseui/portal.js` is one function, `window.templ.portal.render(element)`: it records the declaration site as the portal owner on the first call and appends the element to `<body>` on every open, so paint order follows open order. The unmount half already lives in `lifecycle.js` since task 2, which reads the owner. So the Done when grep lists both `baseui` files. The nine scripts call `render` instead of their own move plus re-append. Their small `portal()` wrappers stay for now, because they also attach the Escape listener that task 4 removes.

Two details moved to the common path. The dialog records its owner on the first open instead of at registration, which is the same thing, because an unopened dialog is still inside its owner. The drawer used to append only when it was not in `<body>` yet, now it re-appends on every open like the others, so a reopened drawer paints above older popups.

Checks: `check.sh` in chromium and webkit, a11y 30 of 30, behavior 30 of 30, `go test ./...` green (inliner count 34). The DOM against t36 differs only on the 19 docs pages that list the new files, each by 19 elements per code block. `htmx.mjs` 110 of 110 in both engines, `compare.mjs` identical to the task 1 baseline in both engines.

### Task 4

`components/baseui/use_dismiss.js` ports `useDismiss` from Base UI 1.6.0 close to line by line: Escape on the document, the reference and the popup, the IME guard, blocking children, outside press in the capture phase with the listener on the target, sloppy and intentional, the drag out suppression, the scrollbar check and the touch rules. Like the source it runs while the popup is open, the scripts call it on open and its cleanup on close and in the lifecycle `destroy`. What differs comes from having no React tree. Inside the tree means inside the popup or inside something portaled from it, walking through the portal owners. A blocking child is another open instance inside that tree. Options React re-reads per render may be functions. The marker check for elements injected after opening needs `data-base-ui-inert` and comes with task 7.

All nine overlays use it, with the options their Base UI root passes: popover `{ mouse: "intentional", touch: "sloppy" }`, combobox `{ mouse: "sloppy", touch: "intentional" }` with the input group, clear button and chips not counting as outside, dialog and drawer `intentional` with the backdrop and `escapeKey` only for the topmost, the rest the defaults. Their Escape copies, `listenForEscape`, the dialog's composition flag and backdrop click handler and the drawer's viewport `pointerdown` are gone. `grep -lE "'Escape'|\"Escape\"" components/*/*.js` lists `use_dismiss.js` and `chart.js`, whose Escape clears a chart tooltip.

Behavior that moves to Base UI:

- The popover dismisses a mouse press outside on the click, not on the press. `compare.mjs chromium dismiss` shows it: after pressing in an empty corner shadcn and we both keep it open, after releasing both close it.
- Tooltip and hover card now also close on a press outside, which Base UI does through the same hook.
- A non modal dialog closes on a press outside, before only the backdrop click closed a dialog.
- The drawer closes on Escape even with `DisablePointerDismissal`, which in Base UI only turns off the outside press. `drawer-non-modal Escape` left the baseline fails with that.
- Outside is decided per popup. Our old check was "not inside any popup of the same kind", so a press in an outer popover left an inner one open, and a press in a select popup portaled out of a popover closed the popover. That follows from the code, no example on the site nests like this, so it is not measured.

Found on the way, not part of this task: Base UI's popover trigger opens on `click`, ours on `pointerdown`. After an outside press shadcn returns focus to the trigger of a menu, select and popover, ours leaves it on the body, which is the focus manager of task 7.

`tmp/escape/probe.mjs` still used the `data-tui-*` selectors from before parity-attributes. It is ported to `tmp/parity-runtime/escape.mjs` with the same scenarios, 0 failed expectations in both engines. `compare.mjs` gained `down` and `up` steps and a `dismiss` set: open, press in an empty corner, release, for twelve overlay examples.

Checks: `check.sh` in chromium and webkit, a11y 30 of 30, behavior 30 of 30, `go test ./...` green (inliner count 35), the DOM against rt3 differs only on the nine docs pages by the new code block. `escape.mjs` 0 failures, `compare.mjs` against the task 1 baseline one fail less (the drawer Escape) and nothing new, `compare.mjs dismiss` open state equal to shadcn everywhere except the drawer, whose missing `data-open` is task 5. Nested drawers on a backdrop click close one level at a time on both sides. `htmx.mjs` 110 of 110 in both engines.

### Task 5

`components/baseui/use_transition_status.js` ports `useTransitionStatus` with `useOpenChangeComplete` and `useAnimationsFinished`. `open(parts)` sets `data-open` and `data-starting-style` for one frame, `close(parts, animated, onComplete)` sets `data-closed` and `data-ending-style` and completes once every animation on the animated element finished (`getAnimations()`, one frame later like the source, which also catches CSS transitions since `getAnimations` flushes styles). An open cancels a close in flight. `reset(parts, open)` is the unmount without exit animation, `isEnding(element)` reads Base UI's `transitionStatus === "ending"`.

Eleven scripts use it: popover, dropdown menu with its submenus, context menu with its submenus, select, combobox, tooltip with its arrow, hover card, dialog with its backdrop, drawer with overlay and viewport, collapsible, accordion. Gone are the fixed `EXIT_MS` timers (120 or 170 ms), the dialog's `whenAnimationsFinish`, the drawer's `transitionend` with its 500 ms fallback, the collapsible's duration guess from computed CSS times with its document wide `transitionend` listener, the accordion's `animationend` listener and select's special case for the aligned mode, which now completes on the next frame because it has no animation.

Behavior that moves to Base UI:

- Every close ends when the animation ends. `tmp/parity-runtime/transition.mjs` records the status of the popup every frame after open and close on both sides. The phases are the same for every popup and the times close, for example popover gone at 113 ms upstream and hidden at 114 ms here, drawer 423 and 442 ms.
- The drawer popup, overlay and viewport carry `data-open` and `data-closed`, its trigger `data-popup-open` (carried over). In `compare.mjs` every drawer example now has shadcn's open state; left there are the trigger slot (parity-components) and focus (task 7).
- Context menu, combobox and hover card render `data-starting-style` and `data-ending-style`, which they did not before.
- A collapsed accordion panel keeps `data-closed` while hidden, it used to drop it.
- The submenus of both menus no longer put the transition attributes on their first menu item, the old helper also toggled the content's `firstElementChild`.

Our `select-demo` opens in popper mode where shadcn aligns the popup with the trigger, which is positioning and belongs to task 6.

Checks: `check.sh` in chromium and webkit, a11y 30 of 30, behavior 30 of 30, `go test ./...` green (inliner count 36). The DOM against rt4 differs on the 15 docs pages by the new code block and on five accordion panels by `data-closed`. `escape.mjs` 0 failures, `compare.mjs dismiss` open state now equal to shadcn for the drawer too, `compare.mjs` against the task 1 baseline 295 pass instead of 292 with every change in a drawer line and none new. `htmx.mjs` 110 of 110 in both engines.

### Task 5, second round

The first round left the toast and the collapsible different from upstream, which is not done. Both are Base UI now.

Collapsible and accordion get `components/baseui/use_collapsible_panel.js`, a port of `useCollapsiblePanel`, which both Base UI panels use. The motion type is read from the panel's computed style after the new state applied. Without motion a panel opens and closes at once with no starting or ending style, which is what shadcn's `collapsible-demo` shows. With a transition or keyframe animation the panel is measured to pixels, gets the starting style for one frame, the ending style one frame after the close (Base UI's `deferEndingState`), is hidden once its animations finished and goes back to `auto`. A panel that renders open skips its keyframe mount animation until it was closed once, with the inline `animation-name: none` upstream renders. Left out: `hidden="until-found"` with find in page, which no shadcn panel uses, and `React.Activity`. For this `use_transition_status.js` got the options the source has: `open` takes the animated element and an `onComplete`, `close` takes `deferEnding` and an `onEnding` step. Base UI's `animation-name: none` toggle without a style flush in between has no effect in a browser and is not ported.

The accordion also renders the state upstream renders on the server: `data-panel-open` and `data-disabled` on the trigger, `data-open` or `data-closed` on the panel (task 1 baseline), and sets `data-panel-open` when it toggles. `compare.mjs family:accordion` goes from 15 of 24 to 24 of 24.

The toast keeps its own status, since Base UI's toast manager drives it and renders no open state, but its timing is upstream's now. The starting style goes right after the height is measured, like `ToastRoot`'s layout effect, instead of after 20 ms. The toast is removed once its animations finished, `useOpenChangeComplete`, through the block's new `animationsFinished`, instead of after a fixed 500 ms.

`transition.mjs` now covers toast, accordion and collapsible. Toast gone at 551 ms upstream and 552 ms here, accordion 254 and 250 ms, collapsible at once on both sides, the phases equal in both engines.

Found on the way: the bundler's comment said lexical order puts `baseui` before its consumers, which is wrong for `accordion`, `alertdialog`, `aspectratio` and `avatar`. `update_scripts.go` now puts `baseui` first explicitly, covered in its test. The watcher had to restart once to pick it up.

Checks: `check.sh` in chromium and webkit, a11y 30 of 30, behavior 30 of 30, `go test ./...` green (inliner count 37). The DOM against rt4 differs by the new code blocks on the docs pages and by the accordion state above. `escape.mjs` 0 failures, `compare.mjs dismiss` unchanged, `compare.mjs` against the task 1 baseline 304 pass instead of 292 and nothing new, `htmx.mjs` 110 of 110 in both engines.

### Task 6

`components/baseui/use_anchor_positioning.js` ports `useAnchorPositioning` with the `floatingStyles` of `@floating-ui/react`'s `useFloating`, Base UI's fork of the `arrow` middleware (it measures against the positioner) and its `hide` middleware (an empty anchor rect counts as hidden). It runs while the popup is mounted and returns `{ cleanup, positioned }`. The positioner gets `position` with `left: 0; top: 0` and `transform: translate(x, y)` rounded to device pixels, `--available-width`, `--available-height`, `--anchor-width`, `--anchor-height` and `--transform-origin`, `data-side` (logical for `inline-start` and `inline-end`, direction from the nearest `dir`) and `data-align` on the positioner, popup and arrow, `data-anchor-hidden`, and the arrow its offset and `data-uncentered`. Until the first position it is fixed and transparent, like the source. `lazyFlip` locks the side after the first position, `applyPosition` lets a select aligned with its trigger keep its own position while the variables still update. Left out: `adaptiveOrigin`, which only popups with a viewport part use.

All seven consumers use it with the options their Base UI positioner passes: popover, tooltip and hover card the popup collision avoidance, dropdown menu, combobox and select the dropdown one, combobox with `lazyFlip`, the context menu fixed against a virtual element at the cursor with `shiftCrossAxis` and no arrow padding, the submenus with the side and offsets of shadcn's `DropdownMenuSubContent` and `ContextMenuSubContent`. Each popup stays positioned until it unmounts, where it used to stop at the start of the close. The hover card has Base UI's `inline` middleware from `utils/popups/inlineRect.ts` for triggers that wrap over several lines, in `hovercard.js` since the preview card is its only consumer. The visibility dance each script had before the enter animation is gone, the transparent positioner does that job.

Structure that moves to upstream's:

- Tooltip and hover card get their positioner element, like shadcn renders it (`TooltipPrimitive.Positioner`, `PreviewCard.Positioner`). The positioner carries the position and `role="presentation"`, the popup keeps id, role and slot. The Base UI positioner props (`side`, `align`, their offsets) moved onto it as `data-templ-*`.
- The submenus of both menus get a positioner too, but stay nested in the root popup and position fixed, which task 8 changes (written into its Done when). Their popups get shadcn's merged classes back, including `max-h-(--available-height)`, which our copies had dropped.
- `use_transition_status.js` now knows what Base UI renders where: the popup and backdrop the transition status, the positioner and arrow only `data-open` or `data-closed` (`popupStateMapping`), the positioner `transition: none` while starting (`getDisabledMountTransitionStyles`) and `pointer-events: none` while closed (`usePositioner`). Task 5 had put the starting and ending style on the positioners too.
- The select's `data-align-trigger` is the static prop value like shadcn renders it, the script no longer switches it off when the aligned mode falls back to the popper mode. That was the task 5 finding: shadcn's `select-demo` falls back too, its trigger sits at the top edge. The fallback now works like `SelectPopup`, one aligned pass per open, and the fallback holds until the popup unmounts.

`components/floatingui` vendored `@floating-ui/dom` 1.7.0 with core 1.7.0. Base UI resolves dom 1.7.6 with core 1.7.5, whose `flip` with `crossAxis: "alignment"` only leaves the main axis once every placement on it overflows it. With 1.7.0 the tooltip in `tooltip-demo` went to the right where shadcn's goes below. Both files are now the UMD builds of those versions, and `plans/UPSTREAM.md` names them next to the pin.

`tmp/parity-runtime/position.mjs <engine> [--offset] [example...]` opens each positioned popup on both sides and prints the positioner and popup. Our preview renders the demo inside the site layout, a flex column that stretches a lone trigger to the full width, so the probe sets that wrapper to `display: block`. That the preview itself should render like upstream is now a decision in `plans/parity-components.md`, along with the tooltip positioner and the example content. Every value is equal in both engines for popover, dropdown menu, tooltip, hover card, combobox, context menu and select, down to the fraction in `--transform-origin`, and with `--offset` the select aligns with its trigger like upstream (`data-side="none"`, fixed, same `top` and `left`). Left: the submenus' transform is relative to the root positioner, the visual position is the same (context menu 160 + 140 = 300, 94 + 64 = 158), and the aligned select is one item shorter, since shadcn's demo has a sixth item "Select a fruit" with `value: null`.

The Go tests that looked for the old positioning code in the scripts check the block now: `components/floatingui/positioning_test.go` pins the vendored versions and fails when a script other than the block talks to Floating UI, the component tests look for their block call and options, and the select test fails when the script sets `data-align-trigger`. `behavior.mjs` reads the tooltip, hover card and context menu from their positioner.

Checks: `check.sh` in chromium and webkit, a11y 30 of 30, behavior 30 of 30, `go test ./...` green (inliner count 38). The DOM against rt5 differs on the pages with a tooltip, hover card or submenu by the new positioner element, on the docs pages by the new code block, and by `data-align` on positioners and popups. `escape.mjs` 0 failures, `compare.mjs dismiss` unchanged, `compare.mjs` 304 pass and 163 fail, the same lines as after task 5, `transition.mjs` unchanged, `htmx.mjs` 110 of 110 in both engines. One chromium run of `compare.mjs` died once in the context menu family on a page without a body mid load, two reruns of the family and a full rerun were clean.

### Task 7

Five blocks, each a port of the Base UI 1.6.0 source it names:

- `components/baseui/tabbable.js`: Base UI's own `utils/tabbable.ts` (it does not use the tabbable package), with `activeElement` and `contains` from `internals/shadowDom.ts` and `isElementVisible`.
- `components/baseui/mark_others.js`: `markOthers.ts`, `aria-hidden` or `inert` outside with counters, and the `data-base-ui-inert` marker.
- `components/baseui/floating_focus_manager.js`: `FloatingFocusManager.tsx` with `FocusGuard` and `enqueueFocus`. The component's effects are one handle: created on mount, `open()` again for a reopen during the exit, `close(details)` when it closes, `unmount()` after the exit animation, which returns focus like the source's unmount cleanup. Guards, the Tab stop without tabbables, pointer tracking, close on focus out with the floating tree as the portal owner chain, restore focus, the outside hidden for a modal manager, initial focus, return focus with the previously focused stack, `handleTabIndex`, the Safari blur. Left out: the ancestor combobox reference in the avoided elements, and the VoiceOver `role="button"` on guards, which needs a screen reader detection the browser does not offer.
- `components/baseui/portal.js` is now `FloatingPortal.tsx`: a portal node with an id, rendered into the node of an enclosing portal or `<body>` (`useFloatingPortalNode`), and for a non modal focus manager the outside guards with the `aria-owns` span at the declaration site and the tab order handling of the node's tabbables.
- `components/baseui/use_trigger_focus_guards.js`: `useTriggerFocusGuards.ts`, the guards around the trigger of an open popover or dropdown menu.
- `components/baseui/use_click.js`: `useClick.ts`, which task 11 was to look at. It is needed here: WebKit does not focus a clicked button, the focus jumps to the sheet popup around it, and a dropdown menu that opened synchronously on `pointerdown` saw that as focus leaving and closed. Base UI opens menus on `mousedown` one frame later, after the browser moved focus. The dropdown menu uses it with `mousedown`, the popover with its default `click`.

The consumers pass their Base UI popup's options: dialog, alert dialog and sheet modal with `restoreFocus: "popup"` and the touch rule for initial focus, drawer the same with the popup as initial focus, popover non modal with its trigger guards, dropdown menu non modal with its trigger guards, context menu modal, select non modal, combobox modal with the input in the anchor (no guards, focus stays in the input, `ComboboxInternalDismissButton` before the input and after the popup) and non modal with the input in the popup, which now takes the initial focus (carried over). Gone: the dialog's own tabbable, guards, `markOthers`, return focus and Tab guard, the drawer's `inert` on every body child and its return focus, the popover's, menus' and select's hand focus on open and on close, the menus' and select's Tab close, which Base UI leaves to the focus out through the guards.

Structure that moves to upstream's:

- Every portaled part is a `[data-base-ui-portal]` node with an id. Dialog, alert dialog and sheet already had it and get shadcn's `data-slot` (`dialog-portal`, `alert-dialog-portal`, `sheet-portal`), the hover card gets `hover-card-portal`. Popover, both menus, select, combobox, tooltip and hover card get the node around their positioner, which carried the attribute itself, and the positioner gets `role="presentation"`.
- Popups get `data-base-ui-focusable` (`FOCUSABLE_POPUP_PROPS`) where shadcn renders it.
- A modal dialog and drawer render the `InternalBackdrop` of `DialogPortal` while mounted, which `useDismiss` treats as a backdrop.
- `useDismiss` got the source's check for elements injected after opening (carried over from task 4).
- The drawer releases its scroll lock when the close starts, like the dialog.
- `popupFor` and `isPositioner` of five scripts took the positioner's first child, which is now the inside focus guard, and look for the slotted popup instead.

Kept for task 8, written into its Done when: menu and select items are tabbable buttons here and Base UI's are not, so the menus and the select name the popup or the selected item as `initialFocus` where Base UI's default lands there by itself. The submenus get their focus manager when they portal.

Found on the way: the context menu closes on every scroll and resize, which Base UI does not do. That is for the sweep.

The DOM diff of `check.sh` against rt6 is no signal this time: the new portal node moves every popup one level down and the diff compares elements by position, so everything after it shifts. `tmp/parity-runtime/structure.mjs [example...]` compares the structure with shadcn instead (body children, guards and their parents, `aria-owns`, `aria-hidden`, markers), and dialog, popover, dropdown menu and select match it.

Checks: a11y 30 of 30, behavior 30 of 30, `go test ./...` green (inliner count 43, the CLI test looked for `(() =>` in the installed dialog script and looks for its API now), in chromium and webkit. `escape.mjs` 0 failures, `compare.mjs dismiss` 34 pass instead of 30, the focus after an outside press is shadcn's for popover, menus and select (the trigger's slot name aside), `compare.mjs` 308 pass instead of 304 with only drawer and popover lines changed, all better, `position.mjs` and `transition.mjs` unchanged, `htmx.mjs` 110 of 110 in both engines. The behavior suites read tooltip, hover card, popover, context menu, combobox and select through the portal node now.

### Task 8

Two blocks, each a port of the Base UI 1.6.0 source it names:

- `components/baseui/use_list_navigation.js`: `useListNavigation.ts` with the list helpers of `utils/composite.ts`. The hook's effects are one handle: `open()` after the popup opened, `close()`, `sync()` after the component set its active index itself, `cleanup()`. Item props are delegated on the popup (`focusin`, `click`, `mousemove`, `pointerout`), the reference props go on the trigger or the input. Left out: grid navigation, which only a grid combobox uses.
- `components/baseui/use_typeahead.js`: `useTypeahead.ts`. The menus pass `TYPEAHEAD_RESET_MS` (500), the select keeps the default like `SelectRoot`.

The consumers pass their root's options:

- Dropdown menu: `MenuRoot` with `loopFocus`, an empty `disabledIndices`, opening on an arrow key. Each submenu gets its own nested instance with the submenu trigger as reference and the parent's vertical orientation, which the source reads from the floating tree.
- Context menu: the same, but Base UI nests the root in `ContextMenu.Root`, so `nested` is set there too (ArrowLeft closes it) and no arrow key opens it.
- Select: `SelectRoot` with `selectedIndex`, the highlight kept while closing and cleared on unmount. The typeahead skips disabled items, and typing on the closed trigger selects the match.
- Combobox: `AriaCombobox` with virtual focus (`aria-activedescendant`), `loopFocus`, and `allowEscape` without autoHighlight.

Highlighting is `data-highlighted` plus the roving `tabindex` of the item props (0 on the highlighted item, -1 on the rest). A submenu trigger keeps 0 while its submenu is open and clears the parent's highlight on blur, like `MenuSubmenuTrigger`.

Gone from the four scripts: `moveFocus`, `focusItem`, the document `keydown` navigation, `OPEN_KEYS`, the select's own typeahead buffer, the pointer handlers that focused the item under the pointer, and the combobox `moveHighlight` and `mousemove` highlight. The focus managers use their default initial focus again, except the submenus (`false`) and the combobox input.

Structure that moves to upstream's:

- Menu items are `aria-disabled` with `data-disabled` instead of natively disabled, and out of the tab order (`tabindex="-1"`). Disabled items are highlighted like upstream's.
- Submenus portal on open into the root's portal node. Positioner and popup render `data-nested` and `data-base-ui-focusable`. The dropdown submenu is positioned `absolute`, the context menu one `fixed` like every positioner inside a context menu (`MenuPositioner`). Both get their `MenuPopup` focus manager: non modal, no initial focus, no return focus. The menu scripts find a submenu's tree through the portal owners.
- Each submenu gets its `MenuRoot` `useDismiss`. Escape closes only the submenu (`closeParentOnEsc` is false) and focus returns to its trigger (`MenuPopup` sets `returnFocus` when there is a trigger element). Before, Escape in a submenu closed the whole menu, which `escape.mjs` had written down as expected. Its scenario G now expects shadcn's two steps.
- The focus manager treats focus that moves to an ancestor's popup or reference as inside, like the source's `getNodeAncestors` check. Without that, returning from a submenu closed it.
- The select and combobox popups get `tabindex="-1"`, which shadcn renders (`FOCUSABLE_POPUP_PROPS`). Without it a mouse opened select left focus on `<body>`.
- The popups render `aria-orientation="vertical"` from the list navigation's floating props where upstream does.

Harness: the a11y runner waits a frame after the menu wrap keys. Base UI focuses a wrapped item in the next frame (`forceSyncFocus` false), on the reference the frame had already run when Playwright read the focus. The behavior suites find an open submenu in the document now.

State attributes that `compare.mjs` showed missing next to the list navigation and that Base UI renders: `data-pressed` and `data-popup-open` on the context menu trigger, on the combobox input and triggers, `data-popup-open` on the combobox clear button, `data-disabled` on a disabled select trigger and combobox input and trigger. And the combobox `autoHighlight` is Base UI's `input-change` mode: typing highlights the first match, opening does not.

Checks: a11y 30 of 30, behavior 30 of 30, `go test ./...` green (inliner count 45), in chromium and webkit. The DOM against rt7 changes by `tabindex="-1"` on menu items, `aria-orientation` on the list popups, `data-highlighted` where an item is highlighted, the portal node around the submenus and the new code blocks on the docs pages. `escape.mjs` 0 failures, `compare.mjs dismiss` 36 pass instead of 34, `compare.mjs` 367 pass and 96 fail in chromium, 379 and 88 in webkit, instead of 308 and 159. The context menu family is 50 of 50, the combobox 51 of 52 (the `combobox-popup` role above), the dropdown menu fails only on the trigger slot, the select only on the null item and the listbox role. `position.mjs --offset` puts both submenus where shadcn puts them, `transition.mjs` unchanged apart from sampling jitter on both sides. `htmx.mjs` 110 of 110 in both engines, see below.

`htmx.mjs` had checked nothing since the rename to `templ`: it still asked for `data-tui-*` and `_tuiPortalOwner`, and port 8099 was held by a two day old probe server that served the old bundle, so every "110 of 110" in the logs of tasks 2 to 7 came from that old build. The probe now reads the portal nodes (`[data-base-ui-portal]` in their `[data-templ-portal]` holder, `_templPortalOwner`) and loads the site stylesheet, which the fixture page lacks and which puts the dialog popup over Base UI's internal backdrop. Rebuilt and run on a free port it is 110 of 110 against this task. The old servers on 8095 to 8099 still run, they are not this task's.

Found on the way, written into plan 3's decisions: shadcn's select and combobox popups have `role="presentation"` with the listbox on the list inside, its menu items are `div` elements with an id, and the `combobox-popup` trigger is `role="combobox"`.

## Planner review
