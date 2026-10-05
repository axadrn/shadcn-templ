package utils

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func testRawConfig(module string) *RawConfig {
	return &RawConfig{
		Style:    "base-nova",
		Tailwind: Tailwind{CSS: "assets/css/globals.css", BaseColor: "neutral", CSSVariables: true},
		Aliases:  Aliases{Components: module + "/components", Utils: module + "/utils"},
	}
}

func TestResolveConfigPathsSingleApp(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "go.mod"), "module example.com/app\n")
	config, err := ResolveConfigPaths(root, testRawConfig("example.com/app"))
	if err != nil {
		t.Fatal(err)
	}
	want := ResolvedPaths{
		Scripts:     filepath.Join(root, "assets", "js"),
		Cwd:         root,
		ModuleRoot:  root,
		TailwindCSS: filepath.Join(root, "assets", "css", "globals.css"),
		Components:  filepath.Join(root, "components"),
		UI:          filepath.Join(root, "components"),
		Utils:       filepath.Join(root, "utils"),
	}
	if config.ResolvedPaths != want {
		t.Fatalf("resolved %+v, want %+v", config.ResolvedPaths, want)
	}
	if config.Module != "example.com/app" {
		t.Fatalf("module %q", config.Module)
	}
}

func TestResolveConfigPathsAppInSubdirectory(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "go.mod"), "module example.com/mono\n\ngo 1.25.0\n")
	app := filepath.Join(root, "cmd", "servicea")
	if err := os.MkdirAll(app, 0o755); err != nil {
		t.Fatal(err)
	}
	raw := testRawConfig("example.com/mono")
	raw.Scripts = &Scripts{Dir: "assets/js", Path: "/static/js"}
	config, err := ResolveConfigPaths(app, raw)
	if err != nil {
		t.Fatal(err)
	}
	want := ResolvedPaths{
		Scripts:     filepath.Join(app, "assets", "js"),
		Cwd:         app,
		ModuleRoot:  root,
		TailwindCSS: filepath.Join(app, "assets", "css", "globals.css"),
		Components:  filepath.Join(root, "components"),
		UI:          filepath.Join(root, "components"),
		Utils:       filepath.Join(root, "utils"),
	}
	if config.ResolvedPaths != want {
		t.Fatalf("resolved %+v, want %+v", config.ResolvedPaths, want)
	}
	if got := DisplayPath(config, filepath.Join(root, "components", "button", "button.templ")); got != filepath.Join("components", "button", "button.templ") {
		t.Errorf("shared display path %q", got)
	}
	if got := DisplayPath(config, filepath.Join(app, "assets", "css", "globals.css")); got != filepath.Join("assets", "css", "globals.css") {
		t.Errorf("app display path %q", got)
	}
}

