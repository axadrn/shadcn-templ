package shared

import "github.com/a-h/templ"

// ServerRendered gives a trigger or close part's attributes to a Button that
// keeps its own data-slot. In the reference examples without "use client"
// (React Server Components) a <Button /> of a render prop has rendered before
// it reaches the part, since button.tsx has no "use client" either: its
// data-slot wins over the part's. A client component in the render prop
// (InputGroupAddon, SidebarMenuButton) takes the part's slot.
func ServerRendered(attrs templ.Attributes) templ.Attributes {
	merged := templ.Attributes{}
	for k, v := range attrs {
		if k != "data-slot" {
			merged[k] = v
		}
	}
	return merged
}
