package floatingui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func read(t *testing.T, path string) string {
	t.Helper()
	source, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(source)
}

// The vendored builds are the versions @base-ui/react resolves at the pin in
// plans/UPSTREAM.md, so flip, shift and size behave like upstream.
func TestVendoredVersionsMatchBaseUI(t *testing.T) {
	for path, want := range map[string]string{
		"floating_ui_core.js": "// @floating-ui/core 1.7.5,",
		"floating_ui_dom.js":  "// @floating-ui/dom 1.7.6,",
	} {
		if !strings.HasPrefix(read(t, path), want) {
			t.Errorf("%s does not start with %q", path, want)
		}
	}
}

// Positioning is one block, the port of Base UI's useAnchorPositioning. No
// component script talks to Floating UI itself.
func TestOnlyTheAnchorPositioningBlockUsesFloatingUI(t *testing.T) {
	scripts, err := filepath.Glob("../*/*.js")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range scripts {
		if strings.HasSuffix(path, ".min.js") || strings.Contains(path, "/floatingui/") || strings.HasSuffix(path, "/baseui/use_anchor_positioning.js") {
			continue
		}
		if source := read(t, path); strings.Contains(source, "FloatingUIDOM") || strings.Contains(source, "computePosition") {
			t.Errorf("%s positions with Floating UI itself instead of window.templ.anchorPositioning", path)
		}
	}
	// The dropdown menu and the menubar position through the MenuRoot block.
	for _, component := range []string{"combobox", "contextmenu", "baseui/menu_root", "hovercard", "popover", "select", "tooltip"} {
		path := "../" + component + ".js"
		if !strings.Contains(component, "/") {
			path = "../" + component + "/" + component + ".js"
		}
		if !strings.Contains(read(t, path), "window.templ.anchorPositioning.useAnchorPositioning(") {
			t.Errorf("%s does not use the anchor positioning block", path)
		}
	}
}
