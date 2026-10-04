// The init command, the pendant of src/commands/init.ts reduced to the
// shadcn-templ feature set: fetch the registry:base item for a preset (or the
// defaults), write components.json, merge the theme CSS into the user's
// Tailwind entry file and install the utils lib item. --template scaffolds a
// new project from an embedded template first, like their init -t next.
// Run in an app directory below go.mod (cmd/<app>), init sets up that app
// and installs into the module's shared packages, see /docs/monorepo.
//
// Dropped npm-only options, all without a Go pendant: --base (component
// library selection; shadcn-templ ships one implementation), --monorepo
// (it scaffolds a Turborepo workspace; a Go module needs no scaffolding to
// hold several apps), --cssVariables/--rtl/--pointer toggles beyond what a preset encodes,
// --defaults/-y prompt shortcuts (this init does not prompt for design
// choices), and the interactive preset picker.
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
	scaffolded := false
	if opts.Template != "" {
		template, ok := templates.Templates[opts.Template]
		if !ok {
			return fmt.Errorf("unknown template %q, valid templates: %s", opts.Template, strings.Join(templates.Names(), ", "))
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
		projectPath := filepath.Join(cwd, projectName)
		logf(opts.Silent, "Creating a new %s project in %s.\n", template.Title, projectName)
		if err := templates.Create(template, projectPath, projectName); err != nil {
			return err
		}
		cwd = projectPath
		scaffolded = true
	}

	// Preflight: a Go module is the shadcn-templ pendant of a framework project.
	module, err := utils.ModulePath(cwd)
	if err != nil {
		return err
	}

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

	raw := &utils.RawConfig{
		Schema:  utils.SchemaURL,
		Scripts: utils.DefaultScripts(),
		Style:   baseItem.Config.Style,
		Tailwind: utils.Tailwind{
			CSS:          resolveTailwindCSSPath(cwd, opts.CSS, existing),
			BaseColor:    baseItem.Config.Tailwind.BaseColor,
			CSSVariables: true,
		},
		RTL:         baseItem.Config.RTL,
		IconLibrary: baseItem.Config.IconLibrary,
		MenuColor:   baseItem.Config.MenuColor,
		MenuAccent:  baseItem.Config.MenuAccent,
		Aliases: utils.Aliases{
			Components: module + "/components",
			Utils:      module + "/utils",
		},
	}
	if existing != nil {
		// Keep the user's paths on re-init.
		if existing.Scripts != nil {
			raw.Scripts = existing.Scripts
		}
		if existing.Aliases.Components != "" {
			raw.Aliases.Components = existing.Aliases.Components
		}
		if existing.Aliases.Utils != "" {
			raw.Aliases.Utils = existing.Aliases.Utils
		}
	}
	if opts.BaseColor != "" {
		raw.Tailwind.BaseColor = opts.BaseColor
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
	if scripts, _ := filepath.Glob(filepath.Join(config.ResolvedPaths.Components, "*", "*.js")); len(scripts) > 0 {
		bundlePaths, _, err := updaters.UpdateScripts(config)
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
		logf(opts.Silent, "\nProject initialization completed.\nNext steps:\n\n  cd %s\n  go mod tidy\n  task dev\n", filepath.Base(cwd))
		return nil
	}

	logf(opts.Silent, "\nProject initialization completed.\nYou may now add components.\n")
	return nil
}

// resolveTailwindCSSPath picks the Tailwind entry file: --css flag, existing
// config, detection, then the default location.
func resolveTailwindCSSPath(cwd, cssFlag string, existing *utils.RawConfig) string {
	if cssFlag != "" {
		return filepath.ToSlash(cssFlag)
	}
	if existing != nil && existing.Tailwind.CSS != "" {
		return existing.Tailwind.CSS
	}
	if found := utils.FindTailwindCSS(cwd); found != "" && !strings.Contains(found, "output") {
		return found
	}
	return "assets/css/globals.css"
}
