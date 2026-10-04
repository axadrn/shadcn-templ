package registryapi

import (
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/axadrn/shadcn-templ/v2/internal/inliner"
	"github.com/axadrn/shadcn-templ/v2/internal/registry"
)

func TestEveryRegistryItemCompilesWithoutMarkersForEveryStyleAndOption(t *testing.T) {
	t.Setenv("GO_ENV", "production")
	reg := registry.Get()
	if len(reg.Items) != 90 {
		t.Fatalf("registry item count = %d, want 90", len(reg.Items))
	}
	if len(StyleNames()) != 8 {
		t.Fatalf("style count = %d, want 8", len(StyleNames()))
	}

	typeCounts := map[string]int{}
	for _, item := range reg.Items {
		typeCounts[item.Type]++
	}
	wantTypeCounts := map[string]int{
		"registry:ui":      59,
		"registry:block":   27,
		"registry:example": 2,
		"registry:lib":     2,
	}
	if !reflect.DeepEqual(typeCounts, wantTypeCounts) {
		t.Fatalf("registry type counts = %v, want %v", typeCounts, wantTypeCounts)
	}

	options := []struct {
		name string
		opts inliner.Options
	}{
		{name: "default", opts: inliner.Options{}},
		{name: "rtl and heading font", opts: inliner.Options{RTL: true, FontHeading: true}},
	}
	for _, menuColor := range MenuColors {
		options = append(options, struct {
			name string
			opts inliner.Options
		}{name: "menu " + menuColor, opts: inliner.Options{MenuColor: menuColor}})
	}

	marker := regexp.MustCompile(`\bcn-[\w-]+`)
	builds := 0
	for _, styleName := range StyleNames() {
		for _, definition := range reg.Items {
			for _, option := range options {
				name := styleName + "/" + definition.Name + "/" + option.name
				t.Run(name, func(t *testing.T) {
					item, err := BuildStyleItem(styleName, definition.Name, option.opts)
					if err != nil {
						t.Fatal(err)
					}
					if item == nil {
						t.Fatal("BuildStyleItem returned nil")
					}
					if len(item.Files) != len(definition.Files) {
						t.Fatalf("file count = %d, want %d", len(item.Files), len(definition.Files))
					}
					for i, file := range item.Files {
						declared := definition.Files[i]
						if file.Path != declared.Path || file.Type != declared.Type || file.Target != declared.Target {
							t.Errorf("file %d identity = {%q %q %q}, want {%q %q %q}", i, file.Path, file.Type, file.Target, declared.Path, declared.Type, declared.Target)
						}
						if !strings.HasSuffix(file.Path, ".templ") && !strings.HasSuffix(file.Path, ".js") {
							continue
						}
						if marker.MatchString(file.Content) {
							t.Errorf("%s contains a canonical style marker", file.Path)
						}
						if strings.HasSuffix(file.Path, ".js") {
							got, err := inliner.TransformJavaScriptStyle(file.Content, inliner.StyleMap{}, inliner.Options{})
							if err != nil {
								t.Errorf("re-lex %s: %v", file.Path, err)
							} else if got != file.Content {
								t.Errorf("re-transform changed compiled JavaScript %s", file.Path)
							}
						}
					}

					wantDependencies := append([]string(nil), definition.RegistryDependencies...)
					if definitionHasJavaScript(definition) && !slices.Contains(wantDependencies, "scripts") {
						wantDependencies = append(wantDependencies, "scripts")
					}
					if !slices.Equal(item.RegistryDependencies, wantDependencies) {
						t.Errorf("registry dependencies = %v, want %v", item.RegistryDependencies, wantDependencies)
					}
				})
				builds++
			}
		}
	}
	if builds != 4320 {
		t.Errorf("compiled build cases = %d, want 4320", builds)
	}
}

func definitionHasJavaScript(item registry.Item) bool {
	for _, file := range item.Files {
		if strings.HasSuffix(file.Path, ".js") {
			return true
		}
	}
	return false
}
