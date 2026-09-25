package popover

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestContentCarriesDeclarativeInitialOpenState(t *testing.T) {
	ctx := context.WithValue(context.Background(), stateKey, ctxState{
		id:          "actions",
		defaultOpen: true,
	})

	var output bytes.Buffer
	if err := Content().Render(ctx, &output); err != nil {
		t.Fatal(err)
	}

	html := output.String()
	for _, want := range []string{
		`id="actions"`,
		`data-templ-default-open`,
		`data-closed`,
		`hidden`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered popover is missing %q: %s", want, html)
		}
	}
}

func TestControlledOpenOverridesDefaultOpen(t *testing.T) {
	closed := false
	ctx := context.WithValue(context.Background(), stateKey, ctxState{id: "p", open: &closed, defaultOpen: true})
	var output bytes.Buffer
	if err := Content().Render(ctx, &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if !strings.Contains(html, `data-templ-open="false"`) || strings.Contains(html, `data-templ-default-open`) {
		t.Fatalf("controlled false must override defaultOpen true: %s", html)
	}
}

func TestClientConsumesInitialOpenState(t *testing.T) {
	source, err := os.ReadFile("popover.js")
	if err != nil {
		t.Fatal(err)
	}

	js := string(source)
	for _, want := range []string{
		`content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")`,
		`open(content);`,
		`FloatingUIDOM.autoUpdate(trigger, content, update`,
		`layoutShift: typeof IntersectionObserver !== "undefined"`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
