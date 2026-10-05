---
title: "Monorepo"
description: "Using shadcn-templ components and CLI in a monorepo."
---

A Go monorepo is one module with several apps: one `go.mod` at the root and one directory per app, for example `apps/web` and `apps/admin` (or `cmd/web` and `cmd/admin`, the CLI does not care where the apps live). Each app has its own assets, its own theme and its own component script bundle, and all of them import the same components.

The CLI understands this layout. It finds `go.mod` by walking up from the app directory, like the `go` command, installs components and utils once at the module root and keeps CSS and scripts per app.

## Getting started

<Steps>

### Create a new monorepo project

To create a new monorepo project, run the `init` command with the `--monorepo` flag.

```shell
shadcn-templ init my-app --monorepo
```

This creates one Go module named `my-app` with the shared `components` and `utils` packages at its root and one app, `apps/web`, set up with its own `components.json`, CSS and script bundle. A root `Taskfile.yml` runs the app: `task dev` for development, `task build` for production, and a `Dockerfile` builds `apps/web`.

```shell
cd my-app
go mod tidy
task dev
```

Everything is set up for you, so you can start adding components to your project.

### Or start from an existing module

Any module works. Run `init` **in the path of each app**, or pass it with `--cwd`.

```shell
cd cmd/web
shadcn-templ init --preset nova
```

```shell
shadcn-templ init --cwd cmd/admin --preset nova --base-color zinc
```

Each app gets its own `components.json`, its own `assets/css/globals.css` with its own theme and colors, and its own `assets/js` for the script bundle. The shared `utils` package is installed once, at `utils/` in the module root. Add the [`@source` line](#requirements) to each app's CSS.

### Add components

Run `add` in the path of your app.

```shell
cd apps/web
shadcn-templ add dialog
```

The CLI installs `dialog` and its dependencies once under `components/` in the module root, rebuilds the script bundle and writes it into the `scripts.dir` of every app that shares these components, so the other apps keep working too. Blocks install the same way, once under `components/blocks/`, and every app can render them.

### Import components

Import components from the module, in any app:

```templ title="apps/web/pages/home.templ"
package pages

import "my-app/components/button"

templ Home() {
	@button.Button() {
		Click me
	}
}
```

### Add another app

Copy `apps/web` to `apps/admin` without its `components.json`, change the import paths from `my-app/apps/web/...` to `my-app/apps/admin/...`, and run `init` for it.

```shell
shadcn-templ init --cwd apps/admin --preset vega
```

Then add it to the root `Taskfile.yml` next to `web`, so `task build` builds it too:

```yaml title="Taskfile.yml"
includes:
  web:
    taskfile: ./apps/web/Taskfile.yml
    dir: ./apps/web
  admin:
    taskfile: ./apps/admin/Taskfile.yml
    dir: ./apps/admin
```

</Steps>

## File Structure

When you create a new monorepo project, the CLI creates the following file structure:

```txt
apps
└── web               # Your app goes here.
    ├── assets
    │   ├── css
    │   │   └── globals.css
    │   ├── js
    │   │   └── shadcn-templ-<hash>.js
    │   └── assets.go
    ├── layouts
    ├── pages
    ├── components.json
    ├── main.go
    └── Taskfile.yml
components            # Installed once, shared by every app.
├── button
├── dialog
├── scripts.templ
└── scripts_bundle.go
utils
└── shadcn-templ.go
Dockerfile
go.mod
Taskfile.yml
```

A second app under `apps/admin` has the same layout as `apps/web`.

## Requirements

1. Every app has a `components.json`. Run the CLI in the app directory or pass it with `--cwd`.

2. The aliases are Go import paths under the module, so they resolve against the `go.mod` directory. File paths in `components.json` (`tailwind.css`, `scripts.dir`) are relative to the directory of that `components.json`.

```json title="apps/web/components.json"
{
  "$schema": "https://shadcn-templ.com/schema/components.json",
  "style": "base-nova",
  "tailwind": {
    "css": "assets/css/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "scripts": {
    "dir": "assets/js",
    "path": "/assets/js"
  },
  "aliases": {
    "components": "my-app/components",
    "utils": "my-app/utils"
  }
}
```

```json title="apps/admin/components.json"
{
  "$schema": "https://shadcn-templ.com/schema/components.json",
  "style": "base-nova",
  "tailwind": {
    "css": "assets/css/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "scripts": {
    "dir": "assets/js",
    "path": "/assets/js"
  },
  "aliases": {
    "components": "my-app/components",
    "utils": "my-app/utils"
  }
}
```

3. Each app's CSS must point Tailwind at the shared components. Tailwind scans the directory it runs in, the app, and the components live at the module root. The scaffold's `apps/web/assets/css/globals.css` carries the line; add it yourself for an app you set up by hand, relative to the CSS file:

```css title="apps/web/assets/css/globals.css"
@import "tailwindcss";
@source "../../../../components";
```

4. Apps that share components share `components/scripts_bundle.go`, which holds one bundle URL. They must use the same `scripts.path`; the CLI stops with an error otherwise. `scripts.dir` can differ per app. Apps that need different URL prefixes point `aliases.components` at different packages.

5. Ensure you have the same `style` and `iconLibrary` in every `components.json` that shares components. Components are compiled for one style: `add` installs them in the `style` of the app you run it in, and the shared files follow whichever app last installed them. Theme, colors and fonts live in each app's CSS and can differ freely, for example with `shadcn-templ apply <preset> --only theme` per app.

## Scripts

`add` and `bundle` write the bundle into every app that shares the components, the same bytes and the same hash for each:

```shell
shadcn-templ bundle --cwd apps/web
```

```shell
Bundle: assets/js/shadcn-templ-1a2b3c4d5e6f7a8b.js
Bundle: apps/admin/assets/js/shadcn-templ-1a2b3c4d5e6f7a8b.js
```

Each app serves its own `assets` directory as described in [Serve Assets](/docs/installation#serve-assets), and renders `@components.Scripts()` once in its layout. For production builds, run `shadcn-templ bundle` once (it covers every app) next to the Tailwind build of each app. In the scaffold, each app's `task build` runs Tailwind, `bundle`, `templ generate` over the whole module and `go build`, and the root `task build` runs them all.
