import * as React from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server.browser"
import { ThemeProvider } from "@/components/theme-provider"
import { ActiveThemeProvider } from "@/components/active-theme"
import { TooltipProvider as BaseTooltipProvider } from "@/registry/bases/base/ui/tooltip"
import { Toaster as BaseToaster } from "@/styles/base-nova/ui/toast"
import "./ref.css"

// Pendant of app/layout.tsx around (view)/examples/[base]/[name]/page.tsx,
// rendered like Next does: the page is rendered to HTML first (server render
// markup such as <option selected> and useId values), then hydrated in place.
const modules = import.meta.glob("../examples/base/*.tsx")

function pick(mod: any, name: string) {
  const key = Object.keys(mod).find((k) => typeof mod[k] === "function" || typeof mod[k] === "object") || name
  return mod.default || mod[key]
}

const m = location.pathname.match(/^\/examples\/base\/([^/]+)/)
const name = m?.[1]
const load = name ? modules[`../examples/base/${name}.tsx`] : undefined

if (!load) {
  document.title = "404"
  document.body.textContent = "not found"
} else {
  const Example = pick(await load(), name!)
  const tree = (
    <ThemeProvider>
      <ActiveThemeProvider>
        <BaseTooltipProvider delay={0}>
          <Example />
          <BaseToaster />
        </BaseTooltipProvider>
      </ActiveThemeProvider>
    </ThemeProvider>
  )
  document.body.innerHTML = renderToString(tree)
  hydrateRoot(document.body, tree)
}
