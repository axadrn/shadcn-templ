import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

// The reference checkout from parity/README.md; serve.sh copies app/ into it as .vite-ref.
const V4 = path.resolve(process.env.REFERENCE_DIR || path.join(import.meta.dirname, "../../tmp/parity-runtime/reference"), "apps/v4")
const S = path.join(V4, ".vite-ref/shims")

// Examples without "use client" are server components upstream: an element
// they pass as a render prop reaches the client already rendered, so its own
// data-slot wins over the part's. Emulate that for Button.
const serverComponents = {
  name: "server-component-render-props",
  enforce: "pre",
  transform(code, id) {
    if (!id.includes("/examples/base/") || code.includes('"use client"')) return
    return code.replace(/from "@\/styles\/(base-[a-z]+)\/ui\/button"/g, 'from "virtual:server-button/$1"')
  },
  resolveId(id) {
    if (id.startsWith("virtual:server-button/")) return "\0" + id + ".js"
  },
  load(id) {
    const m = id.match(/^\0virtual:server-button\/(base-[a-z]+)\.js$/)
    if (!m) return
    const src = `@/styles/${m[1]}/ui/button`
    return `import * as React from "react"
import * as M from "${src}"
export * from "${src}"
export const Button = React.forwardRef(function Button(props, ref) {
  return React.createElement(M.Button, { ...props, ref, "data-slot": "button" })
})`
  },
}

export default defineConfig({
  root: path.join(V4, ".vite-ref"),
  plugins: [serverComponents, react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: path.join(S, "link.tsx") },
      { find: /^next\/image$/, replacement: path.join(S, "image.tsx") },
      { find: /^next\/font\/google$/, replacement: path.join(S, "font.ts") },
      { find: /^next\/navigation$/, replacement: path.join(S, "navigation.ts") },
      { find: /^server-only$/, replacement: path.join(S, "empty.ts") },
      { find: /^@\//, replacement: V4 + "/" },
    ],
  },
  define: { "process.env": "{}" },
  server: { port: 3100, strictPort: true, fs: { allow: [path.resolve(V4, "../..")] } },
  optimizeDeps: { entries: ["main.tsx", "../examples/base/*.tsx", "../registry/bases/base/ui/*.tsx"], esbuildOptions: { target: "es2022" } },
  esbuild: { target: "es2022" },
  appType: "spa",
  logLevel: "warn",
})
