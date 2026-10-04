package examples

import "github.com/a-h/templ"

// RegistryEntry links a demo name (the shadcn mdx name, e.g. "button-demo")
// to our example component and its source file for the code block.
type RegistryEntry struct {
	Component templ.Component
	File      string
	// Style is the style the reference example imports its ui from
	// ("base-rhea" for @/styles/base-rhea/ui/*), "" for base-nova.
	Style string
	// RTL marks an example that imports the ui-rtl build
	// (@/styles/base-nova/ui-rtl/*): its components' classes compile with
	// the RTL transform.
	RTL bool
}

// Registry resolves <ComponentPreview name="..."/> shortcodes in the
// markdown component docs. examples/all fills it at startup; the docs code
// depends on this package only, so an edit to one example rebuilds its own
// package and examples/all, not the pages that render the registry.
var Registry = map[string]RegistryEntry{}