// TestGetWorkspaceConfig is shadcn's next-monorepo layout: apps/web and
// packages/ui, each with a components.json, one go.mod at the root.
func TestGetWorkspaceConfig(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "go.mod"), "module example.com/mono\n")
	web := filepath.Join(root, "apps", "web")
	ui := filepath.Join(root, "packages", "ui")
	uiRaw := &RawConfig{
		Style:    "base-nova",
		Tailwind: Tailwind{CSS: "styles/globals.css", BaseColor: "neutral", CSSVariables: true},
		Aliases: Aliases{
			Components: "example.com/mono/packages/ui/components",
			Utils:      "example.com/mono/packages/ui/utils",
			UI:         "example.com/mono/packages/ui/components",
		},
	}
	webRaw := &RawConfig{
		Scripts:  DefaultScripts(),
		Style:    "base-nova",
		Tailwind: Tailwind{CSS: "../../packages/ui/styles/globals.css", BaseColor: "neutral", CSSVariables: true},
		Aliases: Aliases{
			Components: "example.com/mono/apps/web/components",
			Utils:      "example.com/mono/packages/ui/utils",
			UI:         "example.com/mono/packages/ui/components",
		},
	}
	for dir, raw := range map[string]*RawConfig{web: webRaw, ui: uiRaw} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := WriteConfig(dir, raw); err != nil {
			t.Fatal(err)
		}
	}

	config, err := GetConfig(web)
	if err != nil {
		t.Fatal(err)
	}
	if config.ResolvedPaths.Components != filepath.Join(web, "components") || config.ResolvedPaths.UI != filepath.Join(ui, "components") || config.ResolvedPaths.TailwindCSS != filepath.Join(ui, "styles", "globals.css") {
		t.Fatalf("app resolved %+v", config.ResolvedPaths)
	}
	ws, err := GetWorkspaceConfig(config)
	if err != nil {
		t.Fatal(err)
	}
	if ws.Components != config {
		t.Errorf("components workspace %s, want the app", ws.Components.ResolvedPaths.Cwd)
	}
	for name, got := range map[string]*Config{"ui": ws.UI, "utils": ws.Utils} {
		if got.ResolvedPaths.Cwd != ui || got.Style != "base-nova" {
			t.Errorf("%s workspace %s", name, got.ResolvedPaths.Cwd)
		}
	}
	// The ui package is a library workspace: no scripts of its own.
	if ws.UI.Scripts != nil || ws.UI.ScriptsDefaulted || ws.UI.ResolvedPaths.Scripts != "" {
		t.Errorf("ui workspace scripts %+v", ws.UI.Scripts)
	}
	uiWS, err := GetWorkspaceConfig(ws.UI)
	if err != nil {
		t.Fatal(err)
	}
	if uiWS.Components != ws.UI || uiWS.UI != ws.UI || uiWS.Utils != ws.UI {
		t.Error("the ui workspace resolves to itself")
	}

	// A single app, and an app sharing root components the beta.11 way,
	// are their own workspace.
	single := t.TempDir()
	writeTestFile(t, filepath.Join(single, "go.mod"), "module example.com/app\n")
	if err := WriteConfig(single, testRawConfig("example.com/app")); err != nil {
		t.Fatal(err)
	}
	app := filepath.Join(root, "cmd", "servicea")
	if err := os.MkdirAll(app, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := WriteConfig(app, testRawConfig("example.com/mono")); err != nil {
		t.Fatal(err)
	}
	for _, dir := range []string{single, app} {
		config, err := GetConfig(dir)
		if err != nil {
			t.Fatal(err)
		}
		if !config.ScriptsDefaulted {
			t.Errorf("%s: a config without scripts and ui alias gets the default scripts", dir)
		}
		ws, err := GetWorkspaceConfig(config)
		if err != nil {
			t.Fatal(err)
		}
		if ws.Components != config || ws.UI != config || ws.Utils != config {
			t.Errorf("%s: workspace configs are not the app itself", dir)
		}
	}
}

func TestFindModuleWithoutGoMod(t *testing.T) {
	if _, _, err := FindModule(t.TempDir()); err == nil {
		t.Fatal("expected an error without go.mod")
	}
}

func TestGetSharedConfigs(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "go.mod"), "module example.com/mono\n")
	for _, app := range []string{"cmd/a", "cmd/b"} {
		if err := os.MkdirAll(filepath.Join(root, app), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := WriteConfig(filepath.Join(root, app), testRawConfig("example.com/mono")); err != nil {
			t.Fatal(err)
		}
	}
	// Another components package, a foreign components.json, a skipped
	// directory and a nested module are not shared.
	other := testRawConfig("example.com/mono")
	other.Aliases.Components = "example.com/mono/internal/ui"
	if err := os.MkdirAll(filepath.Join(root, "cmd", "c"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := WriteConfig(filepath.Join(root, "cmd", "c"), other); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(root, "web", ConfigFileName), `{"tailwind":{"css":"app.css"},"aliases":{"components":"@/components","utils":"@/lib/utils"}}`)
	writeTestFile(t, filepath.Join(root, "testdata", ConfigFileName), `{}`)
	writeTestFile(t, filepath.Join(root, "nested", "go.mod"), "module example.com/nested\n")
	if err := WriteConfig(filepath.Join(root, "nested"), testRawConfig("example.com/nested")); err != nil {
		t.Fatal(err)
	}

	config, err := GetConfig(filepath.Join(root, "cmd", "a"))
	if err != nil {
		t.Fatal(err)
	}
	shared, err := GetSharedConfigs(config)
	if err != nil {
		t.Fatal(err)
	}
	if len(shared) != 1 || shared[0].ResolvedPaths.Cwd != filepath.Join(root, "cmd", "b") {
		var dirs []string
		for _, c := range shared {
			dirs = append(dirs, c.ResolvedPaths.Cwd)
		}
		t.Fatalf("shared apps %v, want only cmd/b", dirs)
	}
}
