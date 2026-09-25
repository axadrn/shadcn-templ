package checkbox

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestControlledCheckedOverridesDefaultChecked(t *testing.T) {
	checked := false
	var output bytes.Buffer
	if err := Checkbox(Props{Checked: &checked, DefaultChecked: true}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}

	html := output.String()
	for _, want := range []string{`aria-checked="false"`, `data-unchecked`, `data-templ-checked`} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered checkbox is missing %q: %s", want, html)
		}
	}
	if strings.Contains(html, ` checked`) {
		t.Fatalf("controlled false checkbox rendered checked: %s", html)
	}
}

func TestClientRequestsCancelableCheckedChanges(t *testing.T) {
	source, err := os.ReadFile("checkbox.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{`new CustomEvent("checkbox-change"`, `cancelable: true`, `data-templ-checked`} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
