package slider

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestControlledValueOverridesDefaultValue(t *testing.T) {
	value := []float64{}
	var output bytes.Buffer
	if err := Slider(Props{Value: value, DefaultValue: []float64{50}}).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if !strings.Contains(html, `data-templ-value`) {
		t.Fatalf("rendered slider is missing controlled marker: %s", html)
	}
	if strings.Contains(html, `aria-valuenow="50"`) {
		t.Fatalf("controlled empty value must override the default: %s", html)
	}
}

func TestClientRequestsCancelableValueChanges(t *testing.T) {
	source, err := os.ReadFile("slider.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{`new CustomEvent("slider-change"`, `cancelable: true`, `data-templ-value`} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
