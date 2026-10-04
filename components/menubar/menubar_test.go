package menubar

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"

	"github.com/a-h/templ"
)

func render(t *testing.T, c templ.Component) string {
	t.Helper()
	var output bytes.Buffer
	if err := c.Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	return output.String()
}

// Base UI's Menubar: a horizontal, modal menubar whose triggers are its
// menuitems, the first one the tab stop.
func TestMenubarAndTriggers(t *testing.T) {
	html := render(t, templ.ComponentFunc(func(ctx context.Context, w io.Writer) error {
		return Menubar(Props{ID: "bar"}).Render(templ.WithChildren(ctx, templ.ComponentFunc(func(ctx context.Context, w io.Writer) error {
			for _, id := range []string{"file", "edit"} {
				if err := Menu(MenuProps{ID: id}).Render(templ.WithChildren(ctx, Trigger()), w); err != nil {
					return err
				}
			}
			return nil
		})), w)
	}))
	for _, want := range []string{
		`id="bar"`, `role="menubar"`, `aria-orientation="horizontal"`, `data-orientation="horizontal"`, `data-modal`,
		`id="file-trigger"`, `data-templ-controls="file"`, `role="menuitem"`, `aria-haspopup="menu"`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("menubar is missing %q: %s", want, html)
		}
	}
	if strings.Index(html, `tabindex="0"`) > strings.Index(html, `id="edit-trigger"`) || !strings.Contains(html, `tabindex="-1"`) {
		t.Fatalf("only the first trigger is the tab stop: %s", html)
	}
}

// MenubarContent's defaults: align start, alignOffset -4, sideOffset 8.
func TestContentDefaults(t *testing.T) {
	html := render(t, Content())
	for _, want := range []string{
		`data-slot="menubar-content"`, `data-templ-side="bottom"`, `data-templ-align="start"`,
		`data-templ-side-offset="8"`, `data-templ-align-offset="-4"`, `role="menu"`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("content is missing %q: %s", want, html)
		}
	}
}

// shadcn renders data-inset={inset}: "true" when set, nothing otherwise.
func TestInset(t *testing.T) {
	if html := render(t, Item(ItemProps{Inset: true})); !strings.Contains(html, `data-inset="true"`) {
		t.Fatalf("inset item: %s", html)
	}
	if html := render(t, Item()); strings.Contains(html, `data-inset`) {
		t.Fatalf("plain item: %s", html)
	}
}
