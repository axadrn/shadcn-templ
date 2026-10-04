// Command generate-style-classes writes assets/css/style-classes.txt: every
// Tailwind utility of the 8 vendored style maps, one per line, sorted. The
// docs previews render the compiled utility build (the inliner's HTML pass),
// and Tailwind's scanner skips .css files, so without this candidates file
// the utilities living only in the style sheets' @apply lines would never be
// generated into output.css. globals.css @source's the file.
//
// The RTL examples render the components compiled with the RTL transform
// (inliner.Options.RTL), whose logical utilities (ms-, ps-, start-, rtl:
// variants) appear in no source file: the file lists the RTL form of every
// style map utility and of every class in the components' templ sources.
//
// Usage, from the repo root:
//
//	go run ./cmd/generate-style-classes
package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/axadrn/shadcn-templ/v2/internal/inliner"
)

var styleNames = []string{"vega", "nova", "lyra", "maia", "mira", "luma", "sera", "rhea"}

func main() {
	classes := map[string]bool{}
	for _, name := range styleNames {
		css, err := os.ReadFile(filepath.Join("assets", "css", "styles", "style-"+name+".css"))
		if err != nil {
			fatal("read style css: %v", err)
		}
		styleMap, err := inliner.CreateStyleMap(string(css))
		if err != nil {
			fatal("parse style css: %v", err)
		}
		for _, utilities := range styleMap {
			for _, class := range strings.Fields(utilities) {
				classes[class] = true
			}
		}
	}

	// The RTL forms, of the style maps and of the components' own classes.
	sources := []string{}
	for class := range classes {
		sources = append(sources, class)
	}
	quoted := regexp.MustCompile(`"([^"\n]*)"`)
	err := filepath.WalkDir("components", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".templ") {
			return err
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, m := range quoted.FindAllStringSubmatch(string(src), -1) {
			sources = append(sources, strings.Fields(m[1])...)
		}
		return nil
	})
	if err != nil {
		fatal("scan components: %v", err)
	}
	for _, class := range sources {
		for _, rtl := range strings.Fields(inliner.ApplyRtlMapping(class)) {
			if rtl != class {
				classes[rtl] = true
			}
		}
	}

	sorted := make([]string, 0, len(classes))
	for class := range classes {
		sorted = append(sorted, class)
	}
	sort.Strings(sorted)

	out := filepath.Join("assets", "css", "style-classes.txt")
	if err := os.WriteFile(out, []byte(strings.Join(sorted, "\n")+"\n"), 0o644); err != nil {
		fatal("write %s: %v", out, err)
	}
	fmt.Printf("wrote %s (%d classes)\n", out, len(sorted))
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "generate-style-classes: "+format+"\n", args...)
	os.Exit(1)
}
