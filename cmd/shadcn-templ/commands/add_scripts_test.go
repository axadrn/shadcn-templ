package commands

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/axadrn/shadcn-templ/v2/assets"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils"
	"github.com/axadrn/shadcn-templ/v2/internal/inliner"
	internalregistry "github.com/axadrn/shadcn-templ/v2/internal/registry"
	"github.com/axadrn/shadcn-templ/v2/internal/registryapi"
)

func TestAddJavaScriptComponentBuildsBundleAtComponentsAlias(t *testing.T) {
	t.Setenv("GO_ENV", "production")

	mux := http.NewServeMux()
	mux.Handle("GET /init", registryapi.InitHandler())
	mux.Handle("GET /r/styles/{style}/{file}", registryapi.StylesHandler())
	mux.HandleFunc("GET /r/registry.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(internalregistry.JSON())
	})
	mux.HandleFunc("GET /assets/css/{file}", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("/* test stylesheet */\n"))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	cwd := t.TempDir()
	if err := os.WriteFile(filepath.Join(cwd, "go.mod"), []byte("module example.com/acme/app\n\ngo 1.25.0\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := utils.WriteConfig(cwd, &utils.RawConfig{
		Style: "base-nova",
		Tailwind: utils.Tailwind{
			CSS:          "assets/css/globals.css",
			BaseColor:    "neutral",
			CSSVariables: true,
		},
		Aliases: utils.Aliases{
			Components: "example.com/acme/app/internal/design",
			Utils:      "example.com/acme/app/internal/shared",
		},
	}); err != nil {
		t.Fatal(err)
	}

	if err := RunInit(InitOptions{
		Cwd:      cwd,
		Force:    true,
		Silent:   true,
		Registry: server.URL,
	}); err != nil {
		t.Fatal(err)
	}
	if err := RunAdd([]string{"dialog"}, AddOptions{
		Cwd:      cwd,
		Silent:   true,
		Registry: server.URL,
	}); err != nil {
		t.Fatal(err)
	}

	assertFileContains := func(path string, wants ...string) {
		t.Helper()
		content, err := os.ReadFile(filepath.Join(cwd, filepath.FromSlash(path)))
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		for _, want := range wants {
			if !strings.Contains(string(content), want) {
				t.Errorf("%s missing %q", path, want)
			}
		}
	}

	assertFileContains(
		"internal/design/scripts_bundle.go",
		"package design",
		`const bundleSrc = "/assets/js/shadcn-templ-`,
	)
	assertFileContains("internal/design/scripts.templ", "package design")
	for _, name := range []string{"scripts.go", "embed.go"} {
		if _, err := os.Stat(filepath.Join(cwd, "internal/design", name)); !os.IsNotExist(err) {
			t.Errorf("unexpected legacy file %s", name)
		}
	}
	bundles, _ := filepath.Glob(filepath.Join(cwd, "assets/js/shadcn-templ-*.js"))
	if len(bundles) != 1 {
		t.Fatalf("bundles = %v", bundles)
	}
	assertFileContains("internal/design/scripts_bundle.go", filepath.Base(bundles[0]))
	if err := RunAdd([]string{"dialog"}, AddOptions{Cwd: cwd, Silent: true, Overwrite: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}
	assertFileContains("internal/design/scripts_bundle.go", filepath.Base(bundles[0]))
	assertFileContains("internal/design/dialog/dialog.js", "window.templ.dialog = {")
	assertFileContains("internal/shared/shadcn-templ.go", "package shared")

	t.Run("template-only add migrates existing scripts", func(t *testing.T) {
		raw, err := utils.GetRawConfig(cwd)
		if err != nil {
			t.Fatal(err)
		}
		raw.Scripts = nil
		if err := utils.WriteConfig(cwd, raw); err != nil {
			t.Fatal(err)
		}
		if err := os.Remove(bundles[0]); err != nil {
			t.Fatal(err)
		}
		if err := RunAdd([]string{"button"}, AddOptions{Cwd: cwd, Silent: true, Registry: server.URL}); err != nil {
			t.Fatal(err)
		}
		raw, err = utils.GetRawConfig(cwd)
		if err != nil {
			t.Fatal(err)
		}
		if raw.Scripts == nil || *raw.Scripts != *utils.DefaultScripts() {
			t.Fatalf("scripts config was not migrated: %+v", raw.Scripts)
		}
		data, err := os.ReadFile(bundles[0])
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), "// components/dialog/dialog.js") {
			t.Fatal("migration bundle misses previously installed dialog")
		}
		assertFileContains("internal/design/scripts_bundle.go", filepath.Base(bundles[0]))
	})

	scaffold := filepath.Join(t.TempDir(), "scaffold")
	if err := RunInit(InitOptions{Cwd: filepath.Dir(scaffold), Template: "templ", ProjectName: "scaffold", Silent: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"components/scripts.templ", "components/scripts_bundle.go", "assets/assets.go", "Dockerfile", ".dockerignore"} {
		if _, err := os.Stat(filepath.Join(scaffold, name)); err != nil {
			t.Fatal(err)
		}
	}
	for name, snippets := range map[string][]string{
		"Taskfile.yml": {"  build:\n", "go tool templ generate", "go tool shadcn-templ bundle"},
		"go.mod":       {"tool github.com/a-h/templ/cmd/templ", "tool github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ"},
	} {
		data, err := os.ReadFile(filepath.Join(scaffold, name))
		if err != nil {
			t.Fatal(err)
		}
		for _, snippet := range snippets {
			if !strings.Contains(string(data), snippet) {
				t.Errorf("scaffold %s is missing %q", name, snippet)
			}
		}
	}

	for _, name := range []string{"components/scripts.go", "components/embed.go"} {
		if _, err := os.Stat(filepath.Join(scaffold, name)); !os.IsNotExist(err) {
			t.Errorf("unexpected scaffold file %s", name)
		}
	}

}

