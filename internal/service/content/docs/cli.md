---
title: "CLI"
description: "Use the shadcn-templ CLI to add components to your project."
order: 7
---

The CLI installs the Go way and updates itself the same way:

```shell
go install github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ@latest
```

## init

Use the `init` command to initialize configuration and dependencies for an existing project.

The `init` command writes `components.json`, adds the shared `utils` package, merges the theme CSS variables into your Tailwind entry file and vendors the shared stylesheets next to it. A `go.mod` is required, in this directory or a parent directory; run `init` in each app of a [monorepo](/docs/monorepo).

```shell
shadcn-templ init
```

Pick a design on [shadcn-templ.com/create](/create) and pass its preset code or URL, or use one of the named presets (`nova`, `vega`, `maia`, `lyra`, `mira`, `luma`, `sera`, `rhea`):

```shell
shadcn-templ init --preset b2D0wqNxT
```

To start a new project instead, pass a template and a project name. `--monorepo` scaffolds a [monorepo](/docs/monorepo): one module with two workspaces, the app in `apps/web` and the components in `packages/ui`.

```shell
shadcn-templ init my-app -t templ
```

```shell
shadcn-templ init my-app --monorepo
```

**Options**

```shell
Usage:
  shadcn-templ init [name] [--template <templ>] [--monorepo] [--preset <code|url|name>] [--base-color <color>] [--css <path>] [--force] [--silent] [--registry <url>]

Arguments:
  name                          the project name for --template and --monorepo (default templ-app, templ-monorepo)

Options:
  -t, --template <templ>        scaffold a new project from a template (templ)
  --monorepo                    scaffold a monorepo project (implies --template templ)
  -p, --preset <code|url|name>  use a preset configuration (code, URL or name)
  --base-color <color>          override the base color
  --css <path>                  path to your Tailwind CSS entry file
  -f, --force                   force overwrite of existing configuration
  -s, --silent                  mute output
  --registry <url>              registry URL (default https://shadcn-templ.com, env SHADCN_TEMPL_REGISTRY)
  -c, --cwd <cwd>               the working directory (default ".")
```

## add

Use the `add` command to add components and dependencies to your project.

```shell
shadcn-templ add [component]
```

The CLI resolves registry dependencies recursively (for example `alert-dialog` pulls in `button` and `dialog`) and rewrites all imports to your module. After adding, run `templ generate` and `go mod tidy` to complete the install.

Blocks install the same way: `shadcn-templ add sidebar-07` writes the block's package with every file and pulls in the components it builds on. Browse them at [/blocks](/blocks).

Existing files are never overwritten silently; re-run with `--overwrite` to update.

**Options**

```shell
Usage:
  shadcn-templ add <components...|url> [--all] [--overwrite] [--path <path>] [--silent] [--registry <url>]

Options:
  -a, --all        add all available components
  -o, --overwrite  overwrite existing files
  -p, --path <path>  the path to add the component to
  -s, --silent     mute output
  --registry <url>  registry URL (default https://shadcn-templ.com, env SHADCN_TEMPL_REGISTRY)
  -c, --cwd <cwd>  the working directory (default ".")
```

## bundle

Use `bundle` to build the component JavaScript asset and its generated Go URL manifest:

```shell
shadcn-templ bundle
```

`add` rebuilds the bundle when it writes component JavaScript. Run `bundle --watch` when editing scripts by hand. The watcher debounces changes by 100ms and writes only changed output. In a [monorepo](/docs/monorepo), `bundle` writes the bundle into every app that shares the ui package.

The output location comes from [scripts](/docs/components-json#scripts) in `components.json`. Old hashed bundles in that directory are removed. Ignore the JS output and commit `components/scripts_bundle.go`. For production builds and Docker images, see [Build and Deploy](/docs/installation#build-and-deploy).

**Options**

```shell
Usage:
  shadcn-templ bundle [--cwd <path>] [--silent] [--watch]

Options:
  --cwd <path>  the working directory (default ".")
  --silent      mute output
  --watch       rebuild when component scripts change
```

## apply

Use the `apply` command to apply a preset to an existing project.

```shell
shadcn-templ apply b2D0wqNxT
```

Without `--only` this rewrites your `components.json`, your CSS variables and re-installs every installed component in the new style. You can apply only the theme or fonts from a preset without reinstalling components:

```shell
shadcn-templ apply b2D0wqNxT --only theme
```

Supported values for `--only` are `theme` and `font`, also combined as `--only theme,font`.

**Options**

```shell
Usage:
  shadcn-templ apply <preset> [--only theme|font] [--yes] [--silent] [--registry <url>]

Options:
  --preset <preset>  preset configuration to apply
  --only <parts>     apply only parts of a preset: theme, font
  -y, --yes          skip confirmation prompt
  -s, --silent       mute output
  --registry <url>   registry URL (default https://shadcn-templ.com, env SHADCN_TEMPL_REGISTRY)
  -c, --cwd <cwd>    the working directory (default ".")
```

## preset

Use the `preset` command to inspect preset codes and resolve the preset for an existing project.

```shell
shadcn-templ preset decode b2D0wqNxT
```

### preset decode

Use `preset decode` to decode a preset code and print the design it encodes.

```shell
shadcn-templ preset decode b2D0wqNxT
```

**Options**

```shell
Usage:
  shadcn-templ preset decode <code>

Options:
  --json  output as JSON
```

### preset resolve

Use `preset resolve` to resolve the preset from the current project, reconstructed from `components.json` and your Tailwind entry file.

```shell
shadcn-templ preset resolve
```

The `preset info` command is an alias for `preset resolve`:

```shell
shadcn-templ preset info
```

**Options**

```shell
Usage:
  shadcn-templ preset resolve [--json]

Options:
  --json           output as JSON
  -c, --cwd <cwd>  the working directory (default ".")
```

### preset url

Use `preset url` to print the create URL for a preset code.

```shell
shadcn-templ preset url b2D0wqNxT
```

```shell
https://shadcn-templ.com/create?preset=b2D0wqNxT
```

## upgrade

The CLI updates itself the Go way:

```shell
go install github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ@latest
```
