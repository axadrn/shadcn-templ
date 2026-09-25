package radiogroup

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestControlledValueOverridesDefaultValue(t *testing.T) {
	value := ""
	var output bytes.Buffer
	if err := RadioGroup(Props{Value: &value, DefaultValue: "monthly"}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	for _, want := range []string{`data-templ-value=""`} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered radio group is missing %q: %s", want, html)
		}
	}
}

func TestClientRequestsCancelableValueChanges(t *testing.T) {
	source, err := os.ReadFile("radiogroup.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{`"radio-group-value-change"`, `cancelable: true`, `data-templ-value`} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
