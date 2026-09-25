package modules

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestBuildBlockFileTreePreservesRegistryOrder(t *testing.T) {
	files := []BlockFile{
		{Path: "blocks/dashboard01/page.templ"},
		{Path: "blocks/dashboard01/data.go"},
		{Path: "blocks/dashboard01/app_sidebar.templ"},
	}

	tree := buildBlockFileTree(files)
	dashboard := tree[0].Children[0]

	for i, want := range []string{"page.templ", "data.go", "app_sidebar.templ"} {
		if got := dashboard.Children[i].Name; got != want {
			t.Fatalf("file %d: got %q, want %q", i, got, want)
		}
	}
}

func TestBlockViewerCodeKeepsFlexLayoutWhenSwitchingFiles(t *testing.T) {
	t.Setenv("GO_ENV", "production")

	entry := BlockEntry{Files: []BlockFile{
		{Path: "first.templ", Content: "package first"},
		{Path: "second.go", Content: "package second"},
	}}

	var rendered bytes.Buffer
	if err := blockViewerCode(entry).Render(context.Background(), &rendered); err != nil {
		t.Fatal(err)
	}

	html := rendered.String()
	figureClass := `class="mx-0! mt-0 flex min-w-0 flex-1 flex-col rounded-xl border-none"`
	if got := strings.Count(html, figureClass); got != len(entry.Files) {
		t.Fatalf("got flex figure class %d times, want %d", got, len(entry.Files))
	}
	if strings.Contains(html, `class="mx-0! mt-0 hidden`) {
		t.Fatal("hidden must remain an HTML attribute, not replace the flex display class")
	}
	if !strings.Contains(html, `data-templ-block-file-pane="second.go" hidden `+figureClass) {
		t.Fatal("inactive file pane is not hidden with the native hidden attribute")
	}
	if !strings.Contains(html, `overflow-y-auto`) || !strings.Contains(html, `data-templ-block-file-scroll`) {
		t.Fatal("file pane is missing its vertical scroll container")
	}
}

func TestBlockViewerUsesResizablePrimitiveComposition(t *testing.T) {
	entry := BlockEntry{Name: "dashboard-01", IframeHeight: "930px"}

	var rendered bytes.Buffer
	if err := blockViewerView(entry).Render(context.Background(), &rendered); err != nil {
		t.Fatal(err)
	}

	html := rendered.String()
	for _, want := range []string{
		`data-slot="resizable-panel-group"`,
		`id="dashboard-01-preview-panel"`,
		`data-templ-default-size="100%"`,
		`data-templ-min-size="30%"`,
		`data-slot="resizable-handle"`,
		`id="dashboard-01-preview-spacer"`,
		`data-templ-default-size="0%"`,
		`class="relative z-20 no-scrollbar w-full bg-background"`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("block viewer is missing %q", want)
		}
	}
	if strings.Contains(html, `data-templ-block-panel style="width:`) {
		t.Fatal("block viewer still uses the legacy inline-width resize implementation")
	}
}