func TestAddResolvesFontHeadingFromProjectStylesheet(t *testing.T) {
	t.Setenv("GO_ENV", "production")

	mux := http.NewServeMux()
	mux.Handle("GET /init", registryapi.InitHandler())
	mux.Handle("GET /r/styles/{style}/{file}", registryapi.StylesHandler())
	mux.HandleFunc("GET /r/registry.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(internalregistry.JSON())
	})
	mux.HandleFunc("GET /assets/css/{file}", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("/* test stylesheet */\n"))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	tests := []struct {
		name string
		css  string
		want bool
	}{
		{name: "heading variable", css: "@import \"tailwindcss\";\n:root { --font-heading: var(--font-sans); }\n", want: true},
		{name: "no heading variable", css: "@import \"tailwindcss\";\n", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cwd := t.TempDir()
			goModPath := filepath.Join(cwd, "go.mod")
			err := os.WriteFile(goModPath, []byte("module example.com/acme/app\n\ngo 1.25.0\n"), 0o644)
			if err != nil {
				t.Fatal(err)
			}
			err = RunInit(InitOptions{Cwd: cwd, Force: true, Silent: true, Registry: server.URL})
			if err != nil {
				t.Fatal(err)
			}
			cssPath := filepath.Join(cwd, "assets/css/globals.css")
			err = os.WriteFile(cssPath, []byte(tt.css), 0o644)
			if err != nil {
				t.Fatal(err)
			}
			err = RunAdd([]string{"card"}, AddOptions{Cwd: cwd, Overwrite: true, Silent: true, Registry: server.URL})
			if err != nil {
				t.Fatal(err)
			}
			content, err := os.ReadFile(filepath.Join(cwd, "components/card/card.templ"))
			if err != nil {
				t.Fatal(err)
			}
			has := strings.Contains(string(content), "font-heading")
			if has != tt.want {
				t.Errorf("font-heading presence = %t, want %t", has, tt.want)
			}
		})
	}
}

func TestSupportsFontHeading(t *testing.T) {
	tests := []struct {
		name string
		css  string
		want bool
	}{
		{name: "root declaration", css: ":root { --font-heading: var(--font-sans); }", want: true},
		{name: "theme declaration", css: "@theme inline { --font-heading: var(--font-serif); }", want: true},
		{name: "space before colon does not match upstream", css: "--font-heading : var(--font-sans);", want: false},
		{name: "missing", css: "--font-sans: Inter;", want: false},
		{name: "empty", css: "", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "globals.css")
			err := os.WriteFile(path, []byte(tt.css), 0o644)
			if err != nil {
				t.Fatal(err)
			}
			got := supportsFontHeading(path)
			if got != tt.want {
				t.Errorf("supportsFontHeading() = %t, want %t", got, tt.want)
			}
		})
	}
	if supportsFontHeading(filepath.Join(t.TempDir(), "missing.css")) {
		t.Error("supportsFontHeading() = true for missing file")
	}
}

func TestAddInstallsCompiledChartAndToastJavaScript(t *testing.T) {
	t.Setenv("GO_ENV", "production")

	mux := http.NewServeMux()
	mux.Handle("GET /init", registryapi.InitHandler())
	mux.Handle("GET /r/styles/{style}/{file}", registryapi.StylesHandler())
	mux.HandleFunc("GET /r/registry.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(internalregistry.JSON())
	})
	mux.HandleFunc("GET /assets/css/{file}", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("/* test stylesheet */\n"))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	cwd := t.TempDir()
	err := os.WriteFile(filepath.Join(cwd, "go.mod"), []byte("module example.com/acme/app\n\ngo 1.25.0\n"), 0o644)
	if err != nil {
		t.Fatal(err)
	}
	err = RunInit(InitOptions{Cwd: cwd, Force: true, Silent: true, Registry: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	err = RunAdd([]string{"chart", "toast"}, AddOptions{Cwd: cwd, Overwrite: true, Silent: true, Registry: server.URL})
	if err != nil {
		t.Fatal(err)
	}

	styleCSS, err := assets.Assets.ReadFile("css/styles/style-nova.css")
	if err != nil {
		t.Fatal(err)
	}
	styleMap, err := inliner.CreateStyleMap(string(styleCSS))
	if err != nil {
		t.Fatal(err)
	}
	marker := regexp.MustCompile(`\bcn-[\w-]+`)
	for _, path := range []string{"components/chart/chart.js", "components/toast/toast.js"} {
		content, err := os.ReadFile(filepath.Join(cwd, filepath.FromSlash(path)))
		if err != nil {
			t.Fatal(err)
		}
		if marker.Match(content) {
			t.Errorf("%s contains a canonical style marker", path)
		}
	}

	chart, err := os.ReadFile(filepath.Join(cwd, "components/chart/chart.js"))
	if err != nil {
		t.Fatal(err)
	}
	chartContent := string(chart)
	if !strings.Contains(chartContent, "min-w-32") {
		t.Error("installed chart JavaScript misses min-w-32")
	}
	for _, class := range strings.Fields(styleMap["cn-chart-tooltip"]) {
		if !strings.Contains(chartContent, class) {
			t.Errorf("installed chart JavaScript misses Nova tooltip class %q", class)
		}
	}
}
