# Parity harness

Checks that shadcn-templ is the 1:1 pendant of shadcn's `bases/base/ui` at the pin in `plans/UPSTREAM.md`. It opens every example on the shadcn reference app and on our preview and compares them in chromium and webkit. The plans in `plans/parity-*.md` say which checks a task runs.

## Setup

**Dependencies.** Once per machine:

    cd parity && npm install && npx playwright install chromium webkit

**The shadcn reference app** on port 3100. `shadcn-ui/ui` at the pinned commit, outside the repository or in the ignored `tmp/`:

    git clone https://github.com/shadcn-ui/ui tmp/parity-runtime/reference
    cd tmp/parity-runtime/reference && git checkout <commit from plans/UPSTREAM.md>
    pnpm install && pnpm --filter=v4 registry:build
    cd apps/v4 && npx next build && npx next start --port 3100

Use the production build: `next dev` grows to tens of GB over a full run. It serves every upstream example alone at `http://localhost:3100/examples/base/<name>`.

**Our app.** `task dev` serves `http://localhost:8090/preview/<name>`. Another port works too, set `TEMPL_URL`:

    PORT=8190 BASE_URL=http://localhost:8190 go tool templ generate --watch --cmd="go run ./cmd/docs/main.go"
    export TEMPL_URL=http://localhost:8190

The Tailwind and script watchers of `task dev` must run as well.

## Checks

| Command | What it checks |
| --- | --- |
| `node compare.mjs <engine> <example...\|all\|family:<prefix>> [--quiet] [--jobs=N]` | Per example and step: the rendered DOM tree, the focused element, the scroll lock, a screenshot pixel diff. Failing screenshots land in `out/<engine>/`. |
| `./all.sh` | `compare.mjs` over every example in `examples.txt`, in chunks. Results in `all-<engine>.log`, `all-<engine>-fails.log`, `all-summary.log` (ends with `done`). `ENGINES=webkit ./all.sh` runs one engine. |
| `node behavior.mjs <engine> [component...]` | Interaction suites on our docs pages. |
| `node a11y.mjs <engine>` | Accessibility checks on our docs pages. |
| `node escape.mjs <engine>` | Escape and focus across nested overlays. |
| `node htmx/htmx.mjs <engine>` | Overlays inside htmx swaps, against the fixture: `go run ./parity/htmx/server` from the repository root (port 8099, `HTMX_URL` to change). |

Run one compare at a time: two in parallel make the reference app and the pixel checks flaky.

## Files

- `examples.txt`: the examples both sides have, the list `compare.mjs all` and `all.sh` run. A new example goes in here once ours exists.
- `shadcn-examples.txt`: every upstream example at the pin.
- `scenarios.json`: the steps after the initial render, per example (`"button-demo"`) or per family (`"family:button"`, every example starting with `button-`). A step is `{"click": selector}`, `{"hover": selector}`, `{"key": "Escape"}`, `{"wheel": [dx, dy]}`.
- `htmx/`: the htmx 4 build and the Go fixture `htmx.mjs` drives.

| Variable | Default |
| --- | --- |
| `SHADCN_URL` | `http://localhost:3100` |
| `TEMPL_URL` | `http://localhost:8090` |
| `HTMX_URL` | `http://localhost:8099` |
