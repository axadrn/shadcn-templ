---
title: "Installation"
description: "How to install dependencies and structure your app."
order: 2
---

<Callout className="mb-6 border-emerald-600 bg-emerald-100 dark:border-emerald-400 dark:bg-emerald-900">

**Recommended for new projects:** Use [shadcn-templ/create](/create) to build your preset visually and generate the right setup command.

</Callout>

Choose the setup that matches your starting point.

<div class="mt-6 grid gap-4 sm:grid-cols-3 sm:gap-6" data-not-typeset>
  <a href="#scaffold-with-create" class="flex w-full flex-col items-start gap-1 rounded-2xl bg-surface p-6 text-sm text-surface-foreground transition-colors hover:bg-surface/80 sm:p-10 md:p-6">
    <div class="font-medium">Use shadcn-templ/create</div>
    <div class="leading-relaxed text-muted-foreground">Build your preset and generate a templ project command.</div>
  </a>
  <a href="#scaffold-with-cli" class="flex w-full flex-col items-start gap-1 rounded-2xl bg-surface p-6 text-sm text-surface-foreground transition-colors hover:bg-surface/80 sm:p-10 md:p-6">
    <div class="font-medium">Use the CLI</div>
    <div class="leading-relaxed text-muted-foreground">Scaffold a new templ project directly from the terminal.</div>
  </a>
  <a href="#existing-project" class="flex w-full flex-col items-start gap-1 rounded-2xl bg-surface p-6 text-sm text-surface-foreground transition-colors hover:bg-surface/80 sm:p-10 md:p-6">
    <div class="font-medium">Existing Project</div>
    <div class="leading-relaxed text-muted-foreground">Configure shadcn-templ manually in an existing templ project.</div>
  </a>
</div>

<div id="scaffold-with-create" class="scroll-mt-24"></div>

## Use shadcn-templ/create

<Steps>

### Build Your Preset

Open [shadcn-templ/create](/create) and build your preset visually. Choose your style, colors, fonts, icons, and more.

<a href="/create" target="_blank" rel="noopener noreferrer" data-not-typeset class="cn-button group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none cn-button-variant-default cn-button-size-sm mt-6 no-underline!">Open shadcn-templ/create</a>

### Create Project

Click `Get Code`, choose your project tab, and copy the generated command. Install the CLI first if you do not have it yet:

```shell
go install github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ@latest
```

The generated command will look similar to this:

```shell
shadcn-templ init -t templ --preset [CODE]
```

The exact command will include the preset code that encodes your selected options such as your style, base color and fonts.

### Run the App

The scaffolded project ships the `Taskfile.yml` dev setup. Run everything with:

```shell
cd templ-app
go mod tidy
task dev
```

### Add Components

Add the `Card` component to your project:

```shell
shadcn-templ add card
```

The command above will add the `Card` component to your project. You can then import it like this:

```templ title="pages/home.templ" showLineNumbers
package pages

import "templ-app/components/card"

templ Home() {
	@card.Card(card.Props{Class: "max-w-sm"}) {
		@card.Header() {
			@card.Title() {
				Project Overview
			}
			@card.Description() {
				Track progress and recent activity for your app.
			}
		}
		@card.Content() {
			Your design system is ready. Start building your next component.
		}
	}
}
```

After adding components, run `templ generate` and `go mod tidy`.

</Steps>

<div id="scaffold-with-cli" class="scroll-mt-24"></div>

## Use the CLI

<Steps>

### Create Project

Run the `init` command to scaffold a new templ project. Configure your project with flags: preset, base color, and more:

```shell
go install github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ@latest
shadcn-templ init -t templ
```

Pick a design on [shadcn-templ/create](/create) and pass its preset code, or use one of the named presets (`nova`, `vega`, `maia`, `lyra`, `mira`, `luma`, `sera`, `rhea`):

```shell
shadcn-templ init -t templ --preset b2D0wqNxT
shadcn-templ init -t templ --preset vega
```

### Run the App

The scaffolded project ships the `Taskfile.yml` dev setup. Run everything with:

```shell
cd templ-app
go mod tidy
task dev
```

### Add Components

Add the `Card` component to your project:

```shell
shadcn-templ add card
```

The command above will add the `Card` component to your project. You can then import it like this:

```templ title="pages/home.templ" showLineNumbers
package pages

import "templ-app/components/card"

templ Home() {
	@card.Card(card.Props{Class: "max-w-sm"}) {
		@card.Header() {
			@card.Title() {
				Project Overview
			}
			@card.Description() {
				Track progress and recent activity for your app.
			}
		}
		@card.Content() {
			Your design system is ready. Start building your next component.
		}
	}
}
```

After adding components, run `templ generate` and `go mod tidy`.

</Steps>

<div id="existing-project" class="scroll-mt-24"></div>

## Existing Project

<Steps>

### Create Project

