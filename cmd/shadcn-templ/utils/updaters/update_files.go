// update_files.go ports update-files.ts: resolve target paths, transform
// content and write files with created/updated/skipped accounting. The
// transformer pendant is the import rewrite the old shadcn-templ CLI already had:
// github.com/axadrn/shadcn-templ/v2/{components,utils}/... imports become the user's
// own module paths.
package updaters

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/registry"
	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/utils"
)

// UpdateFilesOptions mirrors the update-files.ts options the CLI uses.
type UpdateFilesOptions struct {
	Overwrite bool
	Silent    bool
	// Path overrides the components target directory (--path).
	Path string
}

// UpdateFilesResult is the files summary of update-files.ts.
type UpdateFilesResult struct {
	FilesCreated []string
	FilesUpdated []string
	FilesSkipped []string
}

// HasJS reports whether a component script file was written (the Scripts()
// reminder trigger).
func (r UpdateFilesResult) HasJS() bool {
	for _, files := range [][]string{r.FilesCreated, r.FilesUpdated} {
		for _, file := range files {
			if strings.HasSuffix(file, ".js") {
				return true
			}
		}
	}
	return false
}

// UpdateFiles writes the resolved registry files into the project.
func UpdateFiles(files []registry.ItemFile, config *utils.Config, options UpdateFilesOptions) (UpdateFilesResult, error) {
	var result UpdateFilesResult
	if len(files) == 0 {
		return result, nil
	}

	if !options.Silent {
		fmt.Println("Updating files.")
	}

	for _, file := range files {
		if file.Content == "" {
			continue
		}

		targetPath, err := resolveFilePath(file, config, options.Path)
		if err != nil {
			return result, err
		}
		relPath := utils.DisplayPath(config, targetPath)

		content := transformContent(file, config)

		existing, err := os.ReadFile(targetPath)
		fileExists := err == nil

		if fileExists && string(existing) == content {
			result.FilesSkipped = append(result.FilesSkipped, relPath)
			continue
		}
		if fileExists && !options.Overwrite {
			result.FilesSkipped = append(result.FilesSkipped, relPath)
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return result, err
		}
		if err := os.WriteFile(targetPath, []byte(content), 0o644); err != nil {
			return result, fmt.Errorf("failed to write %s: %w", targetPath, err)
		}

		if fileExists {
			result.FilesUpdated = append(result.FilesUpdated, relPath)
		} else {
			result.FilesCreated = append(result.FilesCreated, relPath)
		}
	}

	if !options.Silent {
		printFileSummary("Created", result.FilesCreated, "")
		printFileSummary("Updated", result.FilesUpdated, "")
		printFileSummary("Skipped", result.FilesSkipped, " (use --overwrite to overwrite)")
	}

	return result, nil
}

func printFileSummary(verb string, files []string, suffix string) {
	if len(files) == 0 {
		return
	}
	noun := "files"
	if len(files) == 1 {
		noun = "file"
	}
	fmt.Printf("%s %d %s:%s\n", verb, len(files), noun, suffix)
	for _, file := range files {
		fmt.Printf("  - %s\n", file)
	}
}

