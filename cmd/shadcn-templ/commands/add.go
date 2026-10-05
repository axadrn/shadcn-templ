// The add command, the pendant of src/commands/add.ts, with the shared
// install pipeline of src/utils/add-components.ts inlined below. One pipeline
// covers addProjectComponents and addWorkspaceComponents: every file is
// written with the config of the workspace that holds it
// (utils.GetWorkspaceConfig), and the ui workspace is the main target for
// the registry style and the CSS. In a single app all workspaces are the app.
//
// Dropped npm-only options: -y/--yes (this add never prompts), --dry-run/
// --diff/--view (no pendant yet) and the interactive component multiselect.
package commands

import (
	"flag"
	"fmt"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/registry"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils/updaters"
)

// AddOptions are the flags of shadcn-templ add.
type AddOptions struct {
	Cwd       string
	Overwrite bool
	All       bool
	Path      string
	Silent    bool
	Registry  string
}

// NewAddFlagSet declares the add flags.
func NewAddFlagSet(opts *AddOptions) *flag.FlagSet {
	fs := flag.NewFlagSet("add", flag.ContinueOnError)
	fs.BoolVar(&opts.Overwrite, "overwrite", false, "overwrite existing files")
	fs.BoolVar(&opts.Overwrite, "o", false, "shorthand for --overwrite")
	fs.BoolVar(&opts.All, "all", false, "add all available components")
	fs.BoolVar(&opts.All, "a", false, "shorthand for --all")
	fs.StringVar(&opts.Path, "path", "", "the path to add the component to")
	fs.StringVar(&opts.Path, "p", "", "shorthand for --path")
	fs.BoolVar(&opts.Silent, "silent", false, "mute output")
	fs.BoolVar(&opts.Silent, "s", false, "shorthand for --silent")
	fs.StringVar(&opts.Registry, "registry", "", "registry URL (default "+registry.DefaultRegistry+", env "+registry.EnvRegistry+")")
	fs.StringVar(&opts.Cwd, "cwd", ".", "the working directory")
	fs.StringVar(&opts.Cwd, "c", ".", "shorthand for --cwd")
	return fs
}

// RunAdd executes shadcn-templ add.
func RunAdd(components []string, opts AddOptions) error {
	cwd, err := filepath.Abs(opts.Cwd)
	if err != nil {
		return err
	}
	registryURL := registry.Resolve(opts.Registry)

	config, err := utils.GetConfig(cwd)
	if err != nil {
		return err
	}
	if config == nil {
		return fmt.Errorf("no %s found at %s. Run 'shadcn-templ init' first", utils.ConfigFileName, cwd)
	}

	if opts.All {
		if len(components) > 0 {
			return fmt.Errorf("--all cannot be combined with component names")
		}
		components, err = allComponentNames(registryURL)
		if err != nil {
			return err
		}
	}
	if len(components) == 0 {
		return fmt.Errorf("no components specified. Usage: shadcn-templ add <component>... (or --all)")
	}

	return addComponents(components, config, registryURL, addComponentsOptions{
		Overwrite: opts.Overwrite,
		Silent:    opts.Silent,
		Path:      opts.Path,
	})
}

// allComponentNames lists the registry:ui items of the registry index.
func allComponentNames(registryURL string) ([]string, error) {
	index, err := registry.GetIndex(registryURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch registry index: %w", err)
	}
	var names []string
	for _, item := range index.Items {
		if item.Type == "registry:ui" {
			names = append(names, item.Name)
		}
	}
	sort.Strings(names)
	return names, nil
}

// addComponentsOptions mirrors AddComponentsOptions of add-components.ts.
type addComponentsOptions struct {
	Overwrite        bool
	OverwriteCssVars bool
	Silent           bool
	Path             string
}

