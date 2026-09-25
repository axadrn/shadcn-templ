package combobox

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
	p := Props{Value: &value, DefaultValue: "templ", Open: &open, DefaultOpen: true}
	if got := initialValue(p); got != "" {
		t.Fatalf("controlled empty value must override default value, got %q", got)
	}
	ctx := context.WithValue(context.Background(), stateKey, ctxState{id: "c", open: p.Open, defaultOpen: p.DefaultOpen})
	var output bytes.Buffer
	if err := Content().Render(ctx, &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if !strings.Contains(html, `data-templ-open="false"`) || strings.Contains(html, `data-templ-default-open`) {
		t.Fatalf("controlled false open state must override defaultOpen true: %s", html)
	}
}

func TestClientRequestsCancelableValueAndOpenChanges(t *testing.T) {
	source, err := os.ReadFile("combobox.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{
		`new CustomEvent("combobox-change"`,
		`new CustomEvent("combobox-open-change"`,
		`cancelable: true`,
		`content.hasAttribute("data-templ-value")`,
		`content.hasAttribute("data-templ-open")`,
		`FloatingUIDOM.autoUpdate(anchor, content, update`,
		`layoutShift: typeof IntersectionObserver !== "undefined"`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
	if strings.Contains(js, `data-state`) {
		t.Fatal("combobox client still uses Radix data-state semantics")
	}
}
