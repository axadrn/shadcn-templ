# Upstream pin

The reference every parity plan ports from and compares against.

- **shadcn**: `shadcn-ui/ui` commit `c257f688cf4de7ec10cc1be84cad29cd4631182c`, the latest touching `apps/v4/registry/bases/base` on 2026-09-24. Components in `apps/v4/registry/bases/base/ui`, style `base-nova`.
- **Base UI**: `@base-ui/react` `1.6.0`, the version in `apps/v4/package.json` at that commit. Sources from `mui/base-ui` tag `v1.6.0`.
- **Floating UI**: `@floating-ui/dom` `1.7.6` with `@floating-ui/core` `1.7.5`, what `@base-ui/react` 1.6.0 resolves at that commit (through `@floating-ui/react-dom` `2.1.8`). `components/floatingui/` vendors their UMD builds.
- **Pinned**: 2026-09-24, in `plans/parity-attributes.md` task 1.

Moving the pin is its own plan.

## Accepted differences

- **No sonner.** shadcn ships `ui/sonner.tsx` next to `ui/toast.tsx`. shadcn-templ ports only the Base UI toast, by the owner's decision on 2026-10-01 (`plans/parity-components.md`).
- **Sonner's toasts in examples.** Where an upstream example calls sonner's `toast(...)` (`questionnaire-freeform`, `questionnaire-multiple`, `questionnaire-shortcuts`, `sidebar-group-action`), ours adds a Base UI toast: same message, the toast's own place and look (pixels only).
- **Reference bugs.** Upstream's `command-dialog` crashes on its shortcut (`Cannot read properties of undefined (reading 'subscribe')`); ours opens and closes. Upstream's prebuilt calendar keeps `cn-calendar-dropdown-root` unflattened, so its dropdowns have no border; ours do, within the pixel tolerance. Upstream's RTL headings render Arabic through the Geist stack (no Arabic glyphs, tofu); ours do the same.
- **Scheduling.** In `select-demo`, upstream's first outside focus guard misses `data-base-ui-inert` for one frame after the click (a render that has not committed yet); ours sets it at once.
- **Go and templ content.** The examples' people, avatars and texts stay in the Go and templ universe by the owner's decision on 2026-10-04 (`AGENTS.md`): `avatar-demo`, `empty-avatar-group`, `hover-card-demo`, `item-group`, under 0.4 % of the pixels.
- **Lucide for tabler.** Where upstream renders `@tabler/icons-react` icons, ours renders the nearest lucide icon, by the owner's decision on 2026-10-04 (for now).

## Final run

`plans/parity-components.md` task 18, 2026-10-04, Chromium, against `parity/reference-next.sh` (the real `next build` of `apps/v4`): 557 examples, 5789 checks (DOM, focus, scroll lock, pixels, console and network errors per step), 5729 pass, 60 fail. Every fail is one of the accepted differences above, or an Escape step that passes alone and failed only with three compares in parallel (`alert-dialog-media`, `alert-dialog-small-media`, `dialog-demo`, `dialog-scrollable-content`, `sheet-no-close-button`, `drawer-nested`). `parity/errors.mjs`: 705 pages (every docs page and every preview), no page error, console error or warning, failed request or HTTP error.