// resolveFilePath is the resolveFilePath pendant: an explicit target wins
// (shadcn resolves block pages onto their target path), then registry paths
// map onto the configured directories by type
// ("components/button/button.templ" -> <components dir>/button/button.templ,
// "utils/shadcn-templ.go" -> <utils dir>/shadcn-templ.go).
func resolveFilePath(file registry.ItemFile, config *utils.Config, pathOverride string) (string, error) {
	switch {
	case file.Target != "":
		base := config.ResolvedPaths.Cwd
		if pathOverride != "" {
			base = filepath.Join(config.ResolvedPaths.Cwd, filepath.FromSlash(pathOverride))
		}
		return filepath.Join(base, filepath.FromSlash(file.Target)), nil
	case strings.HasPrefix(file.Path, "components/"):
		base := config.ResolvedPaths.Components
		if pathOverride != "" {
			base = filepath.Join(config.ResolvedPaths.Cwd, filepath.FromSlash(pathOverride))
		}
		return filepath.Join(base, filepath.FromSlash(strings.TrimPrefix(file.Path, "components/"))), nil
	case strings.HasPrefix(file.Path, "blocks/"):
		// Blocks install under <components dir>/blocks/, mirroring the
		// repo's ui/blocks sibling split.
		base := config.ResolvedPaths.Components
		if pathOverride != "" {
			base = filepath.Join(config.ResolvedPaths.Cwd, filepath.FromSlash(pathOverride))
		}
		return filepath.Join(base, "blocks", filepath.FromSlash(strings.TrimPrefix(file.Path, "blocks/"))), nil
	case strings.HasPrefix(file.Path, "utils/"):
		return filepath.Join(config.ResolvedPaths.Utils, filepath.FromSlash(strings.TrimPrefix(file.Path, "utils/"))), nil
	case file.Type == "registry:lib":
		return filepath.Join(config.ResolvedPaths.Utils, filepath.Base(file.Path)), nil
	default:
		base := config.ResolvedPaths.Components
		if pathOverride != "" {
			base = filepath.Join(config.ResolvedPaths.Cwd, filepath.FromSlash(pathOverride))
		}
		return filepath.Join(base, filepath.Base(file.Path)), nil
	}
}

var moduleImportRe = regexp.MustCompile(`"github\.com/axadrn/shadcn-templ/([^"]+)"`)

// transformContent rewrites module imports and the package clause for Go and
// templ sources; other files (component .js) ship verbatim.
func transformContent(file registry.ItemFile, config *utils.Config) string {
	if !strings.HasSuffix(file.Path, ".go") && !strings.HasSuffix(file.Path, ".templ") {
		return file.Content
	}

	content := moduleImportRe.ReplaceAllStringFunc(file.Content, func(match string) string {
		repoPath := strings.Trim(strings.TrimPrefix(match, `"github.com/axadrn/shadcn-templ/v2/`), `"`)
		switch {
		case strings.HasPrefix(repoPath, "components/"):
			return `"` + config.Aliases.Components + `/` + strings.TrimPrefix(repoPath, "components/") + `"`
		case strings.HasPrefix(repoPath, "blocks/"):
			return `"` + config.Aliases.Components + `/blocks/` + strings.TrimPrefix(repoPath, "blocks/") + `"`
		case repoPath == "utils":
			return `"` + config.Aliases.Utils + `"`
		case strings.HasPrefix(repoPath, "utils/"):
			return `"` + config.Aliases.Utils + `/` + strings.TrimPrefix(repoPath, "utils/") + `"`
		}
		return match
	})

	// Files installed at the components root form the package imported by the
	// app for Scripts. Keep its package name aligned with aliases.components.
	componentsRootFile := isComponentsRootFile(file.Path)
	if componentsRootFile {
		if pkg := lastSegment(config.Aliases.Components); pkg != "" && pkg != "components" {
			content = strings.Replace(content, "package components", "package "+pkg, 1)
		}
	}

	// Utils files keep their package name in sync with the target directory.
	if !componentsRootFile && (strings.HasPrefix(file.Path, "utils/") || file.Type == "registry:lib") {
		if pkg := lastSegment(config.Aliases.Utils); pkg != "" && pkg != "utils" {
			content = strings.Replace(content, "package utils", "package "+pkg, 1)
		}
	}

	return content
}

func isComponentsRootFile(path string) bool {
	rel, ok := strings.CutPrefix(path, "components/")
	return ok && !strings.Contains(rel, "/")
}

func lastSegment(importPath string) string {
	if idx := strings.LastIndex(importPath, "/"); idx >= 0 {
		return importPath[idx+1:]
	}
	return importPath
}
