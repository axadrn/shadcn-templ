# Issue #616: portaled content is invisible to htmx

- **Planner**: Claude
- **Executor**: Codex
- **Status**: done
- **Owner rule for this plan**: no commits. Everything stays in the working tree of `fix/616-htmx-portal`, Axel reviews the diff by hand. This overrides the one-commit-per-task rule in `plans/README.md`.

## Context

Issue #616: an `hx-post` on a `dropdownmenu.Item` never fires. The reporter fixed it locally by calling `htmx.process()` inside `liftTemplates()`.

**Cause, verified against htmx 4.0.0-beta6 source and in the browser.** Every portaled component renders its content inside a `<template>` and the script lifts it to `<body>` at init. A `<template>` holds a DocumentFragment that `querySelectorAll` never descends into, so htmx never sees the content. htmx has no MutationObserver and no event delegation: `htmx.process()` binds listeners per element, once at load and once on content htmx swaps in itself.

**Round 1 finding (Executor, confirmed by the Planner).** Replacing `<template>` with a hidden node is not enough. When a swapped fragment contains ids that already exist in the target, htmx 4 defers `process()` on the inserted roots by the settle delay (`#insertContent`, `defaultSettleDelay: 1`, `#startCSSTransitions`). Our MutationObserver fires in that gap and lifts the content out of the roots, so the deferred `process()` finds nothing. That is the normal case, a component re-rendered with a stable id. Codex's probe: 28 failures per engine with the hidden node alone, 0 with the reporter's one-liner. The Planner's round 1 re-swap check was wrong, it counted the POST of the previous round.

**Why not the one-liner.** `window.htmx?.process(content)` is htmx code in framework agnostic components, and it does nothing when htmx is imported as a module without a global. Axel's rule: the components stay framework agnostic.

**What Basecoat does.** Nothing is ever moved: popovers, menus and selects stay in place with `position: absolute` and CSS `anchor-size`, dialogs are native `<dialog>`. Agnostic by construction, but it is the in-place model this project left on 2026-08-12 for shadcn's body portal with z-index (clipping in overflow containers, no flip or shift). Not copied.

**What Base UI does.** The Portal mounts when the popup opens (`keepMounted` is false by default). Nothing lives in `<body>` before the first open. Our lift at init was never 1:1.

**The fix: portal on open.** The hidden portal node from round 1 stays. The lift at init goes away. Content stays hidden where it was rendered until it first opens; the open paths already call `portal(content)`, which appends to `<body>` and records the owner. By the time a user opens anything, htmx has long processed the content, and listeners bound to an element survive `appendChild`. The Planner proved it on the dropdown menu in Codex's working tree by dropping `liftTemplates()` and the up-front `portal(content)` from `init()`: Codex's probe passes all dropdown checks in all three rounds, including two same-id swaps and the POST after open. The only failing line was "zero portals", which the probe must redefine (the wrapper stays, see Decisions).

**Inventory.** Portal templ sites (already hidden nodes in the working tree): `components/{drawer,tooltip,dialog,combobox,contextmenu,select,sheet,popover,hovercard,alertdialog,dropdownmenu}/*.templ`. Lift functions to remove: `liftTemplates` in `drawer.js`, `contextmenu.js`, `popover.js`, `combobox.js`, `dialog.js`, `hovercard.js`, `select.js`, `dropdownmenu.js`, and the inline lift at the top of `init` in `tooltip.js`. Open paths that already portal: tooltip `open` (portal at line 150), popover `open` (226), hovercard `open` (140), contextmenu `openAt` (225), select `open` (550), combobox `open` (311), dropdownmenu `open` (271). Dialog `openDialog` and drawer `openDrawer` do not portal yet. Drawer nesting is `data-tui-drawer-parent`, rendered by templ, nothing to record. Dialog nesting is `data-tui-dialog-parent`, recorded by `liftTemplates`, so it moves to `ensureDialog`. Docs example scripts (`internal/ui/examples/drawer_demo.templ`, `drawer_nested.templ`) already use `getElementById` after round 1 and stay.

**Lookups already favour the in-place node.** `contentFor`, `dialogFor`, `getDrawer` resolve by id. A fresh in-place node precedes a stale `<body>` copy in document order, so `getElementById` returns the fresh one. The stale copy is retired by the owner sweep: its owner is the old, disconnected wrapper.

