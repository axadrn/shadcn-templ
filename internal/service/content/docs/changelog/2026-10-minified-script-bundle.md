---
title: "October 2026 - Minified script bundle"
description: "shadcn-templ bundle minifies the component JavaScript, like next build."
date: 2026-10-05
---

`shadcn-templ bundle` now minifies the component JavaScript, like `next build` minifies shadcn's components. With every component installed the bundle drops from 967 KB to 387 KB, and from 227 KB to 120 KB gzipped.

Only the bundle the browser loads is minified. Your component sources stay readable, and `bundle --watch`, which `task dev` runs, writes a readable bundle for debugging, like `next dev`. Both use the same file name, a hash of the sources, so the committed `components/scripts_bundle.go` does not change between development and production builds.

Minification runs on your machine, through esbuild's Go library, with the browser targets of Next's default build. It never runs at runtime and needs no Node. Nothing to migrate: run `shadcn-templ bundle` as before.

See [CLI](/docs/cli#bundle) and [Installation](/docs/installation#javascript).
