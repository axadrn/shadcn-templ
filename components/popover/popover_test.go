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
		initialOpen: true,
	})

	var output bytes.Buffer
	if err := Content().Render(ctx, &output); err != nil {
		t.Fatal(err)
	}

	html := output.String()
	for _, want := range []string{
		`id="actions"`,
		`data-tui-popover-initial-open="true"`,
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
	if initialOpen(Props{Open: &closed, DefaultOpen: true}) {
		t.Fatal("controlled false must override defaultOpen true")
	}

	opened := true
	if !initialOpen(Props{Open: &opened}) {
		t.Fatal("controlled true must open the popover")
	}
}

func TestClientConsumesInitialOpenState(t *testing.T) {
	source, err := os.ReadFile("popover.js")
	if err != nil {
		t.Fatal(err)
	}

	js := string(source)
	for _, want := range []string{
		`content.getAttribute("data-tui-popover-initial-open") === "true"`,
		`content.removeAttribute("data-tui-popover-initial-open")`,
		`open(content);`,
		`FloatingUIDOM.autoUpdate(trigger, content, update`,
		`layoutShift: typeof IntersectionObserver !== "undefined"`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
