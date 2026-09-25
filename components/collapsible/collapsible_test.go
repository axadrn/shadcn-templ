package collapsible

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestControlledOpenOverridesDefaultOpen(t *testing.T) {
	open := false
	var output bytes.Buffer
	if err := Collapsible(Props{Open: &open, DefaultOpen: true}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	for _, want := range []string{`data-closed`, `data-templ-open`} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered collapsible is missing %q: %s", want, html)
		}
	}
}

func TestClientRequestsCancelableOpenChanges(t *testing.T) {
	source, err := os.ReadFile("collapsible.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{`new CustomEvent("collapsible-open-change"`, `cancelable: true`, `data-templ-open`} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
