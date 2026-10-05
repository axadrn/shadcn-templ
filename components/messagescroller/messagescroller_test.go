package messagescroller

import (
	"bytes"
	"context"
	"strings"
	"io"
	"testing"

	"github.com/a-h/templ"
)

func render(t *testing.T, c templ.Component, ctx ...context.Context) string {
	t.Helper()
	var out bytes.Buffer
	c0 := context.Background()
	if len(ctx) > 0 {
		c0 = ctx[0]
	}
	if err := c.Render(c0, &out); err != nil {
		t.Fatal(err)
	}
	return out.String()
}

func contains(t *testing.T, html string, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(html, want) {
			t.Fatalf("missing %q in %s", want, html)
		}
	}
}

func TestProviderMarkersOnRoot(t *testing.T) {
	peek := 96
	inner := MessageScroller()
	html := render(t, templ.ComponentFunc(func(ctx context.Context, w io.Writer) error {
		return Provider(ProviderProps{AutoScroll: true, DefaultScrollPosition: DefaultScrollPositionStart, ScrollPreviousItemPeek: &peek, ScrollMargin: 12}).Render(templ.WithChildren(ctx, inner), w)
	}))
	contains(t, html, `data-slot="message-scroller"`, `data-templ-auto-scroll`, `data-templ-default-scroll-position="start"`, `data-templ-scroll-previous-item-peek="96"`, `data-templ-scroll-margin="12"`)
	if strings.Contains(html, "data-pending-scroll") {
		t.Fatalf("start opens without a pending scroll: %s", html)
	}
}

func TestDefaultOpensPending(t *testing.T) {
	contains(t, render(t, MessageScroller()), `data-pending-scroll`)
	contains(t, render(t, Viewport()), `role="region"`, `aria-label="Messages"`, `tabindex="0"`, `data-pending-scroll`)
}

func TestContentAndItem(t *testing.T) {
	contains(t, render(t, Content()), `role="log"`, `aria-relevant="additions"`, `data-message-scroller-spacer`, `hidden`)
	contains(t, render(t, Item(ItemProps{MessageID: "m1", ScrollAnchor: true})), `data-message-id="m1"`, `data-scroll-anchor="true"`, `data-slot="message-scroller-item"`)
	contains(t, render(t, Item()), `data-scroll-anchor="false"`)
}

func TestButtonStartsInactive(t *testing.T) {
	html := render(t, Button())
	contains(t, html, `data-slot="message-scroller-button"`, `data-active="false"`, `data-direction="end"`, `data-variant="secondary"`, `data-size="icon-sm"`, `inert`, `tabindex="-1"`, `Scroll to end`, `<svg`)
	if strings.Contains(html, `data-slot="button"`) {
		t.Fatalf("button slot must be message-scroller-button: %s", html)
	}
	contains(t, render(t, Button(ButtonProps{Direction: DirectionStart})), `Scroll to start`, `data-direction="start"`)
}
