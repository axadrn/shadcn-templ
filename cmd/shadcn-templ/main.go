// The shadcn-templ CLI, the pendant of shadcn/src/index.ts: command wiring for
// init, add, apply and preset. Commands live in ./commands, one file per
// command like the reference.
//
// Reference commands without a pendant-meaningful equivalent are dropped:
// diff/docs/view/search/migrate/eject/info/build/mcp/registry (they cover
// npm registries, React codemods and MCP servers). shadcn has no plain
// `list` either, so the old shadcn-templ list command is gone; upgrade is
// `go install github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ@latest`.
package main

import (
	"flag"
	"fmt"
	"os"
	"runtime/debug"

	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/commands"
)

// version is detected from build info (module version for go install,
// vcs revision for source builds).
func version() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "dev"
	}
	if info.Main.Version != "" && info.Main.Version != "(devel)" {
		return info.Main.Version
	}
	var revision, modified string
	for _, setting := range info.Settings {
		switch setting.Key {
		case "vcs.revision":
			revision = setting.Value
			if len(revision) > 7 {
				revision = revision[:7]
			}
		case "vcs.modified":
			modified = setting.Value
		}
	}
	if revision != "" {
		if modified == "true" {
			return "dev-" + revision + "-dirty"
		}
		return "dev-" + revision
	}
	return "dev"
}

const usage = `shadcn-templ - add components and dependencies to your project

Usage:
  shadcn-templ init [name] [--template <templ>] [--monorepo] [--preset <code|url|name>] [--base-color <color>] [--css <path>] [--force] [--silent] [--registry <url>]
  shadcn-templ add <components...|url> [--all] [--overwrite] [--path <path>] [--silent] [--registry <url>]
  shadcn-templ bundle [--cwd <path>] [--silent] [--watch]
  shadcn-templ apply <preset> [--only theme|font] [--yes] [--silent] [--registry <url>]
  shadcn-templ preset decode <code> [--json]
  shadcn-templ preset resolve [--json]
  shadcn-templ preset url <code>
  shadcn-templ -v, --version

The registry defaults to ` + "https://shadcn-templ.com" + ` and can be overridden with
--registry or the SHADCN_TEMPL_REGISTRY environment variable.`

// parseFlags parses a FlagSet over args, collecting positional arguments
// even when they are interleaved with flags.
func parseFlags(fs *flag.FlagSet, args []string) ([]string, error) {
	var positional []string
	for {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		args = fs.Args()
		if len(args) == 0 {
			return positional, nil
		}
		positional = append(positional, args[0])
		args = args[1:]
	}
}

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		fmt.Println(usage)
		os.Exit(1)
	}

	var err error
	switch args[0] {
	case "-v", "--version", "version":
		fmt.Printf("shadcn-templ %s\n", version())
	case "-h", "--help", "help":
		fmt.Println(usage)
	case "init":
		var opts commands.InitOptions
		fs := commands.NewInitFlagSet(&opts)
		var rest []string
		if rest, err = parseFlags(fs, args[1:]); err == nil {
			if len(rest) > 0 {
				opts.ProjectName = rest[0]
			}
			err = commands.RunInit(opts)
		}
	case "add":
		var opts commands.AddOptions
		fs := commands.NewAddFlagSet(&opts)
		var components []string
		if components, err = parseFlags(fs, args[1:]); err == nil {
			err = commands.RunAdd(components, opts)
		}
	case "bundle":
		var opts commands.BundleOptions
		fs := commands.NewBundleFlagSet(&opts)
		var rest []string
		if rest, err = parseFlags(fs, args[1:]); err == nil {
			if len(rest) != 0 {
				err = fmt.Errorf("bundle takes no positional arguments")
			} else {
				err = commands.RunBundle(opts)
			}
		}
	case "apply":
		var opts commands.ApplyOptions
		fs := commands.NewApplyFlagSet(&opts)
		var positional []string
		if positional, err = parseFlags(fs, args[1:]); err == nil {
			err = commands.RunApply(positional, opts)
		}
	case "preset":
		err = runPreset(args[1:])
	default:
		fmt.Printf("Unknown command %q.\n\n%s\n", args[0], usage)
		os.Exit(1)
	}

	if err != nil {
		if err == flag.ErrHelp {
			os.Exit(0)
		}
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

// runPreset dispatches the preset subcommands (decode, resolve, url).
func runPreset(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: shadcn-templ preset <decode|resolve|url>")
	}

	switch args[0] {
	case "decode":
		jsonFs := flag.NewFlagSet("preset decode", flag.ContinueOnError)
		jsonOut := jsonFs.Bool("json", false, "output as JSON")
		positional, err := parseFlags(jsonFs, args[1:])
		if err != nil {
			return err
		}
		if len(positional) != 1 {
			return fmt.Errorf("usage: shadcn-templ preset decode <code>")
		}
		return commands.RunPresetDecode(positional[0], *jsonOut)
	case "resolve", "info":
		var opts commands.PresetResolveOptions
		fs := commands.NewPresetResolveFlagSet(&opts)
		if _, err := parseFlags(fs, args[1:]); err != nil {
			return err
		}
		return commands.RunPresetResolve(opts)
	case "url":
		if len(args) != 2 {
			return fmt.Errorf("usage: shadcn-templ preset url <code>")
		}
		return commands.RunPresetURL(args[1])
	default:
		return fmt.Errorf("unknown preset subcommand %q. Use decode, resolve or url", args[0])
	}
}
