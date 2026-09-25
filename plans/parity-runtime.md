# parity-runtime: one file per Base UI building block, component scripts only wire parts

- **Planner**: Claude
- **Executor**: Codex
- **Status**: planning, starts after `plans/parity-attributes.md` is merged
- **Branch**: `feat/parity-runtime` from `main` after the parity-attributes merge

## Context

After `parity-attributes` the DOM and the props are shadcn and Base UI. The JS is not. Every component script is its own small framework and carries its own copy of what Base UI implements once and shares across all parts (counted on `main` da86e0c7, excluding `floatingui`):

| Behavior | Base UI source | Own copies in |
|---|---|---|
| Positioning against an anchor | `utils/useAnchorPositioning.ts` over `@floating-ui/react-dom` | 7 scripts |
| Escape and outside press dismissal | `floating-ui-react` `useDismiss` | Escape in 10, outside `pointerdown` in 11 |
| Portal on open, owner link | `Portal` parts, `FloatingPortal` | 7 `portal()` copies (combobox, contextmenu, dialog, dropdownmenu, drawer, hovercard, popover, ...) |
| Focus trap and return | `floating-ui-react` `FloatingFocusManager` | 6 scripts |
| Inert or aria-hidden outside | `floating-ui-react` `markOthers` | dialog, drawer, toast |
| Open and close transitions (`data-starting-style`, `data-ending-style`) | `utils/useTransitionStatus.ts`, `utils/useOpenChangeComplete.ts` | 8 scripts |
| List navigation and typeahead | `floating-ui-react` `useListNavigation`, `useTypeahead`, `utils/useCompositeRoot` | 12 scripts |
| Lifecycle (init, re-init on DOM change) | React mount and unmount | `MutationObserver` in 23 scripts |
| Scroll lock | `utils/useScrollLock.ts` | done: `components/baseui/scroll_lock.js` |

The cost is visible in the history: `scroll-lock`, `escape-cascade` and `htmx-616` each fixed the same bug five to seven times, and each component drifts from its siblings between fixes.

`components/baseui/scroll_lock.js` is the model: a literal port of one Base UI file under its own names, in a directory that sorts before its consumers in the bundle (`update_scripts.go:22`), exposed on `window.templ`. `floatingui` stays as it is; it is what Base UI itself builds on.

Already done and not part of this plan: the overlay model (z-index portals, no Popover API, since 2026-08-12) and portal on open (`htmx-616`, merged 2026-09-23). The drawer is the one remaining surface on the old model: its viewport is a native `<dialog>` opened with `show()` (`drawer.js:562`), while shadcn's `drawer.tsx` renders Base UI's `Drawer.Viewport`, a `div`, with the modality `dialog.js` already builds by hand.

## Decisions

- **One Base UI building block, one file in `components/baseui/`.** File name is the snake case of the Base UI module (`use_dismiss.js`, `floating_focus_manager.js`, `mark_others.js`, `use_transition_status.js`, `use_list_navigation.js`, `use_typeahead.js`, `portal.js`), heading comment names the source path and commit. Function names are the source's. A hook becomes a function that takes elements and options and returns a cleanup, the way `scrollLock.acquire` returns its release. No file for a module with one consumer; it stays in that consumer until the second one appears.
- **A component script only wires parts.** It reads rule 3 props from the DOM, finds its parts by `data-slot`, calls the building blocks, sets the Base UI state attributes. No second copy of any block behavior. A script that needs something a block does not offer extends the block, it does not fork it.
- **Lifecycle is one block too.** One `MutationObserver` in `components/baseui/` that calls each registered component's `init` and `destroy` for added and removed roots, replacing the 23 observers. Components register by root `data-slot`. This is the React mount and unmount pendant; it is the only place that watches the DOM.
- **The drawer moves to a `div` viewport.** `Drawer.Viewport` becomes a `div` like shadcn renders it, modality comes from the same blocks `dialog.js` uses (focus manager, mark others, scroll lock, dismiss). `showModal`, `show()` and the native `<dialog>` resets in `drawer.templ` are deleted.
- **Proof is behavior, not DOM.** The DOM does not change in this plan except the drawer viewport tag. Every task keeps `tmp/a11y-600/a11y.mjs` green in chromium and webkit, and adds its block's scenarios to `tmp/parity-runtime/behavior.mjs`: the same interaction run on our docs page and on the shadcn reference app from `plans/parity-components.md` task 1, comparing focus target, open state, state attributes and scroll lock after each step.
- **Order follows use.** Blocks with the most consumers first, so every later component task finds its blocks ready.
- **Nothing else changes.** No attribute renames, no new components, no class changes.

## Carried over from parity-attributes

Found on `main` while renaming, left alone there because they are behavior (`plans/parity-attributes.md` log, tasks 3, 19, 23):

- dashboard01's range toggle group can be unpressed: the block re-presses inside `toggle-change`, then `toggle.js` commits the unpress. Upstream the group is controlled by `timeRange`.
- combobox popup pattern: after opening, focus stays on the trigger; Base UI moves it to the popup's input.
- drawer: the popup never gets `data-open`/`data-closed`, which Base UI's `DrawerPopup` renders.

## Tasks

Written in full when `parity-attributes` is merged, against the code as it is then. Planned shape, one commit each:

1. Probe and baseline: `behavior.mjs` against our site and the reference app, record today's differences per component.
2. `baseui/portal.js` and the lifecycle observer; every component registers, the 23 observers go.
3. `baseui/use_dismiss.js`; Escape and outside press in all 11 consumers.
4. `baseui/use_transition_status.js`; starting and ending style in all 8 consumers.
5. `baseui/floating_focus_manager.js` and `baseui/mark_others.js`; dialog first, then menus, select, combobox.
6. Anchored positioning pendant of `useAnchorPositioning.ts` over `floatingui`; the 7 consumers.
7. `baseui/use_list_navigation.js` and `baseui/use_typeahead.js`; the 12 consumers, menus and select first.
8. Drawer on a `div` viewport with the shared blocks.
9. Sweep: no component script defines a behavior a block owns; `behavior.mjs` differences from task 1 closed or listed as deliberate with a reason.

## Executor log

## Planner review
