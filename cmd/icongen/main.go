package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
)

const (
	outputDir       = "./components/icon/"
	lucideRepoOwner = "lucide-icons"
	lucideRepoName  = "lucide"
)

type GitHubContent struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	DownloadUrl string `json:"download_url"`
}

type GitHubRelease struct {
	TagName string `json:"tag_name"`
}

type LucideRelease struct {
	Ref     string
	Version string
}

func main() {
	lucideRelease, err := fetchLatestLucideRelease()
	if err != nil {
		panic(fmt.Errorf("failed to fetch latest Lucide release: %w", err))
	}

	// Fetch the list of files from GitHub
	files, err := fetchGitHubContents(lucideRelease.Ref)
	if err != nil {
		panic(fmt.Errorf("failed to fetch GitHub contents: %w", err))
	}

	// Initialize slice for icon definitions
	var iconDefs []string
	iconDefs = append(iconDefs, "package icon\n")
	iconDefs = append(iconDefs, "// This file is auto generated\n")
	iconDefs = append(iconDefs, fmt.Sprintf("// Using Lucide icons version %s\n", lucideRelease.Version))

	// Create the output directory if it doesn't exist
	err = os.MkdirAll(outputDir, os.ModePerm)
	if err != nil {
		panic(fmt.Errorf("failed to create output directory %s: %w", outputDir, err))
	}

	// Create a wait group to synchronize the goroutines
	var wg sync.WaitGroup
	// Create a channel to limit the number of concurrent downloads
	semaphore := make(chan struct{}, 10) // Allow up to 10 concurrent downloads
	// Create a mutex to protect shared data structures
	var mu sync.Mutex
	iconDataEntries := make(map[string]string) // To store "iconName": "innerSvgContent"

	// Filter SVG files
	var svgFiles []GitHubContent
	for _, file := range files {
		if filepath.Ext(file.Name) == ".svg" {
			svgFiles = append(svgFiles, file)
		}
	}

	// Setup progress tracking
	total := len(svgFiles)
	fmt.Printf("Found %d SVG icons to process\n", total)

	var processed int32
	statusChan := make(chan bool)
	doneChan := make(chan bool)

	// Start progress reporter goroutine
	go func() {
		for {
			select {
			case <-statusChan:
				current := atomic.AddInt32(&processed, 1)
				percent := float64(current) / float64(total) * 100
				fmt.Printf("\rProcessing icons... [%d/%d] %.1f%% complete", current, total, percent)
			case <-doneChan:
				fmt.Println("\rProcessing icons... [100%] Complete!                ")
				return
			}
		}
	}()

	// Process each SVG file
	for _, file := range svgFiles {
		wg.Add(1)
		go func(file GitHubContent) {
			defer wg.Done()
			// Acquire a token from the semaphore
			semaphore <- struct{}{}
			defer func() {
				// Release the token back to the semaphore when done
				<-semaphore
			}()

			name := strings.TrimSuffix(file.Name, ".svg")
			funcName := toPascalCase(name)

			// Add icon definition (thread-safe)
			mu.Lock()
			iconDefs = append(iconDefs, fmt.Sprintf("var %s = Icon(%q)\n", funcName, name))
			mu.Unlock()

			// Download icon content
			contentBytes, err := downloadFile(file.DownloadUrl)
			if err != nil {
				fmt.Printf("\nError downloading %s: %v\n", file.Name, err)
				statusChan <- true
				return
			}

			// Extract inner SVG content
			innerContent := extractSVGContent(string(contentBytes))

			// Store inner content for icon_data.go (thread-safe)
			mu.Lock()
			iconDataEntries[name] = innerContent
			mu.Unlock()

			// Update status
			statusChan <- true
		}(file)
	}

	// Wait for all downloads to complete
	wg.Wait()

	// Signal the progress reporter to stop
	doneChan <- true

	// Write icon_defs.go
	sort.Strings(iconDefs[3:])
	outputFileDefs := filepath.Join(outputDir, "icon_defs.go")
	err = os.WriteFile(outputFileDefs, []byte(strings.Join(iconDefs, "")), 0644)
	if err != nil {
		panic(fmt.Errorf("failed to write icon_defs.go: %w", err))
	}
	fmt.Printf("Generated %s successfully!\n", outputFileDefs)

	// Write icon_data.go
	outputFileData := filepath.Join(outputDir, "icon_data.go")
	var iconDataContent strings.Builder
	iconDataContent.WriteString("package icon\n\n")
	iconDataContent.WriteString("// This file is auto generated\n")
	iconDataContent.WriteString(fmt.Sprintf("// Using Lucide icons version %s\n\n", lucideRelease.Version))
	iconDataContent.WriteString(fmt.Sprintf("const LucideVersion = %q\n\n", lucideRelease.Version))
	iconDataContent.WriteString("var internalSvgData = map[string]string{\n")
	iconNames := make([]string, 0, len(iconDataEntries))
	for name := range iconDataEntries {
		iconNames = append(iconNames, name)
	}
	sort.Strings(iconNames)
	for _, name := range iconNames {
		data := iconDataEntries[name]
		// Escape backticks in SVG data for multi-line string literals
		escapedData := strings.ReplaceAll(data, "`", "`+\"`\"+`")
		iconDataContent.WriteString(fmt.Sprintf("\t%q: `%s`,\n", name, escapedData))
	}
	iconDataContent.WriteString("}\n")

	err = os.WriteFile(outputFileData, []byte(iconDataContent.String()), 0644)
	if err != nil {
		panic(fmt.Errorf("failed to write icon_data.go: %w", err))
	}
	fmt.Printf("Generated %s successfully!\n", outputFileData)

	// Write icon.go
	outputFileIconGo := filepath.Join(outputDir, "icon.go")
	iconGoContent := `package icon

import (
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/a-h/templ"
)

// iconContents caches the fully generated SVG strings for icons that have been used,
// keyed by a composite key of name and props to handle different stylings.
var (
	iconContents = make(map[string]string)
	iconMutex    sync.RWMutex
)

// Props defines the properties that can be set for an icon.
type Props struct {
	Size        int
	Color       string
	Fill        string
	Stroke      string
	StrokeWidth string // Stroke Width of Icon, Usage: "2.5"
	Class       string
}

// Icon returns a function that generates a templ.Component for the specified icon name.
func Icon(name string) func(...Props) templ.Component {
	return func(props ...Props) templ.Component {
		var p Props
		if len(props) > 0 {
			p = props[0]
		}

		// Create a unique key for the cache based on icon name and all relevant props.
		// This ensures different stylings of the same icon are cached separately.
		cacheKey := fmt.Sprintf("%s|s:%d|c:%s|f:%s|sk:%s|sw:%s|cl:%s",
			name, p.Size, p.Color, p.Fill, p.Stroke, p.StrokeWidth, p.Class)

		return templ.ComponentFunc(func(ctx context.Context, w io.Writer) (err error) {
			iconMutex.RLock()
			svg, cached := iconContents[cacheKey]
			iconMutex.RUnlock()

			if cached {
				_, err = w.Write([]byte(svg))
				return err
			}

			// Not cached, generate it
			// The actual generation now happens once and is cached.
			generatedSvg, err := generateSVG(name, p) // p (Props) is passed to generateSVG
			if err != nil {
				// Provide more context in the error message
				return fmt.Errorf("failed to generate svg for icon '%s' with props %+v: %w", name, p, err)
			}

			iconMutex.Lock()
			iconContents[cacheKey] = generatedSvg
			iconMutex.Unlock()

			_, err = w.Write([]byte(generatedSvg))
			return err
		})
	}
}

// generateSVG creates an SVG string for the specified icon with the given properties.
// This function is called when an icon-prop combination is not yet in the cache.
func generateSVG(name string, props Props) (string, error) {
	// Get the raw, inner SVG content for the icon name from our internal data map.
	content, err := getIconContent(name) // This now reads from internalSvgData
	if err != nil {
		return "", err // Error from getIconContent already includes icon name
	}

	size := props.Size
	if size <= 0 {
		size = 24 // Default size
	}

	fill := props.Fill
	if fill == "" {
		fill = "none" // Default fill
	}

	stroke := props.Stroke
	if stroke == "" {
		stroke = props.Color // Fallback to Color if Stroke is not set
	}
	if stroke == "" {
		stroke = "currentColor" // Default stroke color
	}

	strokeWidth := props.StrokeWidth
	if strokeWidth == "" {
		strokeWidth = "2" // Default stroke width
	}

	// Construct the final SVG string.
	// The attributes lucide-react renders.
	return fmt.Sprintf("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%d\" height=\"%d\" viewBox=\"0 0 24 24\" fill=\"%s\" stroke=\"%s\" stroke-width=\"%s\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"%s\">%s</svg>",
		size, size, fill, stroke, strokeWidth, props.Class, content), nil
}

// getIconContent retrieves the raw inner SVG content for a given icon name.
// It reads from the pre-generated internalSvgData map from icon_data.go.
func getIconContent(name string) (string, error) {
	content, exists := internalSvgData[name]
	if !exists {
		return "", fmt.Errorf("icon '%s' not found in internalSvgData map", name)
	}
	return content, nil
}
`
	err = os.WriteFile(outputFileIconGo, []byte(iconGoContent), 0644)
	if err != nil {
		panic(fmt.Errorf("failed to write icon.go: %w", err))
	}
	fmt.Printf("Generated %s successfully!\n", outputFileIconGo)

	fmt.Println("Icon component files generated successfully in " + outputDir)
}

