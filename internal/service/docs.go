package service

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/axadrn/shadcn-templ/v2/internal/markdown"
	"github.com/axadrn/shadcn-templ/v2/internal/shared"
	"github.com/axadrn/shadcn-templ/v2/internal/ui/modules"
	"github.com/axadrn/shadcn-templ/v2/internal/ui/examples"
)

//go:embed all:content/docs
var contentFS embed.FS

// readContent prefers the on-disk source in development, so markdown edits
// show up on reload without recompiling the embedded copy. Falls back to
// the embed for built binaries. Self-referencing shadcn-templ.com URLs are rebased
// onto BaseURL, so rendered pages and raw .md exports link the running origin.
func readContent(path string) ([]byte, error) {
	if b, err := os.ReadFile(filepath.Join("internal/service", path)); err == nil {
		return shared.Rebase(b), nil
	}
	b, err := contentFS.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return shared.Rebase(b), nil
}

type DocsService struct {
	parser *markdown.Parser
}

type DocPage struct {
	Slug        string
	Title       string
	Description string
	Order       int
	Segments    []markdown.Segment
	TOC         []modules.TableOfContentsItem
}

func NewDocsService() *DocsService {
	return &DocsService{
		parser: markdown.NewParser(),
	}
}

// ComponentDocPage is a component doc authored as markdown with shortcodes
// (the shadcn mdx pendant).
type ComponentDocPage struct {
	Slug        string
	Title       string
	Description string
	Segments    []markdown.Segment
	TOC         []modules.TableOfContentsItem
}

// HasComponentPage reports whether a markdown source exists for the slug.
func (s *DocsService) HasComponentPage(slug string) bool {
	_, err := readContent(filepath.Join("content/docs/components", slug+".md"))
	return err == nil
}

// GetComponentPage loads a component doc (markdown + shortcodes) by slug.
func (s *DocsService) GetComponentPage(slug string) (*ComponentDocPage, error) {
	source, err := readContent(filepath.Join("content/docs/components", slug+".md"))
	if err != nil {
		return nil, fmt.Errorf("failed to read component doc: %w", err)
	}
	segments, meta, toc, err := s.parser.ParseSegments(source)
	if err != nil {
		return nil, fmt.Errorf("failed to parse component doc: %w", err)
	}
	page := &ComponentDocPage{Slug: slug, Segments: segments, TOC: toc}
	if title, ok := meta["title"].(string); ok {
		page.Title = title
	}
	if desc, ok := meta["description"].(string); ok {
		page.Description = desc
	}
	return page, nil
}

// GetPage loads and parses a markdown document by slug. Like the component
// docs, the source runs through the segment pipeline so the shadcn mdx
// shortcodes (Callout, Steps, CodeCollapsibleWrapper, ...) work here too.
func (s *DocsService) GetPage(slug string) (*DocPage, error) {
	// Construct file path
	mdPath := filepath.Join("content/docs", slug+".md")

	// Read markdown file (disk in dev, embed in builds)
	content, err := readContent(mdPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read markdown file: %w", err)
	}

	segments, meta, toc, err := s.parser.ParseSegments(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse markdown: %w", err)
	}

	// Extract metadata
	page := &DocPage{
		Slug:     slug,
		Segments: segments,
		TOC:      toc,
	}

	if title, ok := meta["title"].(string); ok {
		page.Title = title
	}
	if desc, ok := meta["description"].(string); ok {
		page.Description = desc
	}
	if order, ok := meta["order"].(int); ok {
		page.Order = order
	}

	return page, nil
}

// GetPageSource returns the raw markdown of a root docs page for the
// exported <slug>.md view (the copy-page menu).
func (s *DocsService) GetPageSource(slug string) ([]byte, error) {
	return readContent(filepath.Join("content/docs", slug+".md"))
}

// GetComponentPageSource returns the markdown of a component doc for the
// exported <slug>.md view: like shadcn, ComponentPreview shortcodes are
// expanded to the demo source as fenced code blocks.
func (s *DocsService) GetComponentPageSource(slug string) ([]byte, error) {
	source, err := readContent(filepath.Join("content/docs/components", slug+".md"))
	if err != nil {
		return nil, err
	}
	return markdown.ExpandPreviewShortcodes(source, func(name string) ([]byte, bool) {
		entry, ok := examples.Registry[name]
		if !ok {
			return nil, false
		}
		code, err := examples.TemplFiles.ReadFile(entry.File)
		if err != nil {
			return nil, false
		}
		return code, true
	}), nil
}

// ChangelogPage is one changelog entry, the pendant of lib/changelog.ts's
// ChangelogPageData: an entry file under content/docs/changelog/ with
// title/description/date frontmatter.
type ChangelogPage struct {
	Slug        string
	Title       string
	Description string
	Date        time.Time
	Segments    []markdown.Segment
	TOC         []modules.TableOfContentsItem
}

