// The init command, the pendant of src/commands/init.ts reduced to the
// shadcn-templ feature set: fetch the registry:base item for a preset (or the
// defaults), write components.json, merge the theme CSS into the user's
// Tailwind entry file and install the utils lib item. --template scaffolds a
// new project from an embedded template first, like their init -t next.
// --monorepo scaffolds the template's monorepo variant instead (one module
// with the workspaces apps/web and packages/ui, like next-monorepo), writes
// both components.json and continues init in the app. Run in an app below a
// module with packages/ui/components.json, init joins that ui workspace:
// the app's ui and utils aliases and its tailwind.css point into it, and
// menuColor, menuAccent, rtl and iconLibrary propagate to it. See
// /docs/monorepo.
//
// Dropped npm-only options, all without a Go pendant: --base (component
// library selection; shadcn-templ ships one implementation), --no-monorepo
// and the template and monorepo prompts (one template, and this init does
// not prompt for design choices), --cssVariables/--rtl/--pointer toggles
// beyond what a preset encodes, --defaults/-y prompt shortcuts, and the
// interactive preset picker.
package commands

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/registry"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/templates"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils/updaters"
)

// InitOptions are the flags of shadcn-templ init.
type InitOptions struct {
	Cwd         string
	Preset      string
	BaseColor   string
	CSS         string
	Template    string
	Monorepo    bool
	ProjectName string
	Force       bool
	Silent      bool
	Registry    string
}

// NewInitFlagSet declares the init flags.
func NewInitFlagSet(opts *InitOptions) *flag.FlagSet {
	fs := flag.NewFlagSet("init", flag.ContinueOnError)
	fs.StringVar(&opts.Preset, "preset", "", "use a preset configuration (code, URL or name)")
	fs.StringVar(&opts.Preset, "p", "", "shorthand for --preset")
	fs.StringVar(&opts.Template, "template", "", "scaffold a new project from a template ("+strings.Join(templates.Names(), ", ")+")")
	fs.StringVar(&opts.Template, "t", "", "shorthand for --template")
	fs.BoolVar(&opts.Monorepo, "monorepo", false, "scaffold a monorepo project (implies --template templ)")
	fs.StringVar(&opts.BaseColor, "base-color", "", "override the base color")
	fs.StringVar(&opts.CSS, "css", "", "path to your Tailwind CSS entry file")
	fs.BoolVar(&opts.Force, "force", false, "force overwrite of existing configuration")
	fs.BoolVar(&opts.Force, "f", false, "shorthand for --force")
	fs.BoolVar(&opts.Silent, "silent", false, "mute output")
	fs.BoolVar(&opts.Silent, "s", false, "shorthand for --silent")
	fs.StringVar(&opts.Registry, "registry", "", "registry URL (default "+registry.DefaultRegistry+", env "+registry.EnvRegistry+")")
	fs.StringVar(&opts.Cwd, "cwd", ".", "the working directory")
	fs.StringVar(&opts.Cwd, "c", ".", "shorthand for --cwd")
	return fs
}

