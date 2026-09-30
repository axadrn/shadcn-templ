---
title: "September 2026: Base UI behavior"
description: "Overlays, menus, lists and groups now run on ports of Base UI's own building blocks, so they behave like shadcn's."
date: 2026-09-30
---

The behavior of every interactive component now comes from small ports of Base UI 1.6.0's building blocks in `components/baseui/`: portal, dismiss, transitions, anchor positioning, focus manager, click, list navigation, typeahead, hover with its safe triangle, focus and the roving tab stop. The component scripts only wire them up, like shadcn's components wire up Base UI. The CLI installs the blocks a component needs.

What you will notice:

- **Menus** navigate with the arrow keys, Home and End and typeahead like Base UI. Disabled items are `aria-disabled` and can be highlighted, items are out of the tab order. Submenus portal when they open, Escape closes only the open submenu, and moving the pointer diagonally into a submenu keeps it open. A context menu stays open when the page scrolls or resizes, and ArrowLeft closes it.
- **Select** selects the matching item when you type on the closed trigger. Opened with the mouse and nothing selected, the popup takes the focus instead of the first item.
- **Combobox** with `AutoHighlight` highlights the first match when you type, no longer when it opens.
- **Tooltip** stays open while the pointer is on it and closes when you press its trigger. **Hover card** also opens when its trigger gets keyboard focus.
- **Tabs, radio group and toggle group** are one tab stop each, the arrow keys move inside. The toggle group gets arrow keys, Home and End, and a `Disabled` prop. The accordion no longer moves focus with the arrow keys, Base UI's does not either.
- **Drawer** renders a `div` viewport instead of a `<dialog>`. Its id is on the popup, which has `role="dialog"`, and `window.templ.drawer` takes that id as before. The modal state is `data-modal` on the viewport.

Popup positioners no longer carry `pointer-events-none`, and popups no longer carry `pointer-events-auto`. A closed positioner takes no pointer events through the transition, like Base UI's. If your own CSS relied on those classes, check it.
