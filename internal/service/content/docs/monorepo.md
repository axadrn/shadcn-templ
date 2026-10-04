---
title: "Monorepo"
description: "Using shadcn-templ components and CLI in a monorepo."
---

A Go monorepo is one module with several apps: one `go.mod` at the root and one directory per service, for example `cmd/web` and `cmd/admin`. Each app has its own assets, its own theme and its own component script bundle, and all of them import the same components.

The CLI understands this layout. It finds `go.mod` by walking up from the app directory, like the `go` command, installs components and utils once at the module root and keeps CSS and scripts per app.

## Getting started

<Steps>

### Start from a Go module

Any module works. There is nothing to scaffold for a monorepo: a Go module holds several apps as it is.

```shell
go mod init example.com/platform
mkdir -p cmd/web cmd/admin
```

### Initialize each app

Run `init` **in the path of your app**, or pass it with `--cwd`.

```shell
cd cmd/web
shadcn-templ init --preset nova
```

```shell
shadcn-templ init --cwd cmd/admin --preset nova --base-color zinc
```

Each app gets its own `components.json`, its own `assets/css/globals.css` with its own theme and colors, and its own `assets/js` for the script bundle. The shared `utils` package is installed once, at `utils/` in the module root.

### Add components

Run `add` in the path of your app.

```shell
cd cmd/web
shadcn-templ add dialog
```

The CLI installs `dialog` and its dependencies once under `components/` in the module root, rebuilds the script bundle and writes it into the `scripts.dir` of every app that shares these components, so `cmd/admin` keeps working too. Pages of a block (files with a `target`) are written into the app you run `add` in.

### Import components

Import components from the module, in any app:

```templ title="cmd/web/pages/home.templ"
package pages

import "example.com/platform/components/button"

templ Home() {
	@button.Button() {
		Click me
	}
}
```

</Steps>

## File Structure

```txt
cmd
├── web               # An app.
│   ├── assets
│   │   ├── css
│   │   │   └── globals.css
│   │   └── js
│   │       └── shadcn-templ-<hash>.js
│   ├── pages
│   ├── components.json
│   └── main.go
└── admin             # Another app, same layout.
    ├── assets
    ├── components.json
    └── main.go
components            # Installed once, shared by every app.
├── button
├── dialog
├── scripts.templ
└── scripts_bundle.go
utils
└── shadcn-templ.go
go.mod
```

## Requirements

1. Every app has a `components.json`. Run the CLI in the app directory or pass it with `--cwd`.

2. The aliases are Go import paths under the module, so they resolve against the `go.mod` directory. File paths in `components.json` (`tailwind.css`, `scripts.dir`) are relative to the directory of that `components.json`.

```json title="cmd/web/components.json"
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
    "components": "example.com/platform/components",
    "utils": "example.com/platform/utils"
  }
}
```

```json title="cmd/admin/components.json"
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
    "components": "example.com/platform/components",
    "utils": "example.com/platform/utils"
  }
}
```

3. Apps that share components share `components/scripts_bundle.go`, which holds one bundle URL. They must use the same `scripts.path`; the CLI stops with an error otherwise. `scripts.dir` can differ per app. Apps that need different URL prefixes point `aliases.components` at different packages.

4. Ensure you have the same `style` and `iconLibrary` in every `components.json` that shares components. Components are compiled for one style: `add` installs them in the `style` of the app you run it in, and the shared files follow whichever app last installed them. Theme, colors and fonts live in each app's CSS and can differ freely, for example with `shadcn-templ apply <preset> --only theme` per app.

## Scripts

`add` and `bundle` write the bundle into every app that shares the components, the same bytes and the same hash for each:

```shell
shadcn-templ bundle --cwd cmd/web
```

```shell
Bundle: assets/js/shadcn-templ-1a2b3c4d5e6f7a8b.js
Bundle: cmd/admin/assets/js/shadcn-templ-1a2b3c4d5e6f7a8b.js
```

Each app serves its own `assets` directory as described in [Serve Assets](/docs/installation#serve-assets), and renders `@components.Scripts()` once in its layout. For production builds, run `shadcn-templ bundle` once (it covers every app) next to the Tailwind build of each app.
