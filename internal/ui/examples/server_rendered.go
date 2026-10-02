package examples

import "github.com/a-h/templ"

// serverRendered gives a trigger or close part's attributes to an element
// that keeps its own data-slot. The reference examples without "use client"
// are React Server Components: the element of the render prop (<Button />,
// <InputGroupAddon />) has rendered before it reaches the part, so its
// data-slot wins over the part's.
func serverRendered(attrs templ.Attributes) templ.Attributes {
	merged := templ.Attributes{}
	for k, v := range attrs {
		if k != "data-slot" {
			merged[k] = v
		}
	}
	return merged
}
