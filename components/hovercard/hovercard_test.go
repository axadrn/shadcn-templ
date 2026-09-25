package hovercard

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestControlledOpenOverridesDefaultOpen(t *testing.T) {
	open := false
	ctx := context.WithValue(context.Background(), stateKey, ctxState{id: "h", open: &open, defaultOpen: true})
	var output bytes.Buffer
	if err := Content().Render(ctx, &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if !strings.Contains(html, `data-templ-open="false"`) || strings.Contains(html, `data-templ-default-open`) {
		t.Fatalf("controlled false must override defaultOpen true: %s", html)
	}
}

func TestClientRequestsCancelableOpenChanges(t *testing.T) {
	source, err := os.ReadFile("hovercard.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{
		`new CustomEvent("hovercard-open-change"`,
		`cancelable: true`,
		`data-templ-open`,
		`FloatingUIDOM.autoUpdate(trigger, content, update`,
		`layoutShift: typeof IntersectionObserver !== "undefined"`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
	if strings.Contains(js, `data-state`) {
		t.Fatal("hover card client still uses Radix data-state semantics")
	}
}
