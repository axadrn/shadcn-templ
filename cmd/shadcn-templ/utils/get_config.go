// Package utils is the pendant of shadcn/src/utils: get_config.go covers
// get-config.ts, the components.json shape and its resolved paths.
//
// components.json field mapping against shadcn's schema (every dropped npm
// field documented):
//
//	$schema:               https://shadcn-templ.com/schema/components.json
//	style:                 kept 1:1 ("base-<style>", e.g. "base-nova")
//	tailwind.css:          kept 1:1 (the user's Tailwind entry file)
//	tailwind.baseColor:    kept 1:1
//	tailwind.cssVariables: kept 1:1 (always true; shadcn-templ has no inline-theme
//	                       mode)
//	tailwind.config:       dropped; Tailwind v4 has no config file and shadcn-templ
//	                       is v4-only (shadcn keeps "" for v3 compat)
//	tailwind.prefix:       dropped; shadcn-templ components ship unprefixed classes
//	rsc, tsx:              dropped; React Server Components and TypeScript
//	                       have no Go pendant
//	iconLibrary:           kept 1:1
//	rtl, menuColor,
//	menuAccent:            kept 1:1 (written from the registry:base config)
//	aliases.components:    Go pendant: the import path of the components dir
//	                       ("<module>/components"); shadcn stores a tsconfig
//	                       alias ("@/components")
//	aliases.utils:         Go pendant: "<module>/utils"
//	aliases.ui/lib/hooks:  dropped; shadcn-templ has no separate ui/lib/hooks dirs
//	registries:            dropped; there are no third-party shadcn-templ
//	                       registries (the --registry flag and
//	                       SHADCN_TEMPL_REGISTRY env cover local dev)
package utils

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// SchemaURL is the $schema value of components.json.
const SchemaURL = "https://shadcn-templ.com/schema/components.json"

// Tailwind is the tailwind block of components.json.
type Tailwind struct {
	CSS          string `json:"css"`
	BaseColor    string `json:"baseColor"`
	CSSVariables bool   `json:"cssVariables"`
}

// Scripts configures the build output directory and public URL prefix.
type Scripts struct {
	Dir  string `json:"dir"`
	Path string `json:"path"`
}

// DefaultScripts returns the conventional asset directory and URL.
func DefaultScripts() *Scripts { return &Scripts{Dir: "assets/js", Path: "/assets/js"} }

// Aliases holds Go import paths, the pendant of shadcn's tsconfig aliases.
type Aliases struct {
	Components string `json:"components"`
	Utils      string `json:"utils"`
}

// RawConfig is the rawConfigSchema pendant: components.json as written.
type RawConfig struct {
	Scripts     *Scripts `json:"scripts,omitempty"`
	Schema      string   `json:"$schema,omitempty"`
	Style       string   `json:"style"`
	Tailwind    Tailwind `json:"tailwind"`
	RTL         *bool    `json:"rtl,omitempty"`
	IconLibrary string   `json:"iconLibrary,omitempty"`
	MenuColor   string   `json:"menuColor,omitempty"`
	MenuAccent  string   `json:"menuAccent,omitempty"`
	Aliases     Aliases  `json:"aliases"`
}

// ResolvedPaths is the resolvedPaths pendant: absolute paths derived from the
// aliases and the go.mod module path.
type ResolvedPaths struct {
	Scripts string
	// Cwd is the directory of components.json (the app). File paths in
	// components.json (tailwind.css, scripts.dir) are relative to it.
	Cwd string
	// ModuleRoot is the directory of go.mod. Import path aliases resolve
	// against it, so several apps of one module share their components.
	ModuleRoot  string
	TailwindCSS string
	Components  string
	Utils       string
}

// Config is the configSchema pendant: RawConfig plus resolved paths.
type Config struct {
	RawConfig
	Module           string
	ScriptsDefaulted bool
	ResolvedPaths    ResolvedPaths
}

// ConfigFileName is the components.json file name.
const ConfigFileName = "components.json"

// GetConfig loads and resolves components.json from cwd. Returns (nil, nil)
// when no components.json exists (the shadcn null config).
func GetConfig(cwd string) (*Config, error) {
	raw, err := GetRawConfig(cwd)
	if err != nil || raw == nil {
		return nil, err
	}
	return ResolveConfigPaths(cwd, raw)
}

// GetRawConfig reads components.json without resolving paths.
func GetRawConfig(cwd string) (*RawConfig, error) {
	data, err := os.ReadFile(filepath.Join(cwd, ConfigFileName))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var raw RawConfig
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("invalid configuration found in %s: %w", filepath.Join(cwd, ConfigFileName), err)
	}
	return &raw, nil
}

