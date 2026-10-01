# Upstream pin

The reference every parity plan ports from and compares against.

- **shadcn**: `shadcn-ui/ui` commit `c257f688cf4de7ec10cc1be84cad29cd4631182c`, the latest touching `apps/v4/registry/bases/base` on 2026-09-24. Components in `apps/v4/registry/bases/base/ui`, style `base-nova`.
- **Base UI**: `@base-ui/react` `1.6.0`, the version in `apps/v4/package.json` at that commit. Sources from `mui/base-ui` tag `v1.6.0`.
- **Floating UI**: `@floating-ui/dom` `1.7.6` with `@floating-ui/core` `1.7.5`, what `@base-ui/react` 1.6.0 resolves at that commit (through `@floating-ui/react-dom` `2.1.8`). `components/floatingui/` vendors their UMD builds.
- **Pinned**: 2026-09-24, in `plans/parity-attributes.md` task 1.

Moving the pin is its own plan.

## Accepted differences

- **No sonner.** shadcn ships `ui/sonner.tsx` next to `ui/toast.tsx`. shadcn-templ ports only the Base UI toast, by the owner's decision on 2026-10-01 (`plans/parity-components.md`).
