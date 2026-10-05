package selectex

import selectcomp "github.com/axadrn/shadcn-templ/v2/components/select"

// The items of upstream's select examples, the first one Base UI's null
// item.
var selectFruits = []selectcomp.ItemData{
	{Label: "Select a fruit", Value: ""},
	{Label: "Apple", Value: "apple"},
	{Label: "Banana", Value: "banana"},
	{Label: "Blueberry", Value: "blueberry"},
	{Label: "Grapes", Value: "grapes"},
	{Label: "Pineapple", Value: "pineapple"},
}