// toPascalCase converts a kebab-case string to PascalCase
func toPascalCase(s string) string {
	words := strings.Split(s, "-")
	for i, word := range words {
		words[i] = strings.Title(word)
	}
	return strings.Join(words, "")
}

// fetchLatestLucideRelease resolves the latest Lucide GitHub release and uses it as the single source of truth.
func fetchLatestLucideRelease() (LucideRelease, error) {
	fmt.Println("Fetching latest Lucide release from GitHub repository...")

	releaseURL := fmt.Sprintf(
		"https://api.github.com/repos/%s/%s/releases/latest",
		lucideRepoOwner,
		lucideRepoName,
	)

	req, err := http.NewRequest("GET", releaseURL, nil)
	if err != nil {
		return LucideRelease{}, err
	}

	req.Header.Add("Accept", "application/vnd.github.v3+json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return LucideRelease{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return LucideRelease{}, fmt.Errorf("latest release lookup returned status code %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return LucideRelease{}, err
	}

	var release GitHubRelease
	if err := json.Unmarshal(body, &release); err != nil {
		return LucideRelease{}, err
	}

	if release.TagName == "" {
		return LucideRelease{}, fmt.Errorf("latest release response did not contain a tag_name")
	}

	version := strings.TrimPrefix(release.TagName, "v")
	fmt.Printf("Using Lucide version %s from release tag %s\n", version, release.TagName)
	return LucideRelease{
		Ref:     release.TagName,
		Version: version,
	}, nil
}