// RunInit executes shadcn-templ init.
func RunInit(opts InitOptions) error {
	cwd, err := filepath.Abs(opts.Cwd)
	if err != nil {
		return err
	}
	registryURL := registry.Resolve(opts.Registry)

	// --template scaffolds a new project first (create-template.ts): copy
	// the embedded template into <cwd>/<name> and continue init in there.
	// --monorepo implies templ, the only template; shadcn prompts for one.
	if opts.Monorepo && opts.Template == "" {
		opts.Template = "templ"
	}
	scaffolded := false
	projectPath := ""
	if opts.Template != "" {
		template, err := templates.Resolve(opts.Template, opts.Monorepo)
		if err != nil {
			return err
		}
		// Scaffolding nests a fresh module; inside an existing one (cwd or
		// any parent holds go.mod) that pollutes the parent repo (and its
		// embeds/builds).
		if module, err := utils.ModulePath(cwd); err == nil {
			return fmt.Errorf("refusing to scaffold inside the Go module %s; run this outside a module or pass a target with --cwd", module)
		}
		projectName := opts.ProjectName
		if projectName == "" {
			projectName = template.DefaultProjectName
		}
		projectPath = filepath.Join(cwd, projectName)
		logf(opts.Silent, "Creating a new %s project in %s.\n", template.Title, projectName)
		if err := templates.Create(template, projectPath, projectName); err != nil {
			return err
		}
		// A monorepo continues in its app, below the module root.
		cwd = filepath.Join(projectPath, filepath.FromSlash(template.AppDir))
		scaffolded = true
	}

	// Preflight: the target directory must exist (preflight-init's
	// MISSING_DIR_OR_EMPTY_PROJECT), and a Go module is the shadcn-templ
	// pendant of a framework project.
	if info, err := os.Stat(cwd); err != nil || !info.IsDir() {
		return fmt.Errorf("the path %s does not exist. Create the app first, a new app in a monorepo starts as a copy of apps/web", cwd)
	}
	moduleRoot, module, err := utils.FindModule(cwd)
	if err != nil {
		return err
	}
	// The ui workspace of a monorepo, shadcn's packages/ui. An app below a
	// module that has one joins it.
	uiDir := filepath.Join(moduleRoot, "packages", "ui")
	monorepo := scaffolded && opts.Monorepo

	existing, err := utils.GetRawConfig(cwd)
	if err != nil {
		return err
	}
	if existing != nil && !opts.Force {
		if !confirm("A components.json file already exists. Would you like to overwrite it?") {
			fmt.Println("  To start over, remove the components.json file and run init again.")
			os.Exit(1)
		}
	}

	// Resolve the /init URL from --preset (code, URL or name); no preset
	// uses the nova defaults.
	presetArg := opts.Preset
	initURL := ""
	if presetArg == "" {
		initURL = resolveInitURL(registryURL, defaultPresets["nova"].Config, false, initURLOptions{})
	} else {
		initURL, err = resolvePresetInitURL(registryURL, presetArg, false, "")
		if err != nil {
			return err
		}
	}

	// Fetch the registry:base item; its config block seeds components.json.
	baseItem, err := registry.GetItem(registryURL, "", initURL, nil)
	if err != nil {
		return err
	}
	if baseItem.Config == nil || baseItem.Config.Style == "" {
		return fmt.Errorf("the registry did not return a base configuration for %s", initURL)
	}

	newConfig := func(css string, aliases utils.Aliases) *utils.RawConfig {
		raw := &utils.RawConfig{
			Schema:  utils.SchemaURL,
			Scripts: utils.DefaultScripts(),
			Style:   baseItem.Config.Style,
			Tailwind: utils.Tailwind{
				CSS:          css,
				BaseColor:    baseItem.Config.Tailwind.BaseColor,
				CSSVariables: true,
			},
			RTL:         baseItem.Config.RTL,
			IconLibrary: baseItem.Config.IconLibrary,
			MenuColor:   baseItem.Config.MenuColor,
			MenuAccent:  baseItem.Config.MenuAccent,
			Aliases:     aliases,
		}
		if opts.BaseColor != "" {
			raw.Tailwind.BaseColor = opts.BaseColor
		}
		return raw
	}

	// init --monorepo writes the ui workspace's config first, from the same
	// preset (the template's packages/ui/components.json in shadcn). It is
	// a library workspace: aliases into itself, no scripts.
	if monorepo {
		uiRaw := newConfig("styles/globals.css", utils.Aliases{
			Components: module + "/packages/ui/components",
			Utils:      module + "/packages/ui/utils",
			UI:         module + "/packages/ui/components",
		})
		uiRaw.Scripts = nil
		logf(opts.Silent, "Writing packages/ui/%s.\n", utils.ConfigFileName)
		if err := utils.WriteConfig(uiDir, uiRaw); err != nil {
			return err
		}
	}

	aliases := utils.Aliases{
		Components: module + "/components",
		Utils:      module + "/utils",
	}
	uiCSS := ""
	if ui, err := joinUIWorkspace(cwd, uiDir); err != nil {
		return err
	} else if ui != nil {
		// An app joining the ui workspace: its own components (blocks), the
		// ui components and utils from the ui package, the ui package's CSS.
		rel, err := filepath.Rel(moduleRoot, cwd)
		if err != nil {
			return err
		}
		aliases = utils.Aliases{
			Components: module + "/" + filepath.ToSlash(rel) + "/components",
			Utils:      ui.Aliases.Utils,
			UI:         ui.UIAlias(),
		}
		if uiCSS, err = filepath.Rel(cwd, ui.ResolvedPaths.TailwindCSS); err != nil {
			return err
		}
		uiCSS = filepath.ToSlash(uiCSS)
	}

	raw := newConfig(resolveTailwindCSSPath(cwd, opts.CSS, existing, uiCSS), aliases)
	if existing != nil {
		// Keep the user's paths on re-init.
		if existing.Scripts != nil {
			raw.Scripts = existing.Scripts
		}
		if existing.Aliases.Components != "" {
			// The ui alias belongs to the components alias: unset, the
			// ui components live there.
			raw.Aliases.Components = existing.Aliases.Components
			raw.Aliases.UI = existing.Aliases.UI
		}
		if existing.Aliases.Utils != "" {
			raw.Aliases.Utils = existing.Aliases.Utils
		}
	}

	// Make sure the Tailwind entry file exists before the CSS updater runs.
	cssPath := filepath.Join(cwd, filepath.FromSlash(raw.Tailwind.CSS))
	if _, err := os.Stat(cssPath); os.IsNotExist(err) {
		if err := os.MkdirAll(filepath.Dir(cssPath), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(cssPath, []byte("@import \"tailwindcss\";\n"), 0o644); err != nil {
			return err
		}
		logf(opts.Silent, "Created %s\n", raw.Tailwind.CSS)
	}

	logf(opts.Silent, "Writing %s.\n", utils.ConfigFileName)
	if err := utils.WriteConfig(cwd, raw); err != nil {
		return err
	}

	config, err := utils.ResolveConfigPaths(cwd, raw)
	if err != nil {
		return err
	}

	// Propagate design settings to the other workspaces' components.json,
	// exactly init.ts' set. The style is not propagated: every workspace
	// needs the same one, see /docs/monorepo.
	if err := syncWorkspaceConfigs(config, func(other *utils.RawConfig) {
		if raw.MenuColor != "" {
			other.MenuColor = raw.MenuColor
		}
		if raw.MenuAccent != "" {
			other.MenuAccent = raw.MenuAccent
		}
		if raw.RTL != nil {
			other.RTL = raw.RTL
		}
		if raw.IconLibrary != "" {
			other.IconLibrary = raw.IconLibrary
		}
	}); err != nil {
		return err
	}

	// Install the base item and its registry dependencies (utils lib item).
	if err := addComponents([]string{initURL}, config, registryURL, addComponentsOptions{
		// Init always overwrites files and CSS variables.
		Overwrite:        true,
		OverwriteCssVars: true,
		Silent:           opts.Silent,
	}); err != nil {
		return err
	}

	// An app joining a module whose shared components already carry
	// scripts needs its own copy of the bundle in its scripts.dir; add
	// bundles only when it writes scripts.
	if scripts, _ := filepath.Glob(filepath.Join(config.ResolvedPaths.UI, "*", "*.js")); len(scripts) > 0 {
		bundlePaths, _, err := updaters.UpdateScripts(config, true)
		if err != nil {
			return err
		}
		for _, bundlePath := range bundlePaths {
			logf(opts.Silent, "Bundle: %s\n", utils.DisplayPath(config, bundlePath))
		}
	}

	if scaffolded {
		// The template's home page renders component-example, like their
		// templates install it for the scaffolded page.
		if err := addComponents([]string{"component-example"}, config, registryURL, addComponentsOptions{
			Overwrite: true,
			Silent:    opts.Silent,
		}); err != nil {
			return err
		}
		logf(opts.Silent, "\nProject initialization completed.\nNext steps:\n\n  cd %s\n  go mod tidy\n  task dev\n", filepath.Base(projectPath))
		return nil
	}

	logf(opts.Silent, "\nProject initialization completed.\nYou may now add components.\n")
	return nil
}

// joinUIWorkspace returns the config of the module's ui workspace
// (packages/ui with a components.json) for an app that joins it, or nil:
// no ui workspace, or cwd is the ui workspace itself.
func joinUIWorkspace(cwd, uiDir string) (*utils.Config, error) {
	if cwd == uiDir {
		return nil, nil
	}
	if _, err := os.Stat(filepath.Join(uiDir, utils.ConfigFileName)); err != nil {
		return nil, nil
	}
	ui, err := utils.GetConfig(uiDir)
	if err != nil {
		return nil, fmt.Errorf("could not load the workspace config in %s: %w", uiDir, err)
	}
	return ui, nil
}

// syncWorkspaceConfigs patches the components.json of every other
// workspace config's aliases resolve to: init's design settings
// propagation and apply's syncApplyWorkspaceConfigs. A single app has no
// other workspace.
func syncWorkspaceConfigs(config *utils.Config, patch func(raw *utils.RawConfig)) error {
	workspace, err := utils.GetWorkspaceConfig(config)
	if err != nil {
		return err
	}
	seen := map[string]bool{config.ResolvedPaths.Cwd: true}
	for _, other := range []*utils.Config{workspace.Components, workspace.UI, workspace.Utils} {
		dir := other.ResolvedPaths.Cwd
		if seen[dir] {
			continue
		}
		seen[dir] = true
		raw, err := utils.GetRawConfig(dir)
		if err != nil {
			return err
		}
		if raw == nil {
			continue
		}
		patch(raw)
		if err := utils.WriteConfig(dir, raw); err != nil {
			return err
		}
	}
	return nil
}

// resolveTailwindCSSPath picks the Tailwind entry file: --css flag, existing
// config, the ui workspace's CSS for an app joining one, detection, then the
// default location.
func resolveTailwindCSSPath(cwd, cssFlag string, existing *utils.RawConfig, uiCSS string) string {
	if cssFlag != "" {
		return filepath.ToSlash(cssFlag)
	}
	if existing != nil && existing.Tailwind.CSS != "" {
		return existing.Tailwind.CSS
	}
	if uiCSS != "" {
		return uiCSS
	}
	if found := utils.FindTailwindCSS(cwd); found != "" && !strings.Contains(found, "output") {
		return found
	}
	return "assets/css/globals.css"
}
