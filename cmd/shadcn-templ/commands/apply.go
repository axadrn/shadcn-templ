// The apply command, the pendant of src/commands/apply.ts: apply a preset to
// an existing project. Without --only that means new components.json config,
// new CSS variables and a re-install of every installed component; with
// --only theme|font just the selected parts.
//
// In a monorepo the linked workspaces' components.json are synced like
// syncApplyWorkspaceConfigs.
//
// Dropped npm-only behavior: the browser-opening preset builder prompt (the
// URL is printed instead).
package commands

import (
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"

	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/registry"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils"
	"github.com/axadrn/shadcn-templ/v2/internal/preset"
)

// ApplyOptions are the flags of shadcn-templ apply.
type ApplyOptions struct {
	Cwd      string
	Preset   string
	Only     string
	OnlySet  bool
	Yes      bool
	Silent   bool
	Registry string
}

// NewApplyFlagSet declares the apply flags.
func NewApplyFlagSet(opts *ApplyOptions) *flag.FlagSet {
	fs := flag.NewFlagSet("apply", flag.ContinueOnError)
	fs.StringVar(&opts.Preset, "preset", "", "preset configuration to apply")
	fs.Func("only", "apply only parts of a preset: theme, font", func(value string) error {
		opts.Only = value
		opts.OnlySet = true
		return nil
	})
	fs.BoolVar(&opts.Yes, "yes", false, "skip confirmation prompt")
	fs.BoolVar(&opts.Yes, "y", false, "shorthand for --yes")
	fs.BoolVar(&opts.Silent, "silent", false, "mute output")
	fs.BoolVar(&opts.Silent, "s", false, "shorthand for --silent")
	fs.StringVar(&opts.Registry, "registry", "", "registry URL (default "+registry.DefaultRegistry+", env "+registry.EnvRegistry+")")
	fs.StringVar(&opts.Cwd, "cwd", ".", "the working directory")
	fs.StringVar(&opts.Cwd, "c", ".", "shorthand for --cwd")
	return fs
}

// applyOnlyValues is APPLY_ONLY_VALUES.
var applyOnlyValues = []string{"theme", "font"}

// parseApplyOnlyParts is the parseApplyOnlyParts pendant.
func parseApplyOnlyParts(value string) ([]string, error) {
	aliases := map[string]string{"theme": "theme", "font": "font", "fonts": "font"}
	var parts []string
	seen := map[string]bool{}
	invalid := false
	for _, part := range strings.Split(value, ",") {
		part = strings.ToLower(strings.TrimSpace(part))
		if part == "" {
			continue
		}
		mapped, ok := aliases[part]
		if !ok {
			invalid = true
			continue
		}
		if !seen[mapped] {
			seen[mapped] = true
			parts = append(parts, mapped)
		}
	}
	if len(parts) == 0 || invalid {
		return nil, fmt.Errorf("invalid value for --only: %s.\nUse one or more of: %s.\nExample: shadcn-templ apply <preset> --only theme,font",
			value, strings.Join(applyOnlyValues, ", "))
	}
	return parts, nil
}

