#!/bin/sh
# Serves the reference examples on 3100 with Vite instead of next build/start,
# for machines where the Next build does not fit in memory. Same sources, same
# route (/examples/base/<name>), same root providers as app/layout.tsx.
cd "$(dirname "$0")" || exit 1
REF=${REFERENCE_DIR:-../../tmp/parity-runtime/reference}
rm -rf "$REF/apps/v4/.vite-ref" && cp -r app "$REF/apps/v4/.vite-ref"
# Next serves apps/v4/public; the fonts next/font would self-host go next to it.
mkdir -p "$REF/apps/v4/public/__ref-fonts"
cp ../../assets/fonts/geist/geist-variable.woff2 ../../assets/fonts/geist/geist-mono-variable.woff2 ../../assets/fonts/noto/*.woff2 "$REF/apps/v4/public/__ref-fonts/"
[ -d node_modules ] || npm install --legacy-peer-deps
REFERENCE_DIR="$REF" exec npx vite --config vite.config.mjs