**Known edge, accepted.** An initially open popup (`Open: true`, `DefaultOpen`) still portals at init. On page load that is before htmx processes the body (deferred bundle). Inside a swapped fragment with matching ids it hits the settle gap. Rare, documented here, not solved.

**Repo facts.** The working tree holds Codex's round 1 changes (hidden nodes in all templ files, three-line lift edits, docs example lookups, regenerated files). Round 2 builds on it. Codex's servers from round 1 may still listen on 8096, 8097, 8098, 8099; the Planner's on 8094 and 8095 are stopped. Test harness in gitignored `tmp/htmx-616/` (`server/`, `htmx.mjs`, `docs.mjs`, `timing.mjs`, scroll-lock copies, baseline logs).

## Decisions

- **Portal on open, in every portaled component.** Content stays inside its hidden portal node until it first opens. The open path moves it to `<body>` through the existing `portal()` (anchored popups) or a new append in `openDialog` and `openDrawer`. Once portaled, it stays in `<body>` until its owner leaves the document, as today.
- **The hidden portal node stays in the document, empty after the move.** It is the owner (`_tuiPortalOwner`) of the portaled content, the pendant of the declaration site. It is never removed by the script. `tpl.remove()` goes away with `liftTemplates`.
- **`liftTemplates` is deleted, not adapted.** No init-time move, no stale lookup at init. Stale copies are retired by the owner sweep alone: a `<body>` content whose owner is disconnected is destroyed. Every component runs that sweep once per `init`, not only inside `portal()`.
- **Dialog records nesting in `ensureDialog`.** `root.parentElement.closest("[data-tui-dialog-content]")` at registration time; the wrapper sits inside the parent popup whether the parent is still in place or already portaled. `openDialog` appends the root to `<body>` before `state.root.hidden = false`, replacing the current "re-append if not last" block with one append (FloatingPortal appends at open time). `init` registers every root in the document, not only `body > [data-tui-dialog-root]`, and destroys a state whose root or owner is disconnected.
- **Drawer portals in `openDrawer`**, before `dialog.show()`. `init` no longer calls `portal(dialog)`; `ensureDrawer` still runs for every drawer in the document. The owner sweep stays.
- **Initially open content portals at init** by going through the open path, as today. The settle edge is accepted (see Context).
- **Nothing else changes.** No templ changes beyond round 1, no class strings, no docs page, no changelog, no htmx code, no tests in the repo. Comments that describe the init-time lift are rewritten to say portal on open, and the `_tuiPortalOwner` comments stay true as they are.

## Tasks

### 1. Probe for portal on open

- [x] Done

Update `tmp/htmx-616/htmx.mjs`: replace "zero portals" with two checks per round: no `template[data-tui-*-portal]` anywhere, and before any open every content sits inside its portal wrapper (not under `<body>`), after the dropdown and dialog opens those two contents sit under `<body>` and their wrappers are empty. Keep the powered checks for all 12 `[hx-post]` elements, the unique id check, the POST-exactly-once checks in all three rounds, the page error check. Add one round that opens the nested dialog through its parent and clicks its `hx-post` element. Add a check that after round 2 no stale content remains: `body > [data-tui-*-content]` count equals the number of contents opened so far, never more.

Done when: the probe runs against the current working tree and fails only the powered and POST checks after swaps (the round 1 state), same as `tmp/htmx-616/fixed-chromium.log` modulo the new checks.

Checks: `node tmp/htmx-616/htmx.mjs http://localhost:<port> chromium` against a server built from the working tree.

### 2. Anchored popups portal on open

- [x] Done

tooltip, popover, hovercard, contextmenu, select, combobox, dropdownmenu, per Decisions: delete `liftTemplates` (tooltip: the inline lift loop at the top of `init`), delete the up-front `portal(content)` in `init` (keep `listenForEscape`, the initial-open branch, select's checked label sync, combobox's value display sync), make `init` run the owner sweep once (dropdownmenu, contextmenu, select already do; tooltip, popover, hovercard, combobox extract the sweep inside `portal()` into `removeOrphanedContents(content)` and call it from `init` and `portal`). Rewrite the comments above the deleted functions and the "portal up front, like React on mount" remarks. Let the watcher rebundle.

Done when: the probe passes every check for these seven components in all rounds, and `grep -n "liftTemplates" components` prints only dialog and drawer.

