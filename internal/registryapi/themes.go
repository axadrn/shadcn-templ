package registryapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/axadrn/shadcn-templ/v2/assets"
)

// Theme is the pendant of a registry/themes.ts entry. The values are the
// vendored 1:1 copy in assets/js/create-themes.js (window.templCreateThemes),
// parsed here as the single data source so the Go build and the /create
// browser UI can never drift apart.
type Theme struct {
	Name    string    `json:"name"`
	Title   string    `json:"title"`
	CSSVars ThemeVars `json:"cssVars"`
}

type ThemeVars struct {
	Light *Vars `json:"light"`
	Dark  *Vars `json:"dark"`
}

// baseColorNames is the filter of registry/base-colors.ts: BASE_COLORS =
// THEMES filtered to these names.
var baseColorNames = []string{"neutral", "stone", "zinc", "mauve", "olive", "mist", "taupe"}

var (
	themesOnce sync.Once
	themesData []Theme
	themesErr  error
)

func loadThemes() ([]Theme, error) {
	themesOnce.Do(func() {
		src, err := assets.Assets.ReadFile("js/create-themes.js")
		if err != nil {
			themesErr = fmt.Errorf("registryapi: read create-themes.js: %w", err)
			return
		}
		// The file is `window.templCreateThemes = [...];` — parse the array.
		start := bytes.IndexByte(src, '[')
		end := bytes.LastIndexByte(src, ']')
		if start < 0 || end < start {
			themesErr = fmt.Errorf("registryapi: create-themes.js has no JSON array")
			return
		}
		if err := json.Unmarshal(src[start:end+1], &themesData); err != nil {
			themesErr = fmt.Errorf("registryapi: parse create-themes.js: %w", err)
		}
	})
	return themesData, themesErr
}

// Themes returns all theme variable sets in registry order.
func Themes() []Theme {
	t, err := loadThemes()
	if err != nil {
		panic(err) // embedded data, failure is a build defect
	}
	return t
}

// BaseColors is the BASE_COLORS pendant: the themes filtered to the base
// color names, in THEMES order.
func BaseColors() []Theme {
	var out []Theme
	for _, t := range Themes() {
		if contains(baseColorNames, t.Name) {
			out = append(out, t)
		}
	}
	return out
}

// GetTheme is the getTheme pendant.
func GetTheme(name string) *Theme {
	for i := range Themes() {
		if Themes()[i].Name == name {
			return &Themes()[i]
		}
	}
	return nil
}

// GetBaseColor is the getBaseColor pendant.
func GetBaseColor(name string) *Theme {
	for _, t := range BaseColors() {
		if t.Name == name {
			theme := t
			return &theme
		}
	}
	return nil
}

// ThemesForBaseColor is the getThemesForBaseColor pendant: the matching base
// color theme itself plus every non-base-color theme.
func ThemesForBaseColor(baseColorName string) []Theme {
	var out []Theme
	for _, t := range Themes() {
		if t.Name == baseColorName || !contains(baseColorNames, t.Name) {
			out = append(out, t)
		}
	}
	return out
}

func contains(values []string, v string) bool {
	for _, x := range values {
		if x == v {
			return true
		}
	}
	return false
}
