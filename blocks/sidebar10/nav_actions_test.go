package sidebar10

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestActionsPopoverIsLinkedAndInitiallyOpen(t *testing.T) {
	var output bytes.Buffer
	if err := NavActions().Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}

	html := output.String()
	for _, want := range []string{
		`aria-controls="sidebar10-actions-popover"`,
		`id="sidebar10-actions-popover"`,
		`data-templ-default-open`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered actions popover is missing %q: %s", want, html)
		}
	}
}
