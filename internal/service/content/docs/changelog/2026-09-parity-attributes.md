---
title: "September 2026 - shadcn DOM, Base UI props"
description: "The data-tui-* attributes are gone: components render shadcn's DOM and name their props after Base UI."
date: 2026-09-24
---

Every component now follows three rules:

- **Go props are Base UI props.** Same names in Go casing, only what a component uses.
- **The DOM is shadcn.** `data-slot`, the state attributes Base UI renders (`data-open`, `data-checked`, `data-side`, ...), role and ARIA. Scripts find parts by `data-slot`.
- **A Base UI prop that is never rendered is `data-templ-<prop>`**, for example `data-templ-side-offset`.

The `data-tui-*` attributes are gone, and so is `window.tui`: the shared JavaScript API is `window.templ` (`window.templ.dialog.open(id)`, `window.templ.toast.add(...)`, ...). `window.templ.tabs.setActive` takes the `[data-slot=tabs]` element instead of an id. Components built on other libraries render those libraries' own attributes, like shadcn does: `cmdk-*` on the command menu, `data-input-otp` on the OTP input, `data-group`, `data-panel` and `data-separator` on resizable panels, `data-day` with the ISO date on calendar day cells.

Props renamed to their Base UI names:

- dropdown menu and context menu items: `DisableCloseOnClick` is `CloseOnClick *bool`
- select content: `DisableAlignItemWithTrigger` is `AlignItemWithTrigger *bool`; `OpenMethod` is removed
- dialog, sheet, command dialog, drawer: `DisableDismissible` is `DisablePointerDismissal`
- dialog content and drawer: `DisableModal` is `Modal *bool`
- radio group items: `Name`, `Form`, `Checked` and `DefaultChecked` are removed, they come from the group (`radiogroup.RadioGroup` with `Name` and `DefaultValue`)
- tabs: `TabsID` on triggers and content is removed
- dropdown menu content: `MobileSide` and `MobileAlign` are removed. shadcn's sidebar blocks switch the side in the block (`side={isMobile ? "bottom" : "right"}`); the templ blocks do the same through the new `window.templ.sidebar.onMobileChange`, see [Sidebar](/docs/components/sidebar#usesidebar)

Base UI props that default to `true` are `*bool`, so leaving them out keeps Base UI's default and setting them reads like the Base UI prop:

```go
// before
dropdownmenu.ItemProps{DisableCloseOnClick: true}
selectcomp.ContentProps{DisableAlignItemWithTrigger: true}
dialog.ContentProps{DisableModal: true}
drawer.Props{DisableModal: true, DisableDismissible: true}

// after
dropdownmenu.ItemProps{CloseOnClick: utils.Ptr(false)}
selectcomp.ContentProps{AlignItemWithTrigger: utils.Ptr(false)}
dialog.ContentProps{Modal: utils.Ptr(false)}
drawer.Props{Modal: utils.Ptr(false), DisablePointerDismissal: true}
```

Writing `Modal: false` does not compile, so a wrong value cannot slip through.

To find what your own code still reads, search it for the old names:

```sh
grep -rn "data-tui-" --include='*.templ' --include='*.js' --include='*.css' .
grep -rn "window.tui\b" --include='*.templ' --include='*.js' .
```

Selectors move to the component's `data-slot`, state checks to the Base UI attribute (`[data-open]` instead of an initial-open marker), and configuration you set from script to the matching `data-templ-*` attribute.
