package contextmenu

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"

	"github.com/a-h/templ"
)

func TestControlledOpenOverridesDefaultOpen(t *testing.T) {
	open := false
	ctx := context.WithValue(context.Background(), stateKey, ctxState{id: "m", open: &open, defaultOpen: true})
	var output bytes.Buffer
	if err := Content().Render(ctx, &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if !strings.Contains(html, `data-templ-open="false"`) || strings.Contains(html, `data-templ-default-open`) {
		t.Fatalf("controlled false must override defaultOpen true: %s", html)
	}
}

// Base UI's menu items are non native: a div with role menuitem, the
// submenu trigger too.
func TestItemsAreDivs(t *testing.T) {
	for name, c := range map[string]templ.Component{
		"item":        Item(),
		"check item":  CheckboxItem(),
		"radio item":  RadioItem(),
		"sub trigger": SubTrigger(),
	} {
		var output bytes.Buffer
		if err := c.Render(context.Background(), &output); err != nil {
			t.Fatal(err)
		}
		if html := output.String(); !strings.HasPrefix(html, "<div") || strings.Contains(html, "<button") {
			t.Fatalf("%s must render a div: %s", name, html)
		}
	}
}

func TestClientRequestsCancelableRootAndItemChanges(t *testing.T) {
	source, err := os.ReadFile("contextmenu.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{
		`new CustomEvent("contextmenu-open-change"`,
		`event: "contextmenu"`,
		`cancelable: true`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
	if strings.Contains(js, `data-state`) {
		t.Fatal("context menu client still uses Radix data-state semantics")
	}
}

func TestSubControlledOpenOverridesDefaultOpen(t *testing.T) {
	open := false
	var output bytes.Buffer
	sub := Sub(SubProps{Open: &open, DefaultOpen: true})
	if err := sub.Render(templ.WithChildren(context.Background(), SubContent()), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if !strings.Contains(html, `data-templ-open="false"`) ||
		strings.Contains(html, `data-templ-default-open`) {
		t.Fatalf("rendered controlled submenu is missing state markers: %s", html)
	}
}

func TestMenuBlockRequestsCancelableChanges(t *testing.T) {
	source, err := os.ReadFile("../baseui/menu.js")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"-sub-open-change"`, `"-checked-change"`, `"-value-change"`, `cancelable: true`} {
		if !strings.Contains(string(source), want) {
			t.Fatalf("menu block is missing %q", want)
		}
	}
}
