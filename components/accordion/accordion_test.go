package accordion

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestRootOwnsInitialAndControlledValues(t *testing.T) {
	controlled := []string{}
	var output bytes.Buffer
	if err := Accordion(Props{Value: controlled, DefaultValue: []string{"item-1"}}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	for _, want := range []string{`data-slot="accordion"`, `data-templ-value="[]"`} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered accordion is missing %q: %s", want, html)
		}
	}
}

func TestClientRequestsCancelableValueChanges(t *testing.T) {
	source, err := os.ReadFile("accordion.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{`new CustomEvent("accordion-value-change"`, `cancelable: true`, `data-templ-value`} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