Checks: the probe, `go build ./...`, `go vet ./components/...`, `git diff --check`.

### 3. Dialog portals on open

- [x] Done

`components/dialog/dialog.js` per Decisions: delete `liftTemplates`; `ensureDialog` records `data-tui-dialog-parent` from `root.parentElement.closest("[data-tui-dialog-content]")` and sets `root._tuiPortalOwner = root.parentElement` when unset; `init` iterates `[data-tui-dialog-root]` in the whole document, destroys states whose `root` or `_tuiPortalOwner` is disconnected, registers fresh roots and runs the initial-open branch; `openDialog` appends `state.root` to `<body>` right before `state.root.hidden = false`. Sheet and alertdialog need no script change. Comments follow.

Done when: the probe passes dialog, alertdialog, sheet and nested checks in all rounds, a nested dialog opened after its parent has no backdrop and closes on Escape before the parent, and the sidebar mobile sheet on `/preview/sidebar-demo` opens and closes at 750px (`tmp/sidebar-613/probe.mjs` scenario A if present, otherwise a manual Playwright check).

Checks: the probe, the sidebar check, `go build ./...`, `go vet ./components/...`.

### 4. Drawer portals on open

- [x] Done

`components/drawer/drawer.js` per Decisions: delete `liftTemplates`, remove `portal(dialog)` from `init`, call `portal(dialog)` in `openDrawer` before `dialog.show()`. Comments follow.

Done when: the probe passes the drawer checks in all rounds, and `/docs/components/drawer` nested and demo examples behave as in `tmp/htmx-616/docs-chromium.log` (direction attributes at 767, 768, 1280; nested drawers stack and close in order).

Checks: the probe, `node tmp/htmx-616/docs.mjs chromium` and webkit for the drawer page.

### 5. Regression on the docs site

- [x] Done

Rerun `tmp/htmx-616/docs.mjs` for all eleven pages in Chromium and WebKit and all seven scroll-lock scripts through `tmp/htmx-616/run-probes.py fixed`. Update `docs.mjs` where it asserted "contents in body equals triggers" at load: before any open the contents sit inside their wrappers, after opening the first example that one content sits under `<body>`.

Done when: every sweep passes in both engines with no page error, and the scroll-lock outputs match their baseline logs byte for byte (including the known Chromium `INSET FAIL` diagnostic).

Checks: `node tmp/htmx-616/docs.mjs chromium`, same for webkit, `python3 tmp/htmx-616/run-probes.py fixed`.

## Executor log

### Task 1

- Expanded the gitignored probe to all eleven components plus a nested dialog, with initial load, two same-ID swaps, powered markers, unique IDs, empty portal wrappers, and exactly one real POST per dropdown/dialog click.
- Baseline is an isolated `git archive main` copy at `/private/tmp/htmx-616-baseline` (main `da86e0c7`); the prototype stayed untouched in this checkout. Existing unchanged internal generated files and CSS were copied into the archive. The normal scripts watcher supplied baseline assets; this Executor did not invoke generation or minification manually.
- `tmp/htmx-616/baseline-chromium.log`: expected exit 1. All 12 initial elements powered; all 12 unpowered on each swap. Only swapped powered/POST checks failed; no page errors, leftover portals, or duplicate IDs.
- Ran all seven existing scroll-lock scripts in both engines, with baseline-only copies changing port 8090 to 8096. Logs: `tmp/htmx-616/baseline-{probe,shared,lifecycle,escape,inset,inset2,inspect}-{chromium,webkit}.log`. Main probe: zero failed expectations in both engines; shared/lifecycle passed. `inset.mjs` already prints `INSET FAIL` in Chromium (inset=0 and Playwright click scrolls to top); compare this diagnostic unchanged in Task 3. `inset2.mjs` passes both.
- Inventory correction: `tmp/a11y-600/dom.mjs` has only accordion/tabs/toggle tasks, no dialog/drawer/menu task. It was not run with nonexistent task numbers that would silently report PASS.

### Task 2 investigation (not complete)

