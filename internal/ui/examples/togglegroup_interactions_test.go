package examples

import (
	"os"
	"strings"
	"testing"
)

func TestFontWeightToggleGroupsConsumeProposedGroupValue(t *testing.T) {
	for _, path := range []string{"togglegroup_custom.templ", "togglegroup_example.templ"} {
		source, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		text := string(source)
		if !strings.Contains(text, `addEventListener("toggle-group-value-change"`) {
			t.Fatalf("%s must listen for group value changes", path)
		}
		if !strings.Contains(text, `const value = e.detail.value[0]`) {
			t.Fatalf("%s must consume the proposed group value from the event", path)
		}
	}
}
