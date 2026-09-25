package dropdownmenu

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestNativeMenuItemsFillTheirRows(t *testing.T) {
	for name, classes := range map[string]string{
		"item":       itemClasses(false),
		"check item": checkItemClasses("cn-dropdown-menu-checkbox-item", false),
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

func TestContentCarriesStateAndPlacement(t *testing.T) {
	ctx := context.WithValue(context.Background(), stateKey, ctxState{id: "menu", open: utilsPtr(true)})
	var output bytes.Buffer
	if err := Content(ContentProps{
		Side:  SideRight,
		Align: AlignStart,
	}).Render(ctx, &output); err != nil {
		t.Fatal(err)
	}

	html := output.String()
	for _, want := range []string{
		`id="menu"`,
		`data-templ-side="right"`,
		`data-templ-align="start"`,
		`data-templ-open="true"`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered menu is missing %q: %s", want, html)
		}
	}
}

func TestClientUsesCollisionAvoidance(t *testing.T) {
	source, err := os.ReadFile("dropdownmenu.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{
		`flip({ padding: COLLISION_PADDING })`,
		`shift({ padding: COLLISION_PADDING })`,
		`FloatingUIDOM.autoUpdate(trigger, content, update`,
		`layoutShift: typeof IntersectionObserver !== "undefined"`,
		`new CustomEvent("dropdownmenu-open-change"`,
		`new CustomEvent("dropdownmenu-sub-open-change"`,
		`new CustomEvent("dropdownmenu-checked-change"`,
		`new CustomEvent("dropdownmenu-value-change"`,
		`cancelable: true`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
	if strings.Contains(js, `data-state`) {
		t.Fatal("dropdown menu client still uses Radix data-state semantics")
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

func utilsPtr(b bool) *bool { return &b }