// GetChangelogPages returns all changelog entries sorted by date descending,
// the pendant of getChangelogPages.
func (s *DocsService) GetChangelogPages() ([]*ChangelogPage, error) {
	// Disk first like readContent, so new entries appear in dev without a
	// rebuild; the embed serves built binaries.
	entries, err := os.ReadDir("internal/service/content/docs/changelog")
	if err != nil {
		entries2, err2 := contentFS.ReadDir("content/docs/changelog")
		if err2 != nil {
			return nil, err2
		}
		pages := make([]*ChangelogPage, 0, len(entries2))
		for _, entry := range entries2 {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
				continue
			}
			page, err := s.GetChangelogPage(strings.TrimSuffix(entry.Name(), ".md"))
			if err != nil {
				return nil, err
			}
			pages = append(pages, page)
		}
		sort.Slice(pages, func(i, j int) bool { return pages[i].Date.After(pages[j].Date) })
		return pages, nil
	}
	pages := make([]*ChangelogPage, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		page, err := s.GetChangelogPage(strings.TrimSuffix(entry.Name(), ".md"))
		if err != nil {
			return nil, err
		}
		pages = append(pages, page)
	}
	sort.Slice(pages, func(i, j int) bool { return pages[i].Date.After(pages[j].Date) })
	return pages, nil
}

// GetChangelogPage loads one changelog entry by slug.
func (s *DocsService) GetChangelogPage(slug string) (*ChangelogPage, error) {
	content, err := readContent(filepath.Join("content/docs/changelog", slug+".md"))
	if err != nil {
		return nil, err
	}
	segments, meta, toc, err := s.parser.ParseSegments(content)
	if err != nil {
		return nil, err
	}
	page := &ChangelogPage{Slug: slug, Segments: segments, TOC: toc}
	if title, ok := meta["title"].(string); ok {
		page.Title = title
	}
	if desc, ok := meta["description"].(string); ok {
		page.Description = desc
	}
	switch d := meta["date"].(type) {
	case string:
		page.Date, _ = time.Parse("2006-01-02", d)
	case time.Time:
		page.Date = d
	}
	return page, nil
}

// GetChangelogPageSource returns the raw markdown of a changelog entry.
func (s *DocsService) GetChangelogPageSource(slug string) ([]byte, error) {
	return readContent(filepath.Join("content/docs/changelog", slug+".md"))
}

// The components overview is a templ page, not a markdown file, so its title
// and description live here: the page and the exported markdown read the same
// two strings and cannot drift apart.
const (
	ComponentsIndexTitle       = "Components"
	ComponentsIndexDescription = "Here you can find all the components available in the library. We are working on adding more components."
)

// ComponentsIndexSource builds the markdown of the components overview for the
// exported /docs/components.md, the pendant of the reference's export of
// content/docs/components/index.mdx: frontmatter, then the New Components and
// All Components lists in the order the page renders them, every entry an
// absolute link carrying the description from the component doc's frontmatter.
// The reference closes with a pointer to its registry directory; shadcn-templ
// has no directory page, so that section stays out, like the nav is without it.
func (s *DocsService) ComponentsIndexSource() []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "---\ntitle: %s\ndescription: %s\n---\n", ComponentsIndexTitle, ComponentsIndexDescription)
	if shared.HasNewComponents() {
		b.WriteString("\n## New Components\n\n")
		s.writeComponentList(&b, true)
	}
	b.WriteString("\n## All Components\n\n")
	s.writeComponentList(&b, false)
	return []byte(b.String())
}

// writeComponentList writes one list of component links, the markdown pendant
// of the page's componentsGrid: onlyNew keeps the PagesNew members, like the
// grid's New Components pass.
func (s *DocsService) writeComponentList(b *strings.Builder, onlyNew bool) {
	base := shared.BaseURL()
	for _, section := range shared.Sections {
		if section.Title != "Components" {
			continue
		}
		for _, link := range section.Links {
			if onlyNew && !shared.PageIsNew(link.Href) {
				continue
			}
			title, description := s.componentMeta(strings.TrimPrefix(link.Href, "/docs/components/"))
			if title == "" {
				title = link.Text
			}
			fmt.Fprintf(b, "- [%s](%s%s)", title, base, link.Href)
			if description != "" {
				fmt.Fprintf(b, ": %s", description)
			}
			b.WriteString("\n")
		}
	}
}

// componentMeta reads a component doc's frontmatter title and description
// without parsing its body.
func (s *DocsService) componentMeta(slug string) (title, description string) {
	source, err := readContent(filepath.Join("content/docs/components", slug+".md"))
	if err != nil {
		return "", ""
	}
	meta := s.parser.Frontmatter(source)
	title, _ = meta["title"].(string)
	description, _ = meta["description"].(string)
	return title, description
}