// ResolveConfigPaths is the resolveConfigPaths pendant: derive absolute
// directories from the Go import path aliases via the go.mod module path.
// go.mod may sit in cwd or any parent directory (an app in a monorepo).
func ResolveConfigPaths(cwd string, raw *RawConfig) (*Config, error) {
	root, module, err := FindModule(cwd)
	if err != nil {
		return nil, err
	}

	componentsDir, err := aliasDir(root, module, raw.Aliases.Components, "components")
	if err != nil {
		return nil, err
	}
	utilsDir, err := aliasDir(root, module, raw.Aliases.Utils, "utils")
	if err != nil {
		return nil, err
	}

	if raw.Tailwind.CSS == "" {
		return nil, fmt.Errorf("no tailwind.css path in %s", ConfigFileName)
	}

	defaulted := raw.Scripts == nil
	resolved := *raw
	if defaulted {
		resolved.Scripts = DefaultScripts()
	}
	if resolved.Scripts.Dir == "" || resolved.Scripts.Path == "" {
		return nil, fmt.Errorf("scripts.dir and scripts.path must not be empty")
	}
	return &Config{
		RawConfig:        resolved,
		ScriptsDefaulted: defaulted,
		Module:           module,
		ResolvedPaths: ResolvedPaths{
			Scripts:     filepath.Join(cwd, filepath.FromSlash(resolved.Scripts.Dir)),
			Cwd:         cwd,
			ModuleRoot:  root,
			TailwindCSS: filepath.Join(cwd, filepath.FromSlash(raw.Tailwind.CSS)),
			Components:  componentsDir,
			Utils:       utilsDir,
		},
	}, nil
}

// aliasDir maps an import path alias under the module to a directory below
// the module root.
func aliasDir(root, module, alias, key string) (string, error) {
	if alias == "" {
		return "", fmt.Errorf("missing aliases.%s in %s", key, ConfigFileName)
	}
	if alias == module {
		return root, nil
	}
	rel, ok := strings.CutPrefix(alias, module+"/")
	if !ok {
		return "", fmt.Errorf("aliases.%s %q is not under the module path %q; configure an import path inside your module", key, alias, module)
	}
	return filepath.Join(root, filepath.FromSlash(rel)), nil
}

// ModulePath returns the module path of the go.mod in cwd or its closest
// parent directory, the pendant of shadcn resolving tsconfig path aliases.
func ModulePath(cwd string) (string, error) {
	_, module, err := FindModule(cwd)
	return module, err
}

// FindModule walks up from dir to the closest go.mod, like the go command,
// and returns its directory and module path.
func FindModule(dir string) (root, module string, err error) {
	for root = dir; ; {
		data, err := os.ReadFile(filepath.Join(root, "go.mod"))
		if err == nil {
			for line := range strings.Lines(string(data)) {
				line = strings.TrimSpace(line)
				if module, ok := strings.CutPrefix(line, "module "); ok {
					return root, strings.Trim(strings.TrimSpace(module), `"`), nil
				}
			}
			return "", "", fmt.Errorf("no module directive in %s", filepath.Join(root, "go.mod"))
		}
		if !os.IsNotExist(err) {
			return "", "", err
		}
		parent := filepath.Dir(root)
		if parent == root {
			return "", "", fmt.Errorf("no go.mod found in %s or any parent directory. A Go module is required. Run 'go mod init' first", dir)
		}
		root = parent
	}
}

// GetSharedConfigs returns the configs of the other apps in config's module
// whose aliases.components resolve to the same directory: the apps that
// share one installed components package and its scripts_bundle.go. It
// walks the module root for components.json, skipping what the go command
// skips (dot and underscore directories, testdata), vendor, node_modules
// and nested modules. A components.json that does not load or resolve
// belongs to something else and is ignored.
func GetSharedConfigs(config *Config) ([]*Config, error) {
	root := config.ResolvedPaths.ModuleRoot
	var shared []*Config
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if path == root {
				return err
			}
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if path != root {
			name := d.Name()
			if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") || name == "testdata" || name == "vendor" || name == "node_modules" {
				return fs.SkipDir
			}
			if _, err := os.Stat(filepath.Join(path, "go.mod")); err == nil {
				return fs.SkipDir
			}
		}
		if path == config.ResolvedPaths.Cwd {
			return nil
		}
		if _, err := os.Stat(filepath.Join(path, ConfigFileName)); err != nil {
			return nil
		}
		other, err := GetConfig(path)
		if err != nil || other == nil || other.ResolvedPaths.Components != config.ResolvedPaths.Components {
			return nil
		}
		shared = append(shared, other)
		return nil
	})
	return shared, err
}

// DisplayPath is the path printed for a written file: relative to the app
// for files inside it, relative to the module root for shared files.
func DisplayPath(config *Config, path string) string {
	for _, base := range []string{config.ResolvedPaths.Cwd, config.ResolvedPaths.ModuleRoot} {
		if base == "" {
			continue
		}
		rel, err := filepath.Rel(base, path)
		if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return rel
		}
	}
	return path
}

// WriteConfig writes components.json (2-space indent plus trailing newline,
// like the reference).
func WriteConfig(cwd string, raw *RawConfig) error {
	data, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(cwd, ConfigFileName), append(data, '\n'), 0o644)
}

// FindTailwindCSS is the pendant of getTailwindCssFile in get-project-info.ts:
// find the CSS file that imports tailwindcss. Returns a cwd-relative slash
// path or "".
func FindTailwindCSS(cwd string) string {
	var found string
	_ = filepath.WalkDir(cwd, func(path string, d fs.DirEntry, err error) error {
		if err != nil || found != "" {
			return fs.SkipAll
		}
		if d.IsDir() {
			name := d.Name()
			if path != cwd && (strings.HasPrefix(name, ".") || name == "node_modules" || name == "vendor" || name == "dist") {
				return fs.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(d.Name(), ".css") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		content := string(data)
		if strings.Contains(content, `@import "tailwindcss"`) || strings.Contains(content, "@import 'tailwindcss'") || strings.Contains(content, "@tailwind base") {
			rel, err := filepath.Rel(cwd, path)
			if err == nil {
				found = filepath.ToSlash(rel)
				return fs.SkipAll
			}
		}
		return nil
	})
	return found
}
