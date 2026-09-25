package tooltip

import (
	"os"
	"strings"
	"testing"
)

func TestClientUsesBaseUIOpenStateAndAnchorTracking(t *testing.T) {
	source, err := os.ReadFile("tooltip.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{
		`new CustomEvent("tooltip-open-change"`,
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
		t.Fatal("tooltip client still uses Radix data-state semantics")
	}
}