- Implemented the specified hidden nodes, stale-copy exclusion, and docs example lookups; watchers regenerated assets. Build, component vet and component tests pass.
- **Decision reopened by evidence:** hidden DOM alone does not reliably fix htmx 4.0.0-beta6 swaps. With same IDs, htmx schedules settle tasks and awaits the delay before `process(newContent)`. Our observers lift descendants first, leaving htmx's remembered fragment roots empty. The expanded probe fails all 12 powered checks after either swap, although initial load and structural checks pass.
- `tmp/htmx-616/timing.log`: before:settle has 12 post elements and 3 settle tasks; after:settle has 0; powered count is 0. Setting `hx-swap="innerHTML settle:0"` as a diagnostic yields 12 powered elements. This is not used to weaken the acceptance probe.
- Asked the owner whether to authorize a robust solution beyond the fixed Decisions or return to the Planner. Continuing independent docs regressions meanwhile. Task 2 is not marked done or committed as a successful fix.

### Task 3

- The hidden-node implementation passes the eleven-page docs sweep in Chromium and WebKit. All portal wrappers disappear; contents are attached to body (dialog through its root); unique target counts match; the first example opens and closes on Escape. Drawer demo and all four nested drawers set the expected direction/axis at widths 767, 768 and 1280. No page errors. Logs: `tmp/htmx-616/docs-{chromium,webkit}.log`.
- Probe details: contextmenu uses `data-tui-contextmenu-for`; combobox counts unique anchors because one example has no separate trigger and another has multiple references. The navbar's pre-existing dangling `create-code-dialog` trigger is excluded from counts on non-create pages. Focus-return assertions cover focusable menu/popover/select/dialog/drawer triggers.
- All seven scroll-lock scripts ran in both engines. `probe`, `shared`, `lifecycle`, `escape`, `inset`, and `inset2` output matches baseline byte-for-byte in each engine (including the known Chromium `INSET FAIL` diagnostic). Main probes have zero failed expectations; `inspect` completed and retains its diagnostic HTML output. Logs: `tmp/htmx-616/fixed-*-{chromium,webkit}.log`.
- Environment deviation: `task dev` supplied regenerated files through its watchers. Its child docs server returned 404 during testing, so the final sweeps use a fresh `go run ./cmd/docs/main.go` from this branch on port 8098, with generated assets consistent with that process. Baseline uses port 8096. Early infrastructure-failure runs were replaced by the final logs.
- Task 3 verifies the currently proposed implementation only. Any revised fix for Task 2 needs these checks again.
- Task 2 remains open: the same-ID htmx probe also fails in WebKit (`tmp/htmx-616/fixed-webkit.log`), matching Chromium. No change to htmx defaults was shipped; no repository tests were changed. The implementation remains uncommitted for Planner review, and no PR was opened because Issue #616 is not fixed reliably.

- Owner correction: do not commit; all changes are for manual review. The two Executor-created local commits were removed with a mixed reset to `da86e0c7`; all implementation, plan and probe files remain intact and unstaged. This overrides the commit convention for this task.

### Round 2, Task 1

- Updated the gitignored htmx probe for in-place hidden content before open, retained empty owner wrappers after open, exact body-content counts, nested dialog POST/backdrop/Escape behavior, and all original marker/ID/POST checks over three rounds.
- `tmp/htmx-616/round2-before.log`: the unchanged round-1 runtime fails powered/POST checks after swaps and the newly introduced location/owner checks (81 failures total). The Task 1 done-when wording says "only powered and POST"; that conflicts with asserting lazy portals against the eager-portal baseline. The additional location failures are expected and are retained, not suppressed.
- Stage probes may set `CURRENT_BUNDLE=1` to serve the normal watcher's current bundle through Playwright routing while retaining the unchanged rendered Go fixture. Final verification will use freshly compiled servers without this override. No commits.

### Round 2, Task 2

- Removed init-time lifting/portaling from all seven anchored popups. Extracted the owner sweep for tooltip/popover/hovercard/combobox and run it during both init and portal; existing sweeps remain for dropdown/contextmenu/select. Initial-open and selection-label/value synchronization remain.
- `tmp/htmx-616/round2-anchored.log`: every anchored component stays in place and is htmx-powered across all rounds; dropdown POST and retained owner checks pass. Remaining failures concern the not-yet-converted dialog/drawer families and aggregate counts that include them.
- At this stage only dialog/drawer still contained `liftTemplates`. Build, component vet, and whitespace checks pass. The sandbox emitted a Go module stat-cache write warning during build; exit status was 0.
- Comment-only templ edits replace "at init" with "on open"; no additional markup/class changes. Generated files and the bundle come only from the existing normal development watchers. No commits.

