# Contributing

Thanks for your interest in contributing to shadcn-templ.com. We're happy to have you here.

Please take a moment to review this document before submitting your first pull request. We also strongly recommend that you check for open issues and pull requests to see if someone else is working on something similar.

## Issue first

Open an issue before you write code. We agree there on what to build and how. Pull requests without an agreed issue get closed. Small fixes, like a typo or a broken link, are welcome anytime.

If you need any help, feel free to reach out to [@axadrn](https://x.com/axadrn).

## About this repository

This repository is a single Go module.

- We use [Go](https://go.dev) and [templ](https://templ.guide) for development.
- We use [Task](https://taskfile.dev) as our task runner.
- We use [Tailwind CSS](https://tailwindcss.com) for styling.

## Structure

This repository is structured as follows:

```
cmd
├── docs
└── shadcn-templ
components
internal
├── service
│   └── content
│       └── docs
└── ui
registry.json
```

| Path                            | Description                              |
| ------------------------------- | ---------------------------------------- |
| `cmd/docs`                      | The server for the docs website.         |
| `components`                    | The components and their JavaScript.     |
| `internal/ui`                   | The pages and modules for the website.   |
| `internal/service/content/docs` | The markdown content for the docs.       |
| `cmd/shadcn-templ`                   | The `shadcn-templ` CLI.                       |
| `registry.json`                 | The registry for the components.         |

## Development

### Fork this repo

You can fork this repo by clicking the fork button in the top right corner of this page.

### Clone on your local machine

```bash
git clone https://github.com/your-username/shadcn-templ.git
```

### Navigate to project directory

```bash
cd shadcn-templ
```

### Create a new Branch

```bash
git checkout -b my-new-branch
```

### Install dependencies

```bash
go mod download
```

### Run the website

You can use the `task dev` command to start the development process.

```bash
task dev
```

This runs the `templ` watcher and the Tailwind CSS watcher in parallel and serves the website at `http://localhost:8090`.

## Running the CLI Locally

To run the CLI locally, you can follow the workflow:

1. Start by running the dev server:

   ```bash
   task dev
   ```

2. In another terminal tab, install the CLI from your working tree:

   ```bash
   go install ./cmd/shadcn-templ
   ```

   To test the CLI against your local registry, use a command like:

   ```bash
   shadcn-templ <init | add | ...> --registry http://localhost:8090
   ```

   You can also set the registry via the `SHADCN_TEMPL_REGISTRY` environment variable.

This workflow ensures that you are running the most recent version of the registry and testing the CLI properly in your local environment.

## Documentation

The documentation for this project lives on the website. You can run the documentation locally by running the following command:

```bash
task dev
```

Documentation is written using Markdown. You can find the documentation files in the `internal/service/content/docs` directory.

## Components

We use a registry system for developing components. You can find the source code for the components under `components`. Each component lives in its own directory with a `.templ` file and an optional `.js` file.

```bash
components
├── button
│   └── button.templ
└── dialog
    ├── dialog.js
    └── dialog.templ
```

When adding or modifying components, please ensure that:

1. You make the changes for every style (`assets/css/styles/style-*.css`).
2. You update the documentation.
3. You run `task dev`. The dev server regenerates the registry, so there is no separate build step.

## Commit Convention

Before you create a Pull Request, please check whether your commits comply with
the commit conventions used in this repository.

When you create a commit we kindly ask you to follow the convention
`category(scope or module): message` in your commit message while using one of
the following categories:

- `feat / feature`: all changes that introduce completely new code or new
  features
- `fix`: changes that fix a bug (ideally you will additionally reference an
  issue if present)
- `refactor`: any code related change that is not a fix nor a feature
- `docs`: changing existing or creating new documentation (i.e. README, docs for
  usage of a lib or cli usage)
- `build`: all changes regarding the build of the software, changes to
  dependencies or the addition of new dependencies
- `test`: all changes regarding tests (adding new tests or changing existing
  ones)
- `ci`: all changes regarding the configuration of continuous integration (i.e.
  github actions, ci system)
- `chore`: all changes to the repository that do not fit into any of the above
  categories

  e.g. `feat(components): add new prop to the avatar component`

If you are interested in the detailed specification you can visit
https://www.conventionalcommits.org/ or check out the
[Angular Commit Message Guidelines](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#-commit-message-guidelines).

## Requests for new components

If you have a request for a new component, open an issue on GitHub. We'll be happy to help you out.

## CLI

The `shadcn-templ` package is a CLI for adding components to your project. You can find the documentation for the CLI [here](https://shadcn-templ.com/docs/cli).

Any changes to the CLI should be made in the `cmd/shadcn-templ` directory. If you can, it would be great if you could add tests for your changes.

## Testing

Tests are written using [Go's testing package](https://pkg.go.dev/testing). You can run all the tests from the root of the repository.

```bash
go test ./...
```

Please ensure that the tests are passing when submitting a pull request. If you're adding new features, please include tests.