// addComponents is the addComponents pendant: resolve the registry tree,
// write the files and update the CSS last.
func addComponents(components []string, config *utils.Config, registryURL string, options addComponentsOptions) error {
	workspace, err := utils.GetWorkspaceConfig(config)
	if err != nil {
		return err
	}
	// The ui workspace is the main target (addWorkspaceComponents'
	// mainTargetConfig): its style, menu and rtl settings resolve the tree,
	// its CSS takes the theme. The shared components stay in one style.
	ui := workspace.UI

	logf(options.Silent, "Checking registry.\n")
	// The config half of shadcn's install transformers (transform-menu.ts,
	// transform-rtl.ts): sent along, resolved by the registry at serve time.
	query := url.Values{}
	if ui.MenuColor != "" && ui.MenuColor != "default" {
		query.Set("menuColor", ui.MenuColor)
	}
	if ui.RTL != nil && *ui.RTL {
		query.Set("rtl", "true")
	}
	if supportsFontHeading(ui.ResolvedPaths.TailwindCSS) {
		query.Set("fontHeading", "true")
	}
	tree, err := registry.ResolveTree(registryURL, ui.Style, query, components)
	if err != nil {
		return err
	}
	if tree == nil {
		return fmt.Errorf("failed to fetch components from registry")
	}

	result, err := updaters.UpdateFiles(tree.Files, config, updaters.UpdateFilesOptions{
		Overwrite: options.Overwrite,
		Silent:    options.Silent,
		Path:      options.Path,
		Workspace: workspace,
	})
	if err != nil {
		return err
	}

	// A registry manifest contains the registry's URL and hash, not this project's.
	// Always replace it with a locally built manifest, including on repeated adds.
	// Migrating an older config must also bundle its already installed scripts,
	// even when the component being added contains only templates.
	needsBundle := result.HasJS() || config.ScriptsDefaulted
	for _, file := range tree.Files {
		if file.Path == "components/scripts_bundle.go" {
			needsBundle = true
			break
		}
	}
	if needsBundle {
		defaulted := config.ScriptsDefaulted
		bundlePaths, _, err := updaters.UpdateScripts(config, true)
		if err != nil {
			return err
		}
		for _, bundlePath := range bundlePaths {
			logf(options.Silent, "Bundle: %s\n", utils.DisplayPath(config, bundlePath))
		}
		logf(options.Silent, "Render @%s.Scripts() once in your layout <head>.\n", path.Base(config.UIAlias()))
		if defaulted {
			logf(options.Silent, "Serve %s at %s.\n", config.Scripts.Dir, config.Scripts.Path)
		}
	}

	// CSS last, so a file watcher rebuild sees the finished component files.
	overwriteCssVars := options.OverwriteCssVars || tree.HasThemeItem
	if !tree.CSSVars.Empty() || tree.CSS.Len() > 0 {
		relCSS := utils.DisplayPath(config, ui.ResolvedPaths.TailwindCSS)
		logf(options.Silent, "Updating %s.\n", relCSS)
		vendored, err := updaters.UpdateCSS(ui.ResolvedPaths.TailwindCSS, updaters.UpdateCSSOptions{
			CSSVars:          tree.CSSVars,
			CSS:              tree.CSS,
			OverwriteCssVars: overwriteCssVars,
		})
		if err != nil {
			return err
		}
		if err := vendorCSSImports(vendored, config, ui.ResolvedPaths.TailwindCSS, registryURL, options.Silent); err != nil {
			return err
		}
	}

	printFontNote(tree.FontDependencies, options.Silent)

	if tree.Docs != "" {
		logf(options.Silent, "%s", tree.Docs)
	}

	if len(result.FilesCreated) > 0 || len(result.FilesUpdated) > 0 {
		// The Go pendant of shadcn's npm install step: the copied sources
		// need templ generation and their module dependencies resolved.
		logf(options.Silent, "Run 'templ generate' and 'go mod tidy' to complete the install.\n")
	}

	return nil
}

func supportsFontHeading(path string) bool {
	css, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return strings.Contains(string(css), "--font-heading:")
}

// vendorCSSImports fetches the vendored stylesheets a registry css block
// imports relatively (./tw-animate.css, ./shadcn-tailwind.css) and writes
// them next to the Tailwind entry file. They are the pendants of the
// tw-animate-css and shadcn/tailwind.css npm imports.
func vendorCSSImports(names []string, config *utils.Config, tailwindCSS, registryURL string, silent bool) error {
	cssDir := filepath.Dir(tailwindCSS)
	for _, name := range names {
		content, err := registry.FetchText(registryURL + "/assets/css/" + name)
		if err != nil {
			logf(silent, "Warning: could not fetch %s: %v\n", name, err)
			continue
		}
		target := filepath.Join(cssDir, name)
		if err := writeFile(target, content); err != nil {
			return err
		}
		rel := utils.DisplayPath(config, target)
		logf(silent, "Created %s\n", rel)
	}
	return nil
}

// printFontNote is the honest pendant of shadcn's font install: their font
// items add fontsource npm packages, which have no Go pendant, so the CLI
// prints instructions instead.
func printFontNote(fontDeps []string, silent bool) {
	for _, dep := range fontDeps {
		variable := "--font-sans"
		font := strings.TrimPrefix(dep, "font-")
		if heading, ok := strings.CutPrefix(font, "heading-"); ok {
			variable = "--font-heading"
			font = heading
		}
		logf(silent, "Fonts are not installed by the CLI. Load the %q font yourself (e.g. Google Fonts or Fontsource) and set %s in your CSS.\n", font, variable)
	}
}
