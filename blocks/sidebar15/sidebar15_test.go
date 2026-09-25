package sidebar15

import (
	"bytes"
	"context"
	"regexp"
	"strings"
	"testing"
)

func TestDatePickerMatchesUpstreamCalendarConfiguration(t *testing.T) {
	var output bytes.Buffer
	if err := DatePicker().Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	for _, want := range []string{
		`data-templ-mode="single"`,
		`bg-transparent [--cell-size:2.1rem]`,
		`aria-label="Choose the month"`,
		`aria-label="Choose the year"`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered date picker is missing %q: %s", want, html)
		}
	}
	if !regexp.MustCompile(`data-templ-selected="[0-9]{4}-[0-9]{2}-12"`).MatchString(html) {
		t.Fatalf("date picker must select day 12: %s", html)
	}
}
