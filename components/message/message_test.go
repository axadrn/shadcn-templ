package message

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/a-h/templ"
)

func render(t *testing.T, c templ.Component) string {
	t.Helper()
	var b bytes.Buffer
	if err := c.Render(context.Background(), &b); err != nil {
		t.Fatal(err)
	}
	return b.String()
}

func TestMessageSlots(t *testing.T) {
	for _, tc := range []struct {
		c    templ.Component
		slot string
	}{
		{Group(), "message-group"},
		{Avatar(), "message-avatar"},
		{Content(), "message-content"},
		{Header(), "message-header"},
		{Footer(), "message-footer"},
	} {
		if html := render(t, tc.c); !strings.Contains(html, `data-slot="`+tc.slot+`"`) {
			t.Fatalf("missing slot %s: %s", tc.slot, html)
		}
	}
}

func TestMessageAlign(t *testing.T) {
	if html := render(t, Message()); !strings.Contains(html, `data-align="start"`) {
		t.Fatalf("default align: %s", html)
	}
	if html := render(t, Message(Props{Align: AlignEnd})); !strings.Contains(html, `data-align="end"`) {
		t.Fatalf("end align: %s", html)
	}
}