If you need a new Go module, create one with `go mod init`. Otherwise, skip this step.

```shell
mkdir myapp && cd myapp
go mod init myapp
```

### Configure templ, Tailwind CSS and Task

If you're adding shadcn-templ to an existing templ app, make sure templ, Tailwind CSS and Task are installed first:

```shell
go install github.com/a-h/templ/cmd/templ@latest
go install github.com/go-task/task/v3/cmd/task@latest
```

The Tailwind CSS v4.1+ standalone CLI is required: download it from the [GitHub Releases](https://github.com/tailwindlabs/tailwindcss/releases/latest) or use your package manager.

Import aliases need no configuration: Go resolves imports through the `module` path in your `go.mod`. See [Package Imports](/docs/package-imports).

### Run the CLI

Run the `shadcn-templ` init command to set up shadcn-templ in your project:

```shell
go install github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ@latest
shadcn-templ init
```

Init writes `components.json`, merges your theme CSS variables and base layer into your Tailwind entry file (detected, or created at `assets/css/globals.css`), vendors `tw-animate.css` and `shadcn-tailwind.css` next to it, and installs the shared `utils` package. See the [CLI docs](/docs/cli) for all flags, updating with `--overwrite` and applying presets.

### Create Taskfile

Pin templ and the CLI as Go tools, as the scaffold does, and commit the resulting `go.mod` and `go.sum`:

```shell
go get -tool github.com/a-h/templ/cmd/templ
go get -tool github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ
```

`go tool` uses the versions recorded in your module. A `Taskfile.yml` in your project root runs templ, Tailwind and the script bundle as watchers, and defines the production build:

```yaml
version: "3"

vars:
  # The app port: an explicit 'task dev PORT=8091' wins, otherwise the next
  # free port from 8090 up. The templ proxy and the app share the result,
  # so hot reload never points at a foreign app.
  FREE_PORT:
    sh: port=8090; while nc -z localhost $port >/dev/null 2>&1; do port=$((port+1)); done; echo $port
  PORT: '{{.PORT | default .FREE_PORT}}'

tasks:
  templ:
    desc: Run templ with integrated server and hot reload
    cmds:
      - go tool templ generate --watch --proxy="http://localhost:{{.PORT}}" --cmd="go run ./main.go" --open-browser=false
    env:
      PORT: "{{.PORT}}"

  tailwind:
    desc: Watch Tailwind CSS changes
    cmds:
      - "tailwindcss -i ./assets/css/globals.css -o ./assets/css/output.css --watch"

  scripts-watch:
    desc: Watch component scripts
    cmds:
      - go tool shadcn-templ bundle --watch

  build:
    desc: Build the application with production assets
    cmds:
      - tailwindcss -i ./assets/css/globals.css -o ./assets/css/output.css --minify
      - go tool shadcn-templ bundle
      - go tool templ generate
      - go build -o bin/app .

  dev:
    env:
      SHADCN_TEMPL_DEV: "true"
    desc: Start development server with hot reload
    cmds:
      - task --parallel tailwind scripts-watch templ
```

Run everything with:

```shell
task dev
```

The scaffold server honors `PORT`; adapt the `templ` task to your existing server's port configuration. templ's dev proxy runs at http://localhost:7331. For production, see [Build and Deploy](#build-and-deploy).

### Add Components

You can now start adding components to your project.

```shell
shadcn-templ add button
```

The command above will add the `Button` component to your project. You can then import it like this:

```templ title="pages/home.templ" showLineNumbers
package pages

import "myapp/components/button"

templ Home() {
	<div class="flex min-h-svh items-center justify-center">
		@button.Button() {
			Click me
		}
	</div>
}
```

After adding components, run `templ generate` and `go mod tidy`.

</Steps>

## JavaScript

shadcn-templ ships all component behavior as one script bundle. The setup is a one-time step in your app, no per-component script tags.

Render the script tag once in your layout `<head>`:

```go
import "your-app/components"
```

```templ
<head>
  @components.Scripts()
</head>
```

When you add a component with JavaScript, the CLI builds `assets/js/shadcn-templ-<hash>.js` and writes its URL to `components/scripts_bundle.go`. Serve the JS file with your other assets. There is no component-specific HTTP handler or runtime bundling.

The bundle contains `*/*.js` from your configured components directory in lexical order (excluding `.min.js` files). Root-level scripts are not included. Change its output directory and public URL with [scripts.dir and scripts.path](/docs/components-json#scripts).

While editing component scripts, run:

```shell
shadcn-templ bundle --watch
```

The scaffold's `task dev` runs this watcher for you. For a one-off rebuild, run `shadcn-templ bundle`.

The scripts watch the DOM, so components arriving through htmx, Datastar or Alpine swaps work without framework specific wiring. Overlays such as menus, popovers and dialogs stay where they were rendered and move to `<body>` when they open. One htmx edge: an overlay rendered already open inside a swapped fragment whose ids already exist in the target moves during htmx's settle delay and misses its `hx-*` attributes. Swap such fragments into a dedicated target.

Commit `components/scripts_bundle.go` together with the component sources. Ignore `assets/js/shadcn-templ-*.js`, just like `assets/css/output.css`; both are build artifacts. **For production builds from a clean checkout, use [Build and Deploy](#build-and-deploy).** The same source files produce the same hash. After merging component changes, rerun `bundle` to update the manifest.

Upgrading from runtime bundling: remove the old `components/scripts.go`, `components/embed.go` and `/components/{bundle}` route, update `scripts.templ` with `shadcn-templ add scripts --overwrite`, and run `shadcn-templ bundle`.

## Serve Assets

Serve `/assets/` from your asset directory or CDN. The content hash in the bundle filename makes `Cache-Control: public, max-age=31536000, immutable` safe. Compression belongs to your asset server or proxy.

For a Go app that embeds production assets, add:

```go title="assets/assets.go"
package assets

import "embed"

//go:embed all:*
var Assets embed.FS
```

Mount your asset handler (import `your-app/assets`, `net/http`, `os`, and `strings`):

```go
func setupAssetsRoutes(mux *http.ServeMux) {
  development := os.Getenv("SHADCN_TEMPL_DEV") == "true" || os.Getenv("TEMPL_DEV_MODE") == "true"
  files := http.FileServer(http.FS(assets.Assets))
  if development {
    files = http.FileServer(http.Dir("./assets"))
  }
  handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if development {
      w.Header().Set("Cache-Control", "no-store")
    } else if strings.HasPrefix(strings.TrimPrefix(r.URL.Path, "/"), "js/shadcn-templ-") {
      w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
    } else {
      w.Header().Set("Cache-Control", "no-cache")
    }
    files.ServeHTTP(w, r)
  })
  mux.Handle("GET /assets/", http.StripPrefix("/assets/", handler))
}
```

The scaffold uses production assets when no development flag is set. `task dev` sets `SHADCN_TEMPL_DEV=true`; templ's watcher sets `TEMPL_DEV_MODE=true`. The scaffold temporarily also accepts `GO_ENV=development` as a deprecated alias, to be removed after this minor version. Unhashed assets such as `output.css` revalidate; only the hashed bundle is cached immutable.

> **📝 Note:** shadcn-templ also works as a plain Go module dependency without copying any source. That is a shadcn-templ extra outside this page, see [Import Workflow](/docs/import-workflow).

## Build and Deploy

For a scaffold project, install Go, [Task](https://taskfile.dev/installation/) and the [Tailwind CSS standalone CLI](https://github.com/tailwindlabs/tailwindcss/releases/latest). After cloning, run `go mod download` to fetch the versions committed in `go.mod` and `go.sum`. templ and the bundling CLI are pinned Go tools; they need no separate installation.

Build the application:

```shell
task build
```

This runs Tailwind with minification, bundles component JavaScript, generates production templ code, then writes `bin/app`. The binary embeds its CSS and JavaScript and can run outside the source directory:

```shell
PORT=8090 ./bin/app
```

Keep `bin/`, `assets/css/output.css` and `assets/js/shadcn-templ-*.js` out of git. Commit the component sources, `components/scripts_bundle.go`, `go.mod` and `go.sum`. Always use `task build` for deployment so generated assets and production templates are ready before Go embeds them.

The scaffold also includes a Dockerfile that installs the build tools and runs the same task. Only Docker is required on the host:

```shell
docker build -t myapp .
docker run --rm -p 8090:8090 myapp
```

The final image contains the application binary with embedded assets and listens on port 8090. Development flags must remain unset for production asset serving.

For an existing project, add the `build` task from [Create Taskfile](#create-taskfile), pin both Go tools as shown there, and adapt the Go build target and asset paths to your app. Copy the scaffold's [Dockerfile](https://github.com/axadrn/shadcn-templ/blob/main/cmd/shadcn-templ/templates/templ-app/Dockerfile) and [.dockerignore](https://github.com/axadrn/shadcn-templ/blob/main/cmd/shadcn-templ/templates/templ-app/.dockerignore) for container builds, keeping their `bin/app` output path aligned with your task.

## Component Props

Every component accepts three universal props that are left out of the per-component API tables:

| Prop         | Type               | Description                                          |
| ------------ | ------------------ | ---------------------------------------------------- |
| `ID`         | `string`           | HTML id for the rendered element.                    |
| `Class`      | `string`           | Additional CSS classes, merged with the defaults.    |
| `Attributes` | `templ.Attributes` | Additional HTML attributes spread onto the element.  |

Standard HTML behavior (`Disabled`, `Type`, `Href`, ...) works the way the platform defines it; the API tables only document what a component adds on top.
