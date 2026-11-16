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
// one shared components package. init sets up each app on its own like
// shadcn's (#640); sharing is the components.json the apps carry.
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

	// init installs into the app, never at the module root.
	if err := RunInit(InitOptions{Cwd: appA, Preset: "nova", Silent: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}
	if raw, _ := utils.GetRawConfig(appA); raw.Aliases != (utils.Aliases{Components: "example.com/mono/cmd/servicea/components", Utils: "example.com/mono/cmd/servicea/utils"}) {
		t.Fatalf("app a aliases %+v", raw.Aliases)
	}
	read(filepath.Join(appA, "utils", "shadcn-templ.go"))
	for _, dir := range []string{"components", "utils"} {
		if _, err := os.Stat(filepath.Join(root, dir)); !os.IsNotExist(err) {
			t.Fatalf("init wrote %s at the module root", dir)
		}
	}
	// The module root has no apps/ or packages/: init there is a project.
	if targets := monorepoTargets(root); targets != nil {
		t.Fatalf("targets %v", targets)
	}

	// Sharing the root packages: both apps alias them in components.json.
	if err := os.RemoveAll(filepath.Join(appA, "utils")); err != nil {
		t.Fatal(err)
	}
	rawA, _ := utils.GetRawConfig(appA)
	rawA.Aliases = utils.Aliases{Components: "example.com/mono/components", Utils: "example.com/mono/utils"}
	if err := utils.WriteConfig(appA, rawA); err != nil {
		t.Fatal(err)
	}
	if err := RunAdd([]string{"dialog"}, AddOptions{Cwd: appA, Silent: true, Registry: server.URL}); err != nil {
		t.Fatal(err)
	}
	// The second app carries the same aliases: init keeps them and gives it
	// its bundle, as components exist.
	rawB := *rawA
	if err := utils.WriteConfig(appB, &rawB); err != nil {
		t.Fatal(err)
	}
	if err := RunInit(InitOptions{Cwd: appB, Preset: "vega", Force: true, Silent: true, Registry: server.URL}); err != nil {
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

// monorepoRegistry serves the in-process registry.
func monorepoRegistry(t *testing.T) string {
	t.Helper()
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
	return server.URL
}

// TestInitMonorepoScaffold is init --monorepo: shadcn's next-monorepo
// layout in one Go module, the workspaces apps/web and packages/ui with a
// components.json each. add in the app installs ui components into
// packages/ui and blocks into the app; a second app joins the ui package.
func TestInitMonorepoScaffold(t *testing.T) {
	t.Setenv("GO_ENV", "production")
	registryURL := monorepoRegistry(t)

	parent := t.TempDir()
	if err := RunInit(InitOptions{Cwd: parent, Monorepo: true, ProjectName: "mono", Silent: true, Registry: registryURL}); err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(parent, "mono")
	app := filepath.Join(root, "apps", "web")
	ui := filepath.Join(root, "packages", "ui")
	read := func(path string) string {
		t.Helper()
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		return string(data)
	}
	absent := func(paths ...string) {
		t.Helper()
		for _, path := range paths {
			if _, err := os.Stat(path); !os.IsNotExist(err) {
				t.Errorf("unexpected %s", path)
			}
		}
	}

	for name, snippets := range map[string][]string{
		"go.mod":                               {"module mono\n", "tool github.com/a-h/templ/cmd/templ", "tool github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ"},
		"Taskfile.yml":                         {"taskfile: ./apps/web/Taskfile.yml", "dir: ./apps/web", "task: web:dev", "task: web:build"},
		"Dockerfile":                           {"RUN task web:build", "/app/apps/web/bin/app"},
		".dockerignore":                        {"**/assets/js/shadcn-templ-*.js"},
		".gitignore":                           {"**/assets/css/output.css", "**/assets/js/shadcn-templ-*.js", "bin/"},
		"packages/ui/components/scripts.templ": {"package components", "templ Scripts()"},
		"packages/ui/styles/globals.css":       {`@source "../../../apps";`, `@source "..";`, "--background"},
		"packages/ui/utils/shadcn-templ.go":    {"package utils"},
		"apps/web/Taskfile.yml":                {"tailwindcss -i ../../packages/ui/styles/globals.css -o ./assets/css/output.css --minify", "go tool templ generate -path ../..", "--proxyport={{.PROXY_PORT}}", `--cmd="cd '{{.TASKFILE_DIR}}' && go run ."`, "templ PORT={{.PORT}} PROXY_PORT={{.PROXY_PORT}}", "go tool shadcn-templ bundle", "go build -o bin/app ."},
		"apps/web/main.go":                     {`"mono/apps/web/assets"`, `"mono/apps/web/pages"`},
		"apps/web/layouts/base.templ":          {`import "mono/packages/ui/components"`, "@components.Scripts()"},
		"apps/web/pages/home.templ":            {`"mono/apps/web/layouts"`, `"mono/packages/ui/components/componentexample"`},
		"apps/web/assets/assets.go":            {"var Assets embed.FS"},
	} {
		content := read(filepath.Join(root, filepath.FromSlash(name)))
		for _, snippet := range snippets {
			if !strings.Contains(content, snippet) {
				t.Errorf("%s is missing %q", name, snippet)
			}
		}
	}
	// One module, the theme once in packages/ui, nothing at the root.
	absent(filepath.Join(app, "go.mod"), filepath.Join(app, "assets", "css", "globals.css"), filepath.Join(app, "utils"),
		filepath.Join(root, "components"), filepath.Join(root, "utils"))
	if matches, _ := filepath.Glob(filepath.Join(ui, "components", "componentexample", "*.templ")); len(matches) == 0 {
		t.Error("component-example not installed into packages/ui")
	}

	// Both components.json, shadcn's next-monorepo pair.
	uiConfig, err := utils.GetConfig(ui)
	if err != nil || uiConfig == nil {
		t.Fatalf("packages/ui components.json: %v", err)
	}
	if uiConfig.Aliases != (utils.Aliases{Components: "mono/packages/ui/components", Utils: "mono/packages/ui/utils", UI: "mono/packages/ui/components"}) ||
		uiConfig.Scripts != nil || uiConfig.Tailwind.CSS != "styles/globals.css" || uiConfig.Style != "base-nova" || uiConfig.IconLibrary != "lucide" {
		t.Errorf("packages/ui config %+v", uiConfig.RawConfig)
	}
	config, err := utils.GetConfig(app)
	if err != nil || config == nil {
		t.Fatalf("apps/web components.json: %v", err)
	}
	if config.Aliases != (utils.Aliases{Components: "mono/apps/web/components", Utils: "mono/packages/ui/utils", UI: "mono/packages/ui/components"}) ||
		config.Tailwind.CSS != "../../packages/ui/styles/globals.css" || config.Style != uiConfig.Style || config.IconLibrary != uiConfig.IconLibrary || config.Tailwind.BaseColor != uiConfig.Tailwind.BaseColor {
		t.Errorf("apps/web config %+v", config.RawConfig)
	}
	if config.ResolvedPaths.Scripts != filepath.Join(app, "assets", "js") || config.ResolvedPaths.TailwindCSS != filepath.Join(ui, "styles", "globals.css") {
		t.Errorf("apps/web resolved %+v", config.ResolvedPaths)
	}

	// add sidebar-07 in the app: ui components into packages/ui, the block
	// into the app with imports into packages/ui and its own packages.
	if err := RunAdd([]string{"button", "dialog", "sidebar-07"}, AddOptions{Cwd: app, Silent: true, Registry: registryURL}); err != nil {
		t.Fatal(err)
	}
	read(filepath.Join(ui, "components", "dialog", "dialog.templ"))
	read(filepath.Join(ui, "components", "sidebar", "sidebar.templ"))
	page := read(filepath.Join(app, "components", "blocks", "sidebar07", "page.templ"))
	if !strings.Contains(page, `"mono/packages/ui/components/sidebar"`) || strings.Contains(page, "github.com/axadrn") {
		t.Errorf("sidebar07 page imports:\n%s", page)
	}
	absent(filepath.Join(app, "components", "sidebar"), filepath.Join(ui, "components", "blocks"), filepath.Join(root, "components"))

	// The bundle is built from packages/ui's scripts, its manifest sits in
	// the ui components package, the asset in the app's scripts.dir.
	bundle := func(dir string) string {
		t.Helper()
		matches, _ := filepath.Glob(filepath.Join(dir, "assets", "js", "shadcn-templ-*.js"))
		if len(matches) != 1 {
			t.Fatalf("%s bundles %v", dir, matches)
		}
		return filepath.Base(matches[0])
	}
	webBundle := bundle(app)
	if !strings.Contains(read(filepath.Join(app, "assets", "js", webBundle)), "window.templ.dialog={") {
		t.Error("bundle lacks the packages/ui dialog script")
	}
	manifest := read(filepath.Join(ui, "components", "scripts_bundle.go"))
	if !strings.Contains(manifest, "package components") || !strings.Contains(manifest, `"/assets/js/`+webBundle+`"`) {
		t.Fatalf("manifest %s", manifest)
	}
	absent(filepath.Join(app, "components", "scripts_bundle.go"), filepath.Join(ui, "assets"))

	// At the module root init lists the workspaces instead (#640).
	if err := RunInit(InitOptions{Cwd: root, Silent: true, Registry: registryURL}); err == nil ||
		!strings.Contains(err.Error(), "shadcn-templ init --cwd apps/web") || !strings.Contains(err.Error(), "shadcn-templ init --cwd packages/ui") {
		t.Fatalf("init at the monorepo root: %v", err)
	}
	absent(filepath.Join(root, utils.ConfigFileName))

	// A new app without a config is set up on its own, it joins nothing.
	solo := filepath.Join(root, "apps", "solo")
	if err := os.MkdirAll(solo, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := RunInit(InitOptions{Cwd: solo, Silent: true, Registry: registryURL}); err != nil {
		t.Fatal(err)
	}
	if raw, _ := utils.GetRawConfig(solo); raw.Aliases != (utils.Aliases{Components: "mono/apps/solo/components", Utils: "mono/apps/solo/utils"}) || raw.Tailwind.CSS != "assets/css/globals.css" {
		t.Errorf("apps/solo config %+v", raw)
	}
	read(filepath.Join(solo, "utils", "shadcn-templ.go"))
	if err := os.RemoveAll(solo); err != nil {
		t.Fatal(err)
	}

	// A second app is a copy of apps/web with its own components alias:
	// ui components, utils and CSS from packages/ui. init in it keeps the
	// aliases; its design settings propagate to the ui workspace, its style
	// does not.
	admin := filepath.Join(root, "apps", "admin")
	if err := os.MkdirAll(admin, 0o755); err != nil {
		t.Fatal(err)
	}
	webConfig, _ := utils.GetRawConfig(app)
	webConfig.Aliases.Components = "mono/apps/admin/components"
	if err := utils.WriteConfig(admin, webConfig); err != nil {
		t.Fatal(err)
	}
	if err := RunBundle(BundleOptions{Cwd: admin, Silent: true}); err != nil {
		t.Fatal(err)
	}
	if err := RunInit(InitOptions{Cwd: admin, Preset: "maia", Force: true, Silent: true, Registry: registryURL}); err != nil {
		t.Fatal(err)
	}
	adminRaw, err := utils.GetRawConfig(admin)
	if err != nil || adminRaw == nil {
		t.Fatalf("apps/admin components.json: %v", err)
	}
	if adminRaw.Aliases != (utils.Aliases{Components: "mono/apps/admin/components", Utils: "mono/packages/ui/utils", UI: "mono/packages/ui/components"}) ||
		adminRaw.Tailwind.CSS != "../../packages/ui/styles/globals.css" || adminRaw.Scripts == nil {
		t.Errorf("apps/admin config %+v", adminRaw)
	}
	uiRaw, _ := utils.GetRawConfig(ui)
	if uiRaw.IconLibrary != "hugeicons" || uiRaw.Style != "base-nova" {
		t.Errorf("packages/ui after admin init: iconLibrary %q style %q", uiRaw.IconLibrary, uiRaw.Style)
	}
	webRaw, _ := utils.GetRawConfig(app)
	if webRaw.IconLibrary != "lucide" {
		t.Errorf("apps/web is not a workspace of apps/admin, its config changed: %+v", webRaw)
	}
	absent(filepath.Join(admin, "assets", "css", "globals.css"), filepath.Join(admin, "utils"))
	if got := bundle(admin); got != webBundle {
		t.Errorf("admin joined with bundle %s, want %s", got, webBundle)
	}
	if err := RunAdd([]string{"popover"}, AddOptions{Cwd: admin, Silent: true, Registry: registryURL}); err != nil {
		t.Fatal(err)
	}
	read(filepath.Join(ui, "components", "popover", "popover.templ"))
	absent(filepath.Join(admin, "components", "popover"))
	// Both apps share packages/ui, so both get the new bundle.
	if a, w := bundle(admin), bundle(app); a != w || a == webBundle || !strings.Contains(read(filepath.Join(ui, "components", "scripts_bundle.go")), a) {
		t.Errorf("after add popover: admin %s, web %s, before %s", a, w, webBundle)
	}
	// bundle from the ui workspace itself bundles for its apps.
	if err := RunBundle(BundleOptions{Cwd: ui, Silent: true}); err != nil {
		t.Fatal(err)
	}
	absent(filepath.Join(ui, "assets"))
	if raw, _ := utils.GetRawConfig(ui); raw.Scripts != nil {
		t.Error("bundle wrote a scripts block into the ui workspace")
	}

	// apply in an app syncs its linked workspaces, the ui package.
	if err := RunApply([]string{"vega"}, ApplyOptions{Cwd: app, Yes: true, Silent: true, Registry: registryURL}); err != nil {
		t.Fatal(err)
	}
	if uiRaw, _ := utils.GetRawConfig(ui); uiRaw.Style != "base-vega" || uiRaw.IconLibrary != "lucide" {
		t.Errorf("packages/ui after apply: style %q iconLibrary %q", uiRaw.Style, uiRaw.IconLibrary)
	}

	// The scaffold is a module now: --monorepo inside it is refused.
	if err := RunInit(InitOptions{Cwd: app, Monorepo: true, Silent: true, Registry: registryURL}); err == nil {
		t.Fatal("scaffolding inside a module must be refused")
	}
}