// RunApply executes shadcn-templ apply.
func RunApply(positional []string, opts ApplyOptions) error {
	cwd, err := filepath.Abs(opts.Cwd)
	if err != nil {
		return err
	}
	registryURL := registry.Resolve(opts.Registry)

	// Positional preset vs --preset, the resolveApplyPreset pendant.
	presetArg := opts.Preset
	if len(positional) > 1 {
		return fmt.Errorf("too many arguments. Usage: shadcn-templ apply <preset>")
	}
	if len(positional) == 1 {
		positionalPreset := strings.TrimSpace(positional[0])
		if presetArg != "" && positionalPreset != presetArg {
			return fmt.Errorf("received two different preset values. Use either the positional preset or --preset, or pass the same value to both")
		}
		presetArg = positionalPreset
	}

	// --only validation, the resolveApplyOnly/validateApplyOnlyPreset pendant.
	var only []string
	if opts.OnlySet {
		if opts.Only == "" {
			return fmt.Errorf("missing value for --only.\nUse one or more of: %s.\nExample: shadcn-templ apply <preset> --only theme,font", strings.Join(applyOnlyValues, ", "))
		}
		only, err = parseApplyOnlyParts(opts.Only)
		if err != nil {
			return err
		}
		if presetArg == "" {
			return fmt.Errorf("missing preset for --only.\nUse: shadcn-templ apply <preset> --only theme,font")
		}
	}

	config, err := utils.GetConfig(cwd)
	if err != nil {
		return err
	}
	if config == nil {
		return fmt.Errorf("no %s found at %s. Run 'shadcn-templ init' first", utils.ConfigFileName, cwd)
	}

	// No preset: point at the preset builder, the promptToOpenPresetBuilder
	// pendant without the browser open.
	if presetArg == "" {
		fmt.Printf("\n  Build your custom preset on %s/create\n", registry.SiteURL)
		fmt.Println("  Then run shadcn-templ apply --preset <preset> with the preset code or preset URL.")
		return nil
	}

	if err := validateApplyPreset(presetArg); err != nil {
		return err
	}

	// A preset URL may carry its own ?only= value.
	if only == nil {
		if urlOnly := presetURLOnly(presetArg); urlOnly != "" {
			only, err = parseApplyOnlyParts(urlOnly)
			if err != nil {
				return err
			}
		}
	}

	// Without --only every installed component is re-installed.
	var reinstallComponents []string
	if only == nil {
		reinstallComponents, err = installedComponents(config, registryURL)
		if err != nil {
			return err
		}
	}

	if !opts.Yes {
		fmt.Println()
		if only == nil {
			fmt.Println("Applying a new preset will overwrite existing UI components, fonts, and CSS variables.")
		} else {
			fmt.Println("Applying the selected preset parts will update your project configuration and styles.")
		}
		fmt.Println("Commit or stash your changes before continuing so you can easily go back.")
		if only == nil {
			fmt.Println("\n  The following components will be re-installed:")
			if len(reinstallComponents) > 0 {
				for i := 0; i < len(reinstallComponents); i += 8 {
					end := min(i+8, len(reinstallComponents))
					fmt.Printf("  - %s\n", strings.Join(reinstallComponents[i:end], ", "))
				}
			} else {
				fmt.Println("  - No installed UI components were detected.")
			}
		}
		fmt.Println()
		if !confirm("Would you like to continue?") {
			os.Exit(1)
		}
	}

	rtl := config.RTL != nil && *config.RTL
	initURL, err := resolvePresetInitURL(registryURL, presetArg, rtl, strings.Join(only, ","))
	if err != nil {
		return err
	}

	// Fetch the (partial) registry:base item and patch components.json.
	baseItem, err := registry.GetItem(registryURL, "", initURL, nil)
	if err != nil {
		return err
	}
	raw := config.RawConfig
	if baseItem.Config != nil {
		if baseItem.Config.Style != "" {
			raw.Style = baseItem.Config.Style
		}
		if baseItem.Config.IconLibrary != "" {
			raw.IconLibrary = baseItem.Config.IconLibrary
		}
		if baseItem.Config.RTL != nil {
			raw.RTL = baseItem.Config.RTL
		}
		if baseItem.Config.MenuColor != "" {
			raw.MenuColor = baseItem.Config.MenuColor
		}
		if baseItem.Config.MenuAccent != "" {
			raw.MenuAccent = baseItem.Config.MenuAccent
		}
		if baseItem.Config.Tailwind != nil && baseItem.Config.Tailwind.BaseColor != "" {
			raw.Tailwind.BaseColor = baseItem.Config.Tailwind.BaseColor
		}
		logf(opts.Silent, "Writing %s.\n", utils.ConfigFileName)
		if err := utils.WriteConfig(cwd, &raw); err != nil {
			return err
		}
		config, err = utils.ResolveConfigPaths(cwd, &raw)
		if err != nil {
			return err
		}
	}

	// syncApplyWorkspaceConfigs: the linked workspaces take the preset's
	// config. shadcn syncs after the install; here the ui workspace
	// resolves the registry tree, so it syncs first.
	if only == nil || slices.Contains(only, "theme") {
		if err := syncWorkspaceConfigs(config, func(other *utils.RawConfig) {
			other.Style = config.Style
			other.Tailwind.BaseColor = config.Tailwind.BaseColor
			other.Tailwind.CSSVariables = config.Tailwind.CSSVariables
			if config.IconLibrary != "" {
				other.IconLibrary = config.IconLibrary
			}
			if config.RTL != nil {
				other.RTL = config.RTL
			}
			if config.MenuColor != "" {
				other.MenuColor = config.MenuColor
			}
			if config.MenuAccent != "" {
				other.MenuAccent = config.MenuAccent
			}
		}); err != nil {
			return err
		}
	}

	components := append([]string{initURL}, reinstallComponents...)
	if err := addComponents(components, config, registryURL, addComponentsOptions{
		Overwrite:        true,
		OverwriteCssVars: true,
		Silent:           opts.Silent,
	}); err != nil {
		return err
	}

	logf(opts.Silent, "\nPreset applied successfully.\n")
	return nil
}

// validateApplyPreset is the validatePreset pendant.
func validateApplyPreset(presetArg string) error {
	if registry.IsURL(presetArg) || preset.IsPresetCode(presetArg) {
		return nil
	}
	if _, ok := defaultPresets[presetArg]; ok {
		return nil
	}
	return &unknownPresetError{name: presetArg}
}

// presetURLOnly is the getPresetUrlOnly pendant.
func presetURLOnly(presetArg string) string {
	if !registry.IsURL(presetArg) {
		return ""
	}
	u, err := url.Parse(presetArg)
	if err != nil || u.Path != "/init" {
		return ""
	}
	return u.Query().Get("only")
}

// installedComponents is the getProjectComponents pendant: the component
// directories under the ui components dir, translated to registry item names
// (the directory is flat "alertdialog", the item name "alert-dialog").
func installedComponents(config *utils.Config, registryURL string) ([]string, error) {
	entries, err := os.ReadDir(config.ResolvedPaths.UI)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	index, err := registry.GetIndex(registryURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch registry index: %w", err)
	}
	dirToName := map[string]string{}
	for _, item := range index.Items {
		if item.Type != "registry:ui" || len(item.Files) == 0 {
			continue
		}
		parts := strings.SplitN(item.Files[0].Path, "/", 3)
		if len(parts) >= 2 && parts[0] == "components" {
			dirToName[parts[1]] = item.Name
		}
	}

	var names []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if name, ok := dirToName[entry.Name()]; ok {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names, nil
}
