package resizable

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestPanelUsesUpstreamTwoLayerOverflowStructure(t *testing.T) {
	var output bytes.Buffer
	if err := Panel(PanelProps{
		ID:          "primary",
		DefaultSize: "50%",
		MinSize:     "20%",
		Class:       "panel-content",
	}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}

	html := output.String()
	for _, want := range []string{
		`data-slot="resizable-panel"`,
		`data-panel`,
		`flex-basis:50%`,
		`overflow:visible`,
		`max-height:100%;max-width:100%;flex-grow:1;overflow:auto`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered panel is missing %q: %s", want, html)
		}
	}
}

func TestHandleMatchesBaseWrapperAndPrimitiveState(t *testing.T) {
	var output bytes.Buffer
	if err := Handle(HandleProps{ID: "separator", WithHandle: true}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}

	html := output.String()
	for _, want := range []string{
		`data-slot="resizable-handle"`,
		`data-separator="inactive"`,
		`role="separator"`,
		`aria-orientation="vertical"`,
		`tabindex="0"`,
		`cn-resizable-handle`,
		`cn-resizable-handle-icon z-10 flex shrink-0`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered handle is missing %q: %s", want, html)
		}
	}
}

func TestGroupUsesUpstreamHitTargetDefaults(t *testing.T) {
	var output bytes.Buffer
	if err := PanelGroup(PanelGroupProps{ID: "layout"}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}

	html := output.String()
	for _, want := range []string{
		`data-slot="resizable-panel-group"`,
		`data-group`,
		`data-templ-resize-target-minimum-size-coarse="20"`,
		`data-templ-resize-target-minimum-size-fine="10"`,
		`cn-resizable-panel-group`,
		`touch-action:pan-y`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered group is missing %q: %s", want, html)
		}
	}
}

func TestClientPortsUpstreamInteractionDetails(t *testing.T) {
	source, err := os.ReadFile("resizable.js")
	if err != nil {
		t.Fatal(err)
	}

	js := string(source)
	for _, want := range []string{
		`const CURSOR_FLAG_HORIZONTAL_MIN = 0b0001`,
		`const CURSOR_FLAG_VERTICAL_MAX = 0b1000`,
		`function calculateHitRegions(state)`,
		`hasInterleavedStaticContent`,
		`function compareStackingOrder(a, b)`,
		`function isViableHitTarget(groupElement, hitRegion, pointerEventTarget)`,
		`separator.element.focus()`,
		`data-separator`,
		`case "F6"`,
		`document.addEventListener("pointerleave"`,
		`document.addEventListener("pointerout"`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
