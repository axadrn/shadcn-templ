package attachment

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

func TestAttachmentDefaults(t *testing.T) {
	html := render(t, Attachment())
	for _, want := range []string{`data-slot="attachment"`, `data-state="done"`, `data-size="default"`, `data-orientation="horizontal"`, "cn-attachment-orientation-horizontal"} {
		if !strings.Contains(html, want) {
			t.Fatalf("attachment is missing %q: %s", want, html)
		}
	}
	html = render(t, Attachment(Props{State: StateError, Size: SizeXs, Orientation: OrientationVertical}))
	for _, want := range []string{`data-state="error"`, `data-size="xs"`, `data-orientation="vertical"`, "cn-attachment-size-xs"} {
		if !strings.Contains(html, want) {
			t.Fatalf("attachment is missing %q: %s", want, html)
		}
	}
}

func TestAttachmentParts(t *testing.T) {
	for _, tc := range []struct {
		c    templ.Component
		slot string
	}{
		{Group(), "attachment-group"},
		{Media(), "attachment-media"},
		{Content(), "attachment-content"},
		{Title(), "attachment-title"},
		{Description(), "attachment-description"},
		{Actions(), "attachment-actions"},
		{Action(), "attachment-action"},
		{Trigger(), "attachment-trigger"},
	} {
		if html := render(t, tc.c); !strings.Contains(html, `data-slot="`+tc.slot+`"`) {
			t.Fatalf("missing slot %s: %s", tc.slot, html)
		}
	}
	if html := render(t, Media()); !strings.Contains(html, `data-variant="icon"`) {
		t.Fatalf("media default variant: %s", html)
	}
	html := render(t, Action())
	for _, want := range []string{`<button`, `type="button"`, "cn-button-variant-ghost", "cn-button-size-icon-xs", "cn-attachment-action"} {
		if !strings.Contains(html, want) {
			t.Fatalf("action is missing %q: %s", want, html)
		}
	}
	if strings.Contains(html, `data-slot="button"`) {
		t.Fatalf("action keeps the button slot: %s", html)
	}
}

func TestAttachmentTrigger(t *testing.T) {
	if html := render(t, Trigger()); !strings.Contains(html, `type="button"`) {
		t.Fatalf("trigger type: %s", html)
	}
	if html := render(t, Trigger(TriggerProps{Href: "/f.png"})); !strings.HasPrefix(html, `<a`) || strings.Contains(html, `type=`) {
		t.Fatalf("link trigger: %s", html)
	}
	html := render(t, Trigger(TriggerProps{Attributes: templ.Attributes{"data-slot": "dialog-trigger"}}))
	if strings.Count(html, "data-slot=") != 1 || !strings.Contains(html, `data-slot="dialog-trigger"`) {
		t.Fatalf("merged trigger slot: %s", html)
	}
}
