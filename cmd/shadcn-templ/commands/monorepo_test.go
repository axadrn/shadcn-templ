package commands

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils"
	internalregistry "github.com/axadrn/shadcn-templ/v2/internal/registry"
	"github.com/axadrn/shadcn-templ/v2/internal/registryapi"
)

// TestMonorepoAppsShareComponents is issue #623: one go.mod at the root,
// two apps under cmd/ with their own components.json, CSS and scripts dir,
// one shared components package.
func TestMonorepoAppsShareComponents(t *testing.T) {
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

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module example.com/mono\n\ngo 1.25.0\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	appA := filepath.Join(root, "cmd", "servicea")
	appB := filepath.Join(root, "cmd", "serviceb")
	for _, dir := range []string{appA, appB} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	read := func(path string) string {
		t.Helper()
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		return string(data)
	}

	// A template scaffold inside the module is still refused, also from an
	// app directory below go.mod.
	if err := RunInit(InitOptions{Cwd: appA, Template: "templ", Silent: true, Registry: server.URL}); err == nil {
		t.Fatal("scaffolding inside a module must be refused")
	}

	if err := RunInit(InitOptions{Cwd: appA, Preset: "nova", Silent: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}
	if err := RunAdd([]string{"dialog"}, AddOptions{Cwd: appA, Silent: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}
	// The second app joins after components exist: init gives it its bundle.
	if err := RunInit(InitOptions{Cwd: appB, Preset: "vega", Silent: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}

	for _, app := range []string{appA, appB} {
		raw, err := utils.GetRawConfig(app)
		if err != nil || raw == nil {
			t.Fatalf("%s: components.json %v", app, err)
		}
		if raw.Aliases.Components != "example.com/mono/components" || raw.Aliases.Utils != "example.com/mono/utils" {
			t.Errorf("%s aliases %+v", app, raw.Aliases)
		}
		if !strings.Contains(read(filepath.Join(app, "assets", "css", "globals.css")), "--background") {
			t.Errorf("%s: theme not merged into the app's own CSS", app)
		}
	}
	if raw, _ := utils.GetRawConfig(appB); raw.Style != "base-vega" {
		t.Errorf("app b style %q, want its own preset", raw.Style)
	}
	// Shared packages live once at the module root, nothing under the apps.
	read(filepath.Join(root, "components", "dialog", "dialog.templ"))
	read(filepath.Join(root, "utils", "shadcn-templ.go"))
	for _, app := range []string{appA, appB} {
		for _, dir := range []string{"components", "utils"} {
			if _, err := os.Stat(filepath.Join(app, dir)); !os.IsNotExist(err) {
				t.Errorf("unexpected %s in %s", dir, app)
			}
		}
	}

	bundles := func() (a, b []string) {
		a, _ = filepath.Glob(filepath.Join(appA, "assets", "js", "shadcn-templ-*.js"))
		b, _ = filepath.Glob(filepath.Join(appB, "assets", "js", "shadcn-templ-*.js"))
		return a, b
	}
	a, b := bundles()
	if len(a) != 1 || len(b) != 1 || filepath.Base(a[0]) != filepath.Base(b[0]) {
		t.Fatalf("bundles a=%v b=%v", a, b)
	}
	manifest := read(filepath.Join(root, "components", "scripts_bundle.go"))
	if !strings.Contains(manifest, `"/assets/js/`+filepath.Base(a[0])+`"`) {
		t.Fatalf("manifest %s", manifest)
	}

	// add in app b changes the shared scripts: both apps get the new bundle.
	if err := RunAdd([]string{"popover"}, AddOptions{Cwd: appB, Silent: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}
	a2, b2 := bundles()
	if len(a2) != 1 || len(b2) != 1 || filepath.Base(a2[0]) != filepath.Base(b2[0]) || a2[0] == a[0] {
		t.Fatalf("after add: a=%v b=%v (before %v)", a2, b2, a)
	}
	if !strings.Contains(read(filepath.Join(root, "components", "scripts_bundle.go")), filepath.Base(a2[0])) {
		t.Fatal("manifest not updated")
	}
	if err := RunBundle(BundleOptions{Cwd: appA, Silent: true}); err != nil {
		t.Fatal(err)
	}
}

// TestInitMonorepoScaffold is init --monorepo: one module, the shared
// components at its root, the app in apps/web with its own components.json,
// CSS and bundle.
func TestInitMonorepoScaffold(t *testing.T) {
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

	parent := t.TempDir()
	if err := RunInit(InitOptions{Cwd: parent, Monorepo: true, ProjectName: "mono", Silent: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(parent, "mono")
	app := filepath.Join(root, "apps", "web")
	read := func(path string) string {
		t.Helper()
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		return string(data)
	}

	for name, snippets := range map[string][]string{
		"go.mod":                          {"module mono\n", "tool github.com/a-h/templ/cmd/templ", "tool github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ"},
		"Taskfile.yml":                    {"taskfile: ./apps/web/Taskfile.yml", "dir: ./apps/web", "task: web:dev", "task: web:build"},
		"Dockerfile":                      {"RUN task web:build", "/app/apps/web/bin/app"},
		".dockerignore":                   {"**/assets/js/shadcn-templ-*.js"},
		".gitignore":                      {"**/assets/css/output.css", "**/assets/js/shadcn-templ-*.js", "bin/"},
		"components/scripts.templ":        {"templ Scripts()"},
		"apps/web/Taskfile.yml":           {"go tool templ generate -path ../..", "go tool shadcn-templ bundle", "go build -o bin/app ."},
		"apps/web/main.go":                {`"mono/apps/web/assets"`, `"mono/apps/web/pages"`},
		"apps/web/layouts/base.templ":     {`import "mono/components"`, "@components.Scripts()"},
		"apps/web/pages/home.templ":       {`"mono/apps/web/layouts"`, `"mono/components/componentexample"`},
		"apps/web/assets/assets.go":       {"var Assets embed.FS"},
		"apps/web/assets/css/globals.css": {`@source "../../../../components";`, "--background"},
	} {
		content := read(filepath.Join(root, filepath.FromSlash(name)))
		for _, snippet := range snippets {
			if !strings.Contains(content, snippet) {
				t.Errorf("%s is missing %q", name, snippet)
			}
		}
	}
	// One module: no go.mod and no shared packages inside the app.
	for _, name := range []string{"go.mod", "components", "utils"} {
		if _, err := os.Stat(filepath.Join(app, name)); !os.IsNotExist(err) {
			t.Errorf("unexpected apps/web/%s", name)
		}
	}

	// The app's components.json resolves the aliases to the shared root
	// packages, its file paths to the app.
	config, err := utils.GetConfig(app)
	if err != nil || config == nil {
		t.Fatalf("apps/web components.json: %v", err)
	}
	if config.Aliases.Components != "mono/components" || config.Aliases.Utils != "mono/utils" {
		t.Errorf("aliases %+v", config.Aliases)
	}
	for _, path := range []struct{ got, want string }{
		{config.ResolvedPaths.ModuleRoot, root},
		{config.ResolvedPaths.Components, filepath.Join(root, "components")},
		{config.ResolvedPaths.Utils, filepath.Join(root, "utils")},
		{config.ResolvedPaths.TailwindCSS, filepath.Join(app, "assets", "css", "globals.css")},
		{config.ResolvedPaths.Scripts, filepath.Join(app, "assets", "js")},
	} {
		if path.got != path.want {
			t.Errorf("resolved %s, want %s", path.got, path.want)
		}
	}
	read(filepath.Join(root, "utils", "shadcn-templ.go"))
	if matches, _ := filepath.Glob(filepath.Join(root, "components", "componentexample", "*.templ")); len(matches) == 0 {
		t.Error("component-example not installed into the shared components")
	}

	// add in the app installs into the shared package and bundles into the app.
	if err := RunAdd([]string{"dialog"}, AddOptions{Cwd: app, Silent: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}
	read(filepath.Join(root, "components", "dialog", "dialog.templ"))
	bundles, _ := filepath.Glob(filepath.Join(app, "assets", "js", "shadcn-templ-*.js"))
	if len(bundles) != 1 {
		t.Fatalf("bundles %v", bundles)
	}
	if manifest := read(filepath.Join(root, "components", "scripts_bundle.go")); !strings.Contains(manifest, `"/assets/js/`+filepath.Base(bundles[0])+`"`) {
		t.Fatalf("manifest %s", manifest)
	}

	// The scaffold is a module now: --monorepo inside it is refused.
	if err := RunInit(InitOptions{Cwd: app, Monorepo: true, Silent: true, Registry: server.URL}); err == nil {
		t.Fatal("scaffolding inside a module must be refused")
	}
}