### Round 2, Task 3

- Dialog registration now records nesting and retains the hidden wrapper as owner. Roots move to body in `openDialog`; init registers in-place roots and retires disconnected roots/owners.
- Implementation detail: the registry is a `Map` instead of a `WeakMap`, so init can enumerate and destroy registered states whose root itself was detached, as required by the plan. Every stale entry is deleted by `destroyDialog`; ownership cleanup runs before fresh registration.
- `tmp/htmx-616/round2-dialog.log`: all dialog/sheet/alertdialog/nested powered, POST, owner and Escape/backdrop checks pass; only the then-unconverted drawer and its aggregate counts failed. Final no-override probes `round2-final-{chromium,webkit}.log` now pass every check (0 failures each).
- `tmp/htmx-616/round2-sidebar-{chromium,webkit}.log`: mobile sidebar opens, closes when changing to desktop, reopens when changing back, then Escape closes with focus restored. The selector targets the visible trigger, because the hidden rail now also exists in the unopened DOM.
- Build and component vet pass. No commits.

### Round 2, Task 4

- Drawer now retains its hidden wrapper until open; `portal(dialog)` runs immediately before `dialog.show()`. Init still initializes all drawers and sweeps disconnected portal owners.
- `tmp/htmx-616/round2-drawer.log` and final probes: zero failures across initial load and both same-ID swaps. Final logs use freshly compiled branch servers on 8098/8099 with no bundle override.
- `tmp/htmx-616/round2-docs-{chromium,webkit}.log`: all drawer direction/axis checks pass at 767, 768 and 1280px; all four nested drawers open in order with stack attributes and close one at a time on Escape. No page errors.
- The docs probe uses each drawer's direct popup child now; before first open, descendant queries legitimately include the still-nested child drawers. No component workaround was added. No commits.

### Round 2, additional check findings

- `go test ./components/...` is **not green**: the sole failure is existing `TestClientConsumesInitialOpenAfterPortalMount` in `components/popover/popover_test.go`, which literally requires `liftTemplates();`. That conflicts with this round's explicit removal of the function. Per the fixed "no tests in the repo" decision the test is untouched; it needs review/update by the owner or Planner. All other component packages pass. Log: `tmp/htmx-616/round2-go-tests.log`.
- An extra initial-open-at-page-load fixture exposed a **pre-existing** deferred bundle ordering issue for dropdownmenu: `FloatingUIDOM` is not yet defined when its init calls `autoUpdate`. Reproduced identically on the untouched main server (`baseline-initial-chromium.log`) and this branch (`round2-initial-chromium.log`). This is separate from the accepted initial-open same-ID swap edge and was not expanded into this fix.

### Round 2, Task 5

- Final htmx probes in Chromium and WebKit both report **0 failed expectations** with the real branch server and no bundle override: all 12 elements processed on load and after each same-ID swap, exactly one POST per tested click, retained empty owner wrappers, nested dialog ordering, no stale body contents, no duplicate IDs, no page errors.
- All eleven docs pages pass in both engines (`round2-docs-{chromium,webkit}.log`), including lazy in-place contents before opening, body mount with connected empty owner after opening, Escape/focus behavior, responsive drawer directions and the four-level drawer stack. Mobile sidebar checks pass in both engines (`round2-sidebar-*.log`).
- All seven existing scroll-lock probes were run via `run-probes.py fixed`. The old `escape.mjs` selector became ambiguous because the hidden sidebar rail now exists before open; gitignored probe copies now select `[data-slot="sidebar-trigger"]`. `escape` and `inspect` previously ignored the engine argument and always launched Chromium; both copies now actually select Chromium/WebKit. Those two probes were rerun against both baseline and branch in both engines.
- Baseline infrastructure correction: the Planner's one-liner experiment had changed `/private/tmp/htmx-616-baseline` and its watcher removed the original bundle used by the still-running baseline docs binary. Restored only that original asset from the unchanged embedded fixture server on 8097; SHA-256 begins `efd116e806270ddd`, exactly matching main's bundle reference. No Planner source changes were overwritten. The invalid comparison runs were repeated after restoration.
- `tmp/htmx-616/round2-comparison.log`: all 14 engine/probe comparisons MATCH. The six behavioral scripts match byte for byte, including Chromium's existing `INSET FAIL` diagnostic. The diagnostic `inspect` output matches after normalizing generated random IDs; literal byte equality for those IDs is impossible across independent page renders, including baseline versus itself.
- `go build ./...`, `go vet ./components/...`, and `git diff --check` pass. The additional full component test run retains the single obsolete popover string assertion documented above; no repository tests were changed. The accepted initially-open same-ID-swap edge remains as specified by the Planner.
- Everything remains unstaged in the working tree for owner review. HEAD is still `da86e0c7`; no commits or PR. Current branch review servers: docs on 8098, htmx fixture on 8099. All task checkboxes reflect the specified browser/build/vet checks with the explicit harness corrections recorded here; the Planner owns the status/review section.

