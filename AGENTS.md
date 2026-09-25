# AGENTS.md

- After making changes, **never run `templ generate` / `go tool templ generate` and never manually rebuild `*.min.js` component assets**, since both JS minification and generated `_templ.go` files are handled automatically by the normal development workflow (`task dev` / watchers).

## Plans
Shared plans live in `plans/`. Read `plans/README.md` before working on one.

## Components
Every component is the 1:1 pendant of shadcn's `bases/base/ui` on Base UI, at the pin in `plans/UPSTREAM.md`. Three rules:

1. **Go props are Base UI props.** Same names in Go casing (`Open`, `DefaultOpen`, `SideOffset`), plus the props shadcn's wrapper adds (`Variant`, `Size`, `Spacing`) and the pass-through `ID`, `Class`, `Attributes`. Value props only, no callbacks or refs. Only what a component or example uses; add a prop under its Base UI name when it is needed. A prop that is not in the Base UI reference does not exist. Controlled means the `Open` or `Value` pointer is set, uncontrolled means `DefaultOpen` or `DefaultValue`.
2. **The DOM is shadcn.** `data-slot` as shadcn renders it, the state attributes Base UI renders (`data-open`, `data-checked`, `data-disabled`, `data-side`, ...), role and ARIA as Base UI. `data-horizontal` and `data-vertical` in class strings are Tailwind variants for `data-orientation` (`assets/css/shadcn-tailwind.css`), never attributes. The JS finds parts by `data-slot` and reads state from those attributes. A part merged onto another component's element (the `render` prop pendant, e.g. a trigger on `sidebar.MenuButton`) keeps that element's slot, so the JS finds it through its ARIA link (`aria-controls`, `aria-describedby`) to the slotted popup or panel. Never select by `cn-*` classes, the site's inliner flattens them to utilities. No other selector attribute.
3. **A Base UI prop that is never rendered is `data-templ-<prop>`.** The kebab case of the Base UI prop name, on the element of the part that receives it (`data-templ-side-offset`, `data-templ-close-delay`). A name that is not a Base UI prop is not allowed. Port markers React keeps in memory (portal node, owner links) use the same prefix.

The project prefix is `templ` everywhere: `window.templ` for the shared JS API, `_templ*` for element expandos. The scroll lock sets Base UI's own `data-base-ui-scroll-locked`.
