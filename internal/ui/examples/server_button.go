package examples

import "github.com/a-h/templ"

// serverButton keeps the Button's own data-slot on a trigger or close part.
// The reference examples without "use client" are React Server Components:
// their <Button /> is rendered before it reaches the part's render prop, so
// its data-slot="button" wins over the part's slot.
func serverButton(attrs templ.Attributes) templ.Attributes {
	merged := templ.Attributes{}
	for k, v := range attrs {
		merged[k] = v
	}
	merged["data-slot"] = "button"
	return merged
}
