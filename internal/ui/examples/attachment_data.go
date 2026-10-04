package examples

import (
	"github.com/a-h/templ"

	"github.com/axadrn/shadcn-templ/v2/components/icon"
)

type attachmentImageItem struct {
	Name, Meta, Src, Alt string
}

var attachmentImages = []attachmentImageItem{
	{
		Name: "workspace.png",
		Meta: "PNG · 820 KB",
		Src:  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900&auto=format&fit=crop&q=80",
		Alt:  "Workspace",
	},
	{
		Name: "desk-reference.jpg",
		Meta: "JPG · 1.1 MB",
		Src:  "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=900&auto=format&fit=crop&q=80",
		Alt:  "Desk",
	},
	{
		Name: "office-reference.jpg",
		Meta: "JPG · 940 KB",
		Src:  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=900&auto=format&fit=crop&q=80",
		Alt:  "Office",
	},
}

type attachmentGroupItem struct {
	Name, Meta, Src string
	Icon            func(...icon.Props) templ.Component
}

var attachmentGroupItems = []attachmentGroupItem{
	{Name: "briefing-notes.pdf", Meta: "PDF · 1.4 MB", Icon: icon.FileText},
	{
		Name: "workspace.png",
		Meta: "PNG · 820 KB",
		Src:  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900&auto=format&fit=crop&q=80",
	},
	{Name: "customers.csv", Meta: "CSV · 18 KB", Icon: icon.Table},
	{Name: "renderer.tsx", Meta: "TSX · 12 KB", Icon: icon.FileCode},
}
