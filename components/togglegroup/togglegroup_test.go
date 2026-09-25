package togglegroup

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestControlledValueOverridesDefaultValue(t *testing.T) {
	value := []string{}
	var output bytes.Buffer
	if err := ToggleGroup(Props{Value: value, DefaultValue: []string{"bold"}}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if !strings.Contains(html, `data-templ-value="[]"`) {
		t.Fatalf("controlled empty value must be rendered and override the default: %s", html)
	}
}

func TestClientRequestsCancelableGroupValueChanges(t *testing.T) {
	source, err := os.ReadFile("../toggle/toggle.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{
		`new CustomEvent("toggle-group-value-change"`,
		`cancelable: true`,
		`detail: { value: groupValue }`,
		`group.hasAttribute("data-templ-value")`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
