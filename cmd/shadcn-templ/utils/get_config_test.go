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
