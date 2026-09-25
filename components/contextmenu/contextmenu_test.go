package contextmenu

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
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

func TestNativeMenuItemsFillTheirRows(t *testing.T) {
	for name, classes := range map[string]string{
		"item":       itemClasses(false),
		"check item": checkItemClasses("cn-context-menu-checkbox-item", false),
	} {
		if !strings.Contains(classes, "w-full") || !strings.Contains(classes, "text-left") {
			t.Fatalf("%s classes must preserve Base UI row layout: %q", name, classes)
		}
	}

	var output bytes.Buffer
	if err := SubTrigger().Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	if html := output.String(); !strings.Contains(html, "w-full") || !strings.Contains(html, "text-left") {
		t.Fatalf("submenu trigger must preserve Base UI row layout: %s", html)
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
		`new CustomEvent("contextmenu-sub-open-change"`,
		`new CustomEvent("contextmenu-checked-change"`,
		`new CustomEvent("contextmenu-value-change"`,
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
	if err := Sub(SubProps{Open: &open, DefaultOpen: true}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if !strings.Contains(html, `data-templ-open="false"`) ||
		strings.Contains(html, `data-templ-default-open`) {
		t.Fatalf("rendered controlled submenu is missing state markers: %s", html)
	}
}
