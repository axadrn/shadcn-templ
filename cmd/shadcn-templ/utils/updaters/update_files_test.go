package updaters

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/registry"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils"
)

func TestTransformComponentsRootFilesUsesConfiguredAlias(t *testing.T) {
	cwd := t.TempDir()
	componentsDir := filepath.Join(cwd, "internal", "design")
	config := &utils.Config{
		RawConfig: utils.RawConfig{
			Aliases: utils.Aliases{
				Components: "example.com/acme/app/internal/design",
				Utils:      "example.com/acme/app/internal/shared",
			},
		},
		ResolvedPaths: utils.ResolvedPaths{
			Cwd:        cwd,
			Components: componentsDir,
			UI:         componentsDir,
		},
	}

	scripts := registry.ItemFile{
		Path: "components/scripts_bundle.go",
		Type: "registry:lib",
		Content: `package components

const bundleSrc = "/assets/js/shadcn-templ-test.js"
`,
	}
	got := transformContent(scripts, config)
	for _, want := range []string{
		"package design",
		`const bundleSrc = "/assets/js/shadcn-templ-test.js"`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("transformed scripts_bundle.go missing %q:\n%s", want, got)
		}
	}

	templFile := registry.ItemFile{
		Path:    "components/scripts.templ",
		Type:    "registry:lib",
		Content: "package components\n\ntempl Scripts() {}\n",
	}
	if got := transformContent(templFile, config); !strings.HasPrefix(got, "package design\n") {
		t.Errorf("transformed scripts.templ = %q", got)
	}

	nested := registry.ItemFile{
		Path:    "components/dialog/dialog.templ",
		Type:    "registry:ui",
		Content: "package dialog\n",
	}
	if got := transformContent(nested, config); got != nested.Content {
		t.Errorf("nested component package changed: %q", got)
	}

	target, err := resolveFilePath(scripts, config, "")
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(componentsDir, "scripts_bundle.go"); target != want {
		t.Errorf("scripts target = %q, want %q", target, want)
	}
}

// TestUpdateFilesWorkspace is addWorkspaceComponents: run in apps/web, ui
// components and their scripts land in packages/ui with its aliases,
// utils in the ui package, a block in the app with imports into the ui
// package and its own block packages.
func TestUpdateFilesWorkspace(t *testing.T) {
	root := t.TempDir()
	write := func(path, content string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(root, "go.mod"), "module example.com/mono\n")
	web := filepath.Join(root, "apps", "web")
	ui := filepath.Join(root, "packages", "ui")
	if err := utils.WriteConfig(mkdir(t, ui), &utils.RawConfig{
		Style:    "base-nova",
		Tailwind: utils.Tailwind{CSS: "styles/globals.css", BaseColor: "neutral", CSSVariables: true},
		Aliases: utils.Aliases{
			Components: "example.com/mono/packages/ui/components",
			Utils:      "example.com/mono/packages/ui/utils",
			UI:         "example.com/mono/packages/ui/components",
		},
	}); err != nil {
		t.Fatal(err)
	}
	if err := utils.WriteConfig(mkdir(t, web), &utils.RawConfig{
		Scripts:  utils.DefaultScripts(),
		Style:    "base-nova",
		Tailwind: utils.Tailwind{CSS: "../../packages/ui/styles/globals.css", BaseColor: "neutral", CSSVariables: true},
		Aliases: utils.Aliases{
			Components: "example.com/mono/apps/web/components",
			Utils:      "example.com/mono/packages/ui/utils",
			UI:         "example.com/mono/packages/ui/components",
		},
	}); err != nil {
		t.Fatal(err)
	}
	config, err := utils.GetConfig(web)
	if err != nil {
		t.Fatal(err)
	}
	ws, err := utils.GetWorkspaceConfig(config)
	if err != nil {
		t.Fatal(err)
	}

	const repo = "github.com/axadrn/shadcn-templ/v2"
	files := []registry.ItemFile{
		{Path: "components/button/button.templ", Type: "registry:ui", Content: "package button\n\nimport \"" + repo + "/utils\"\n"},
		{Path: "components/dialog/dialog.js", Type: "registry:ui", Content: "// dialog\n"},
		{Path: "components/scripts.templ", Type: "registry:lib", Content: "package components\n"},
		{Path: "utils/shadcn-templ.go", Type: "registry:lib", Content: "package utils\n"},
		{Path: "blocks/sidebar07/page.templ", Type: "registry:page", Content: "package sidebar07\n\nimport (\n\t\"" + repo + "/components/sidebar\"\n\t\"" + repo + "/blocks/sidebar07/nav\"\n)\n"},
	}
	result, err := UpdateFiles(files, config, UpdateFilesOptions{Silent: true, Workspace: ws})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		filepath.Join(ui, "components", "button", "button.templ"):             "import \"example.com/mono/packages/ui/utils\"",
		filepath.Join(ui, "components", "dialog", "dialog.js"):                "// dialog",
		filepath.Join(ui, "components", "scripts.templ"):                      "package components\n",
		filepath.Join(ui, "utils", "shadcn-templ.go"):                         "package utils\n",
		filepath.Join(web, "components", "blocks", "sidebar07", "page.templ"): "\"example.com/mono/packages/ui/components/sidebar\"\n\t\"example.com/mono/apps/web/components/blocks/sidebar07/nav\"",
	}
	for path, content := range want {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("missing %s", path)
			continue
		}
		if !strings.Contains(string(data), content) {
			t.Errorf("%s:\n%s\nwant %q", path, data, content)
		}
	}
	for _, dir := range []string{filepath.Join(web, "components", "button"), filepath.Join(root, "components"), filepath.Join(web, "utils")} {
		if _, err := os.Stat(dir); !os.IsNotExist(err) {
			t.Errorf("unexpected %s", dir)
		}
	}
	// Printed relative to the module root, like shadcn's workspace root.
	if !slices.Contains(result.FilesCreated, filepath.Join("apps", "web", "components", "blocks", "sidebar07", "page.templ")) ||
		!slices.Contains(result.FilesCreated, filepath.Join("packages", "ui", "components", "button", "button.templ")) {
		t.Errorf("created %v", result.FilesCreated)
	}
}

func mkdir(t *testing.T, dir string) string {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}
