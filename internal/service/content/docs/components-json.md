---
title: "components.json"
description: "Configuration for your project."
order: 3
---

The `components.json` file holds configuration for your project.

We use it to understand how your project is set up and how to generate components customized for your project.

<Callout className="mt-6">

**Note: The `components.json` file is optional.** It is **only required if you're using the CLI** to add components to your project. If you're using the [import workflow](/docs/installation), you don't need this file.

</Callout>

You can create a `components.json` file in your project by running the following command:

```shell
shadcn-templ init
```

See the [CLI section](/docs/cli) for more information.

## $schema

The `$schema` identifies the shadcn-templ `components.json` format. `shadcn-templ init` writes it for you.

```json title="components.json"
{
  "$schema": "https://shadcn-templ.com/schema/components.json"
}
```

## style

The style for your components. `init` writes it from your preset (`base-nova`, `base-vega`, ...), and `shadcn-templ add` fetches every component pre-compiled for this style.

```json title="components.json"
{
  "style": "base-nova"
}
```

To change the style of an existing project, apply a new preset with `shadcn-templ apply`.

## tailwind

Configuration to help the CLI understand how Tailwind CSS is set up in your project.

See the [installation section](/docs/installation) for how to set up Tailwind CSS.

### tailwind.css

Path to the CSS file that imports Tailwind CSS into your project, relative to the directory of `components.json`. `init` detects it, or creates `assets/css/globals.css`; override with `--css`.

```json title="components.json"
{
  "tailwind": {
    "css": "assets/css/globals.css"
  }
}
```

### tailwind.baseColor

This is used to generate the default theme tokens for your components.

```json title="components.json"
{
  "tailwind": {
    "baseColor": "neutral" | "stone" | "zinc" | "mauve" | "olive" | "mist" | "taupe"
  }
}
```

### tailwind.cssVariables

We use CSS variables for theming. shadcn-templ components always theme through CSS variables, so `init` writes `true`.

```json title="components.json"
{
  "tailwind": {
    "cssVariables": true
  }
}
```

For more information, see the [theming docs](/docs/theming).

## iconLibrary

The icon library of your preset. shadcn-templ currently ships `lucide`.

```json title="components.json"
{
  "iconLibrary": "lucide"
}
```

## rtl

Whether your components install with RTL (right-to-left) support. Written from your preset; `shadcn-templ apply` requests RTL-compiled components from the registry when it is `true`.

```json title="components.json"
{
  "rtl": false
}
```

## menuColor

The menu appearance of your preset: `default`, `default-translucent`, `inverted` or `inverted-translucent`. Written from your preset and used by `shadcn-templ preset resolve` to reconstruct your preset code.

```json title="components.json"
{
  "menuColor": "default"
}
```

## menuAccent

The menu accent of your preset: `subtle` or `bold`. Written from your preset and used by `shadcn-templ preset resolve` to reconstruct your preset code.

```json title="components.json"
{
  "menuAccent": "subtle"
}
```

## aliases

The CLI uses these values to place generated components in the correct location and rewrite imports.

The aliases are Go import paths. `init` derives them from the `module` path in your `go.mod`, and both must live under that module path. They resolve against the directory of `go.mod`, which can be a parent of `components.json`; several apps of one module share their components that way, see [Monorepo](/docs/monorepo).

### aliases.utils

Import path for the shared `utils` package.

```json title="components.json"
{
  "aliases": {
    "utils": "your-app/utils"
  }
}
```

### aliases.components

Import path for your components.

```json title="components.json"
{
  "aliases": {
    "components": "your-app/components"
  }
}
```

### aliases.ui

Import path for `ui` components.

The CLI will use the `aliases.ui` value to determine where to place your `ui` components, their scripts and `scripts_bundle.go`. Without it, `ui` components live in `aliases.components`. A [monorepo](/docs/monorepo) app points it at its ui package.

```json title="components.json"
{
  "aliases": {
    "ui": "your-app/packages/ui/components"
  }
}
```

## scripts

Configure where the CLI writes the component JavaScript bundle and where your server exposes it:

```json
{
  "scripts": {
    "dir": "assets/js",
    "path": "/assets/js"
  }
}
```

Existing configurations without `scripts` receive these defaults when the CLI builds the bundle.

### scripts.dir

The output directory, relative to the directory of `components.json`. `bundle` writes `shadcn-templ-<hash>.js` here and removes older `shadcn-templ-*.js` files from the same directory. Add this generated filename pattern to `.gitignore` if you change the directory.

### scripts.path

The public URL prefix for the output directory. Use `/assets/js`, an application prefix such as `/my-app/assets/js`, or a CDN URL such as `https://cdn.example.com/js`. The CLI writes the complete URL into `components/scripts_bundle.go`; `@components.Scripts()` renders it. Apps of a [monorepo](/docs/monorepo) that share a ui package share this file, so they must use the same `scripts.path`.

After changing either setting, run `shadcn-templ bundle` and configure your server or upload step to expose `scripts.dir` at `scripts.path`.
