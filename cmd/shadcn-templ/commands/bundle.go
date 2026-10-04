package commands

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"

	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils/updaters"
	"github.com/fsnotify/fsnotify"
)

type BundleOptions struct {
	Cwd           string
	Silent, Watch bool
}

func NewBundleFlagSet(opts *BundleOptions) *flag.FlagSet {
	fs := flag.NewFlagSet("bundle", flag.ContinueOnError)
	fs.StringVar(&opts.Cwd, "cwd", ".", "the working directory")
	fs.BoolVar(&opts.Silent, "silent", false, "mute output")
	fs.BoolVar(&opts.Watch, "watch", false, "watch component scripts")
	return fs
}

func RunBundle(opts BundleOptions) error {
	cwd, err := filepath.Abs(opts.Cwd)
	if err != nil {
		return err
	}
	config, err := utils.GetConfig(cwd)
	if err != nil {
		return err
	}
	if config == nil {
		return fmt.Errorf("no components.json found at %s; run 'shadcn-templ init' first", cwd)
	}
	build := func() error {
		defaulted := config.ScriptsDefaulted
		paths, written, err := updaters.UpdateScripts(config)
		if err != nil {
			return err
		}
		if written || !opts.Watch {
			for _, path := range paths {
				logf(opts.Silent, "Bundle: %s\n", utils.DisplayPath(config, path))
			}
		}
		if defaulted {
			logf(opts.Silent, "Serve %s at %s.\n", config.Scripts.Dir, config.Scripts.Path)
		}
		return nil
	}
	if !opts.Watch {
		return build()
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	return watchScripts(ctx, config.ResolvedPaths.Components, build)
}

func watchScripts(ctx context.Context, dir string, build func() error) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer watcher.Close()
	addDirs := func() error {
		if err := watcher.Add(dir); err != nil {
			return err
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if entry.IsDir() {
				if err := watcher.Add(filepath.Join(dir, entry.Name())); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := addDirs(); err != nil {
		return err
	}
	if err := build(); err != nil {
		return err
	}
	var timer *time.Timer
	var tick <-chan time.Time
	defer func() {
		if timer != nil {
			timer.Stop()
		}
	}()
	for {
		select {
		case <-ctx.Done():
			return nil
		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			return err
		case event, ok := <-watcher.Events:
			if !ok {
				return nil
			}
			if !event.Has(fsnotify.Create | fsnotify.Write | fsnotify.Remove | fsnotify.Rename) {
				continue
			}
			rel, err := filepath.Rel(dir, event.Name)
			if err != nil {
				return err
			}
			parts := strings.Split(rel, string(filepath.Separator))
			relevant := len(parts) == 2 && strings.HasSuffix(rel, ".js") && !strings.HasSuffix(rel, ".min.js")
			if len(parts) == 1 {
				if event.Has(fsnotify.Create) {
					if err := addDirs(); err != nil {
						return err
					}
				}
				relevant = event.Has(fsnotify.Create | fsnotify.Remove | fsnotify.Rename)
			}
			if !relevant {
				continue
			}
			if timer != nil {
				timer.Stop()
			}
			timer = time.NewTimer(100 * time.Millisecond)
			tick = timer.C
		case <-tick:
			tick = nil
			if err := build(); err != nil {
				return err
			}
		}
	}
}
