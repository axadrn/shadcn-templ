package selectcomp

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestControlledStateOverridesDefaults(t *testing.T) {
	value := ""
	open := false
	p := Props{Value: &value, DefaultValue: "banana", Open: &open, DefaultOpen: true}
	if got := initialValue(p); got != "" {
		t.Fatalf("controlled empty value must override default value, got %q", got)
	}
	ctx := context.WithValue(context.Background(), stateKey, ctxState{id: "s", open: p.Open, defaultOpen: p.DefaultOpen})
	var output bytes.Buffer
	if err := Content().Render(ctx, &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if !strings.Contains(html, `data-templ-open="false"`) || strings.Contains(html, `data-templ-default-open`) {
		t.Fatalf("controlled false open state must override defaultOpen true: %s", html)
	}
}

func TestItemSelectionComesOnlyFromRootValue(t *testing.T) {
	ctx := context.WithValue(context.Background(), stateKey, ctxState{value: "banana"})
	var output bytes.Buffer
	if err := Item(ItemProps{Value: "banana"}).Render(ctx, &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	for _, want := range []string{`data-selected`, `aria-selected="true"`} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered item is missing %q: %s", want, html)
		}
	}
}

func TestClientRequestsCancelableValueAndOpenChanges(t *testing.T) {
	source, err := os.ReadFile("select.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{
		`new CustomEvent("select-change"`,
		`new CustomEvent("select-open-change"`,
		`cancelable: true`,
		`trigger.hasAttribute("data-templ-value")`,
		`content.hasAttribute("data-templ-open")`,
		`FloatingUIDOM.autoUpdate(trigger, content, update`,
		`layoutShift: typeof IntersectionObserver !== "undefined"`,
		`positionPopper(content, trigger, alignMode ? "fixed" : "absolute")`,
		`positionPopper(content, trigger, "absolute")`,
		`content._templOpenMethod !== "touch"`,
		`openMethod: nextOpen ? openMethod || "programmatic" : null`,
		`open(content, trigger, "programmatic")`,
		`document.addEventListener("pointercancel"`,
		`popup.setAttribute("data-align-trigger", "false")`,
		`requestOpenChange(content, true, "keyboard")`,
		`const SELECTED_DELAY = 400`,
		`item._templAllowMouseSelection = true`,
		`item._templPointerType === "touch"`,
		`document.addEventListener("mouseup"`,
		`item.hasAttribute("data-selected")`,
		`requestOpenChange(content, false)`,
		`requestOpenChange(content, true,`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}

func TestPositionerStartsFixedForAlignedMode(t *testing.T) {
	source, err := os.ReadFile("select.templ")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(source), `class="pointer-events-none isolate fixed`) {
		t.Fatal("select positioner must start fixed like Base UI's aligned mode")
	}
}