### Owner-requested finalization for one combined review

- The owner requested that all remaining work be completed together for manual review. This supersedes the earlier no-test-edit decision for the obsolete popover assertion.
- Updated the existing test to `TestClientConsumesInitialOpenState` and removed only its obsolete requirement for `liftTemplates();`. The checks for consuming declarative initial-open state and auto-positioning remain. No runtime behavior changed after the passing browser regressions.
- Final verification: `go test ./...` **passes for the entire repository**, `go vet ./...` passes, and `git diff --check` passes. The first sandboxed run could not bind the CLI test's local httptest server; rerunning with local server access produced a clean full pass (`tmp/htmx-616/final-go-test-clean.log`). This resolves the red component test mentioned in earlier historical entries.
- The complete portal fix, docs example adjustments, watcher-generated output and test correction are together in the unstaged working tree. No commits, no staging, no PR. HEAD remains `da86e0c7`. The Planner's accepted initial-open same-ID-swap limitation remains the agreed scope, not a pending implementation task.

## Planner review

### Round 1 (Claude, 2026-09-23)

- **Task 1: accepted.** The probe found what the Planner's did not: the settle gap on same-id swaps. The timing log is the decisive evidence.
- **Task 2: the Executor was right to stop.** Reopening the Decision was correct; the hidden node alone does not fix #616. The implementation is kept as the basis for round 2, only `liftTemplates` and the up-front portal calls go.
- **Task 3: valid for the round 1 state only.** Rerun as Task 5 of round 2.
- **Recommendation to take the one-liner: not followed.** The one-liner works (the Planner verified 0 failures in both engines on the template baseline) but violates the framework agnostic rule. Round 2 removes the init-time move instead, which is also the Base UI mount semantics.

### Round 2 (Claude, 2026-09-23)

Verified by the Planner, independently of the Executor logs: Codex's probe against the branch fixture on 8099 reports 0 failed expectations in Chromium; `go test ./components/...` passes; a positional comparison of computed sibling-dependent styles (border radii, border widths, margins, display, gap) of every `[data-slot]` element on eleven docs pages between `main` (8096) and the branch (8098) shows 0 differences, so the empty hidden wrapper that now stays inline breaks no `:last-child`, `:first-child` or button group rule. The button group rules select `[data-slot]` siblings and the wrapper carries none.

- **Task 1: accepted.** The probe now asserts the lazy portal itself: in place before open, under `<body>` with an empty connected owner after open, exact body counts, nested dialog order.
- **Task 2: accepted.** Seven anchored popups: `liftTemplates` and the up-front `portal()` are gone, the owner sweep runs once per `init` everywhere, initial-open and label sync stay. Diff is subtraction plus one extracted function per component.
- **Task 3: accepted.** `Map` instead of `WeakMap` is right: `init` must enumerate registered states to retire a detached root, and `destroyDialog` deletes every entry, so nothing leaks. Nesting recorded in `ensureDialog` through `root.parentElement.closest(...)` covers the parent in place and already portaled. The unconditional `appendChild` in `openDialog` re-appends a root that is already last, which only costs one observer pass; acceptable.
- **Task 4: accepted.** `portal(dialog)` immediately before `dialog.show()`, nothing else.
- **Task 5: accepted.** The renamed popover test dropped only the assertion on a function that no longer exists.
- **Done by the Planner, same working tree:** the tooltip Portal comment (`components/tooltip/tooltip.templ:97`) no longer argues with button group `:last-child` rounding, the wrapper carries no data-slot and sibling rules ignore it (measured). The accepted edge (initially open content inside a swapped fragment whose ids already exist in the target) is one paragraph in the JavaScript section of `internal/service/content/docs/installation.md`, there is no dedicated htmx page.
