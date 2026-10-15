// Guard for the rule in AGENTS.md: component JavaScript never selects by a
// cn- class. The inliner expands cn- classes in every string literal of a
// shipped .js file, selectors included, so ".cn-input-otp-caret" reaches the
// user as "." and querySelector throws.
package inliner

import (
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/axadrn/shadcn-templ/v2/internal/registry"
)

var cnSelector = regexp.MustCompile(`\.cn-[a-z]|\[class[*^$~|]?=["']?[^\]]*cn-`)

func TestRegistryJavaScriptNeverSelectsByCnClass(t *testing.T) {
	seen := map[string]bool{}
	for _, item := range registry.Get().Items {
		for _, path := range item.FilePaths() {
			if !strings.HasSuffix(path, ".js") || seen[path] {
				continue
			}
			seen[path] = true

			source, err := os.ReadFile("../../" + path)
			if err != nil {
				t.Fatalf("read %s: %v", path, err)
			}
			f, err := parseJavaScriptSourceFile(string(source))
			if err != nil {
				t.Fatalf("parse %s: %v", path, err)
			}
			for _, s := range f.segments {
				if s.kind == segmentStringLiteral && cnSelector.MatchString(s.text) {
					t.Errorf("%s: %q selects by a cn- class; the inliner flattens it, select by data-slot or structure instead", path, s.text)
				}
			}
		}
	}
	if len(seen) == 0 {
		t.Fatal("no .js files found in registry.json")
	}
}
