#!/bin/sh
# Builds and serves shadcn's examples route with Next on 3100: the reference
# checkout's apps/v4 reduced to app/layout.tsx and (view)/examples, so
# `next build` fits in a few GB and `next start` in a few hundred MB.
# Usage: parity/reference-next.sh [build|start]   (both without argument)
set -e
REF=${REFERENCE_DIR:-$(dirname "$0")/../tmp/parity-runtime/reference}
cd "$REF/apps/v4"
if [ "${1:-build}" = build ]; then
  # Routes other than the examples route go into a private folder (Next
  # ignores _folders); the create helpers the registry imports stay.
  mkdir -p app/_off
  [ -d "app/(app)/docs" ] && mv "app/(app)" app/_off/app_group && mkdir -p "app/(app)/(typeset)" "app/(app)/(create)" \
    && cp "app/_off/app_group/(typeset)/typeset.css" "app/(app)/(typeset)/" \
    && cp -r "app/_off/app_group/(create)/components" "app/_off/app_group/(create)/lib" "app/_off/app_group/(create)/hooks" "app/(app)/(create)/"
  for r in api og r rss.xml sitemap.ts robots.ts typeset.css; do [ -e "app/$r" ] && mv "app/$r" app/_off/ ; done
  for r in view preview; do [ -d "app/(view)/$r" ] && mkdir -p app/_off/view_group && mv "app/(view)/$r" app/_off/view_group/ ; done
  NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=4096 npx next build
fi
if [ "${1:-start}" = start ] || [ -z "$1" ]; then
  NEXT_TELEMETRY_DISABLED=1 exec npx next start --port "${PORT:-3100}"
fi
