package dashboard01

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestInteractiveBaseBlockPendantsAreRendered(t *testing.T) {
	var out bytes.Buffer
	if err := DataTable(Data[:1]).Render(context.Background(), &out); err != nil {
		t.Fatal(err)
	}
	html := out.String()
	for _, want := range []string{
		"data-dashboard01-sortable",
		"data-dashboard01-drag-handle",
		"data-dashboard01-save=\"Cover page\"",
		"window.templ?.toast?.promise",
		"data-dashboard01-drawer-trigger",
		"mobile ? \"down\" : \"right\"",
	} {
		if !strings.Contains(html, want) {
			t.Errorf("rendered data table is missing %q", want)
		}
	}

	out.Reset()
	if err := dataTableDrawerBody(Data[0]).Render(context.Background(), &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "class=\"hidden md:contents\"") {
		t.Error("rendered drawer body does not hide desktop-only details on mobile")
	}

	out.Reset()
	if err := ChartAreaInteractive().Render(context.Background(), &out); err != nil {
		t.Fatal(err)
	}
	html = out.String()
	for _, want := range []string{
		"data-dashboard01-chart-range-card",
		"window.matchMedia(\"(max-width: 767px)\")",
		"setRange(card, \"7d\")",
	} {
		if !strings.Contains(html, want) {
			t.Errorf("rendered chart is missing %q", want)
		}
	}
}
