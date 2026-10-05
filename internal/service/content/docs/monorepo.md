---
title: "Monorepo"
description: "Using shadcn-templ components and CLI in a monorepo."
---

A Go monorepo is one module with several workspaces: one `go.mod` at the root, your apps under `apps/` and your components in a ui package under `packages/ui`.

The CLI understands the monorepo structure and will install the components, utils and registry dependencies to the correct paths and handle imports for you.

## Getting started

<Steps>

### Create a new monorepo project

To create a new monorepo project, run the `init` command with the `--monorepo` flag.

```shell
shadcn-templ init my-app --monorepo
```

This will create a new monorepo project with two workspaces: `web` and `ui`, one Go module, and [Task](https://taskfile.dev) as the build system.

```shell
cd my-app
go mod tidy
task dev
```

Everything is set up for you, so you can start adding components to your project.

### Add components to your project

To add components to your project, run the `add` command **in the path of your app**.

```shell
cd apps/web
```

```shell
shadcn-templ add [COMPONENT]
```

The CLI will figure out what type of component you are adding and install the correct files to the correct path.

For example, if you run `shadcn-templ add button`, the CLI will install the button component under `packages/ui` and update the import path for components in `apps/web`.

If you run `shadcn-templ add login-01`, the CLI will install the `button`, `card`, `field`, `input` and `label` components under `packages/ui` and the `login01` block under `apps/web/components/blocks`.

### Importing components

You can import components from the `packages/ui` package as follows:

```templ title="apps/web/pages/home.templ"
import "my-app/packages/ui/components/button"
```

You can also import utilities from the `packages/ui` package.

```go
import "my-app/packages/ui/utils"
```

### Add another app

Copy `apps/web` to `apps/admin` without its `components.json`, change the import paths from `my-app/apps/web/...` to `my-app/apps/admin/...`, and run `init` in it. It finds `packages/ui` and joins it.

```shell
shadcn-templ init --cwd apps/admin
```

Then add it to the root `Taskfile.yml` next to `web`:

```yaml title="Taskfile.yml"
includes:
  web:
    taskfile: ./apps/web/Taskfile.yml
    dir: ./apps/web
  admin:
    taskfile: ./apps/admin/Taskfile.yml
    dir: ./apps/admin
```

Each app's `task dev` picks a free app port and a free templ proxy port, so both run side by side.

</Steps>

## File Structure

When you create a new monorepo project, the CLI will create the following file structure:

```txt
apps
└── web               # Your app goes here.
    ├── assets
    │   ├── js
    │   │   └── shadcn-templ-<hash>.js
    │   └── assets.go
    ├── components
    │   └── blocks
    │       └── login01
    ├── layouts
    ├── pages
    │   └── home.templ
    ├── components.json
    ├── main.go
    └── Taskfile.yml
packages
└── ui                # Your components and dependencies are installed here.
    ├── components
    │   ├── button
    │   ├── scripts.templ
    │   └── scripts_bundle.go
    ├── styles
    │   └── globals.css
    ├── utils
    │   └── shadcn-templ.go
    └── components.json
Dockerfile
go.mod
Taskfile.yml
```

## Requirements

1. Every workspace must have a `components.json` file. The `go.mod` file tells Go how to build the module. A `components.json` file tells the CLI how and where to install components.

2. The `components.json` file must properly define aliases for the workspace. This tells the CLI how to import components and utilities. Aliases are Go import paths under the module; file paths (`tailwind.css`, `scripts.dir`) are relative to the `components.json` they are in.

```json showLineNumbers title="apps/web/components.json"
{
  "scripts": {
    "dir": "assets/js",
    "path": "/assets/js"
  },
  "$schema": "https://shadcn-templ.com/schema/components.json",
  "style": "base-nova",
  "tailwind": {
    "css": "../../packages/ui/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "my-app/apps/web/components",
    "utils": "my-app/packages/ui/utils",
    "ui": "my-app/packages/ui/components"
  }
}
```

```json showLineNumbers title="packages/ui/components.json"
{
  "$schema": "https://shadcn-templ.com/schema/components.json",
  "style": "base-nova",
  "tailwind": {
    "css": "styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "my-app/packages/ui/components",
    "utils": "my-app/packages/ui/utils",
    "ui": "my-app/packages/ui/components"
  }
}
```

3. Ensure you have the same `style`, `iconLibrary` and `baseColor` in both `components.json` files. `init` in an app copies its `iconLibrary`, `menuColor`, `menuAccent` and `rtl` to `packages/ui`, `apply` also its `style` and `baseColor`. `add` installs the ui components in the style of `packages/ui`.

4. The ui package's CSS must point Tailwind at the apps and at itself. Each app builds it with `tailwindcss -i ../../packages/ui/styles/globals.css`, and Tailwind only scans the app on its own.

```css showLineNumbers title="packages/ui/styles/globals.css"
@import "tailwindcss";
@source "../../../apps";
@source "..";
```

By following these requirements, the CLI will be able to install ui components, blocks and utils to the correct paths and handle imports for you.

<Callout className="mt-6">
  The theme lives once, in `packages/ui/styles/globals.css`. An app that wants
  its own theme points its `tailwind.css` and its Tailwind build at its own CSS
  file, which imports the shared one and overrides the variables, or replaces
  it.
</Callout>

## Scripts

The component JavaScript lives in `packages/ui`, so the bundle is built from it. `add` and `bundle` write it into the `scripts.dir` of every app whose `ui` alias points at the package, the same bytes and the same hash for each, and `packages/ui/components/scripts_bundle.go` names it once:

```shell
shadcn-templ bundle --cwd apps/web
```

```shell
Bundle: assets/js/shadcn-templ-1a2b3c4d5e6f7a8b.js
Bundle: apps/admin/assets/js/shadcn-templ-1a2b3c4d5e6f7a8b.js
```

The apps must therefore use the same `scripts.path`; the CLI stops with an error otherwise. Each app serves its own `assets` directory as described in [Serve Assets](/docs/installation#serve-assets) and renders `@components.Scripts()` from `my-app/packages/ui/components` once in its layout.