// fetchGitHubContents fetches the list of files from a GitHub repository directory
func fetchGitHubContents(ref string) ([]GitHubContent, error) {
	fmt.Println("Fetching icons from GitHub repository...")

	// Instead of using the API, let's use a direct approach to get all icons
	// The API has pagination limits, but we can get file listings from the tree endpoint
	treeUrl := fmt.Sprintf(
		"https://api.github.com/repos/%s/%s/git/trees/%s?recursive=1",
		lucideRepoOwner,
		lucideRepoName,
		ref,
	)

	req, err := http.NewRequest("GET", treeUrl, nil)
	if err != nil {
		return nil, err
	}

	// Add GitHub API headers
	req.Header.Add("Accept", "application/vnd.github.v3+json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status code %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Parse the tree response
	type TreeItem struct {
		Path string `json:"path"`
		Type string `json:"type"`
		Url  string `json:"url"`
	}

	type TreeResponse struct {
		Tree []TreeItem `json:"tree"`
	}

	var treeResp TreeResponse
	if err := json.Unmarshal(body, &treeResp); err != nil {
		return nil, err
	}

	// Filter for SVG files in the icons directory
	var contents []GitHubContent
	for _, item := range treeResp.Tree {
		if strings.HasPrefix(item.Path, "icons/") && strings.HasSuffix(item.Path, ".svg") {
			// Extract the filename from the path
			filename := filepath.Base(item.Path)

			// Create a GitHubContent entry
			content := GitHubContent{
				Name: filename,
				Path: item.Path,
				DownloadUrl: fmt.Sprintf(
					"https://raw.githubusercontent.com/%s/%s/%s/%s",
					lucideRepoOwner,
					lucideRepoName,
					ref,
					item.Path,
				),
			}
			contents = append(contents, content)
		}
	}

	if len(contents) == 0 {
		return nil, fmt.Errorf("no SVG files found in the icons directory")
	}

	fmt.Printf("Found %d icons in the repository\n", len(contents))
	return contents, nil
}

// downloadFile downloads a file from a URL
func downloadFile(url string) ([]byte, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download returned status code %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

// extractSVGContent removes the outer SVG tags from the icon content.
func extractSVGContent(svgContent string) string {
	start := strings.Index(svgContent, ">") + 1
	end := strings.LastIndex(svgContent, "</svg>")
	if start == -1 || end == -1 || start >= end {
		// Return an empty string or the original content if tags are not found or invalid
		// This prevents panics with malformed SVGs.
		// Log a warning if this happens frequently.
		// fmt.Printf("Warning: Could not extract content from SVG: %s\n", svgContent)
		return ""
	}
	return strings.TrimSpace(svgContent[start:end])
}
