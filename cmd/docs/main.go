package main

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/a-h/templ"

	"github.com/axadrn/shadcn-templ/v2/assets"
	"github.com/axadrn/shadcn-templ/v2/blocks/dashboard01"
	"github.com/axadrn/shadcn-templ/v2/internal/config"
	"github.com/axadrn/shadcn-templ/v2/internal/middleware"
	"github.com/axadrn/shadcn-templ/v2/internal/og"
	"github.com/axadrn/shadcn-templ/v2/internal/registry"
	"github.com/axadrn/shadcn-templ/v2/internal/registryapi"
	"github.com/axadrn/shadcn-templ/v2/internal/service"
	"github.com/axadrn/shadcn-templ/v2/internal/shared"
	"github.com/axadrn/shadcn-templ/v2/internal/ui/blocks"
	"github.com/axadrn/shadcn-templ/v2/internal/ui/charts"
	"github.com/axadrn/shadcn-templ/v2/internal/ui/examples"
	_ "github.com/axadrn/shadcn-templ/v2/internal/ui/examples/all"
	"github.com/axadrn/shadcn-templ/v2/internal/ui/modules"
	"github.com/axadrn/shadcn-templ/v2/internal/ui/pages"
	"github.com/axadrn/shadcn-templ/v2/static"
)

// htmxHandler wraps a templ component to support HTMX fragment requests
func htmxHandler(component templ.Component) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if middleware.IsHtmxRequest(r) {
			// For HTMX requests, render content, toc, and title fragments
			// The toc and title fragments have hx-swap-oob attribute for out-of-band swap
			templ.Handler(component, templ.WithFragments("content", "toc", "title")).ServeHTTP(w, r)
		} else {
			// For regular requests, render the full page
			templ.Handler(component).ServeHTTP(w, r)
		}
	})
}

// inlineDelivery is the site's pendant of shadcn's build-time class
// transform: every HTML page is delivered through the same inliner that
// compiles the registry and the docs previews. The browser never sees raw
// cn-* classes, and the menu config markers resolve like a default
// install - exactly what shadcn's site build produces.
func inlineDelivery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Assets and the script bundle are never HTML - skip the buffer.
		// The create designer stays raw: its preview JS is the live
		// transformer (create-preview.js toggles the cn-menu-* markers per
		// picked menuColor), exactly like shadcn's designer.
		if strings.HasPrefix(r.URL.Path, "/assets/") ||
			r.URL.Path == "/create" ||
			strings.HasPrefix(r.URL.Path, "/create/") {
			next.ServeHTTP(w, r)
			return
		}

		buf := &bufferedResponse{header: make(http.Header), status: http.StatusOK}
		next.ServeHTTP(buf, r)

		body := buf.body.Bytes()
		// Handlers that render straight to the writer never set a
		// Content-Type - sniff like net/http does before deciding.
		contentType := buf.header.Get("Content-Type")
		if contentType == "" {
			contentType = http.DetectContentType(body)
		}
		if strings.HasPrefix(contentType, "text/html") {
			body = []byte(modules.InlineSiteHTML(string(body)))
		}
		for key, values := range buf.header {
			if key == "Content-Length" {
				continue
			}
			w.Header()[key] = values
		}
		w.WriteHeader(buf.status)
		w.Write(body)
	})
}

// bufferedResponse captures a handler's response so inlineDelivery can
// transform the HTML before it goes out.
type bufferedResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (b *bufferedResponse) Header() http.Header { return b.header }

func (b *bufferedResponse) WriteHeader(status int) { b.status = status }

func (b *bufferedResponse) Write(p []byte) (int, error) { return b.body.Write(p) }

func main() {
	mux := http.NewServeMux()
	config.LoadConfig()

	SetupAssetsRoutes(mux)

	// Initialize markdown docs service
	docsService := service.NewDocsService()

	wrappedMux := middleware.WithURLPathValue(
		middleware.CacheControlMiddleware(
			middleware.GitHubStarsMiddleware(
				inlineDelivery(mux),
			),
		),
	)

	// The static artifacts are generated with the default origin baked in;
	// rebased onto BASE_URL at serve time so the beta deploy links itself.
	serveStaticRebased := func(name, contentType string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			content, err := static.Files.ReadFile(name)
			if err != nil {
				http.Error(w, name+" not found", http.StatusNotFound)
				return
			}
			content = shared.Rebase(content)
			w.Header().Set("Content-Type", contentType)
			w.Write(content)
		}
	}
	mux.HandleFunc("GET /sitemap.xml", serveStaticRebased("sitemap.xml", "application/xml"))
	mux.HandleFunc("GET /robots.txt", serveStaticRebased("robots.txt", "text/plain"))
	mux.HandleFunc("GET /llms.txt", serveStaticRebased("llms.txt", "text/plain; charset=utf-8"))
	// The block image placeholder, the pendant of shadcn's
	// public/placeholder.svg: block sources reference it root-relative.
	mux.HandleFunc("GET /placeholder.svg", serveStaticRebased("placeholder.svg", "image/svg+xml"))

	// JSON schemas behind the $schema URLs in components.json and
	// registry.json, the pendant of ui.shadcn.com/schema/*.json.
	for _, s := range []string{"components.json", "registry.json", "registry-item.json"} {
		mux.HandleFunc("GET /schema/"+s, serveStaticRebased("schema/"+s, "application/json"))
	}

	mux.Handle("GET /{$}", templ.Handler(pages.IndexPage()))
	mux.Handle("GET /docs", http.RedirectHandler("/docs/introduction", http.StatusSeeOther))
	mux.Handle("GET /docs/getting-started", http.RedirectHandler("/docs/introduction", http.StatusSeeOther))
	componentsPrev, componentsNext := docsPagerLinks("/docs/components")
	mux.Handle("GET /docs/components", htmxHandler(pages.ComponentsOverview(componentsPrev, componentsNext)))
	mux.Handle("GET /create", htmxHandler(pages.Create()))
	mux.Handle("GET /create/preview", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		item := r.URL.Query().Get("item")
		if err := pages.CreatePreview(item).Render(r.Context(), w); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
	mux.Handle("GET /typeset", htmxHandler(pages.Typeset()))
	// The reference URL shape: /preview/typeset/{name}?<non-default knobs>.
	mux.Handle("GET /preview/typeset/{name}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		item := r.PathValue("name")
		if !pages.TypesetFixtureExists(item) {
			http.NotFound(w, r)
			return
		}
		params := pages.LoadTypesetPreviewParams(r.URL.Query())
		if err := pages.TypesetPreview(item, params).Render(r.Context(), w); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
	// The old query shape redirects permanently, like the reference redirects
	// its legacy view URLs.
	mux.Handle("GET /typeset/preview", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		item := q.Get("item")
		if item == "" {
			item = "docs"
		}
		q.Del("item")
		target := "/preview/typeset/" + item
		if enc := q.Encode(); enc != "" {
			target += "?" + enc
		}
		http.Redirect(w, r, target, http.StatusMovedPermanently)
	}))
	// Raw stylesheet for the typeset Get Code button, the pendant of shadcn's
	// app/typeset.css/route.ts: read fresh on every request so the copy is
	// never a stale snapshot.
	mux.HandleFunc("GET /typeset.css", func(w http.ResponseWriter, r *http.Request) {
		var css []byte
		var err error
		if config.AppConfig.GoEnv != "production" {
			css, err = os.ReadFile("./assets/css/typeset.css")
		} else {
			css, err = assets.Assets.ReadFile("css/typeset.css")
		}
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(css)
	})

	// Build-time highlight generator hook (cmd/highlight-gen): after the
	// crawler warmed every page, it fetches the accumulated shiki cache
	// here. Only mounted when the generator run asks for it.
	if os.Getenv("HIGHLIGHT_DUMP") == "1" {
		mux.HandleFunc("GET /debug/highlight-cache", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			if err := modules.DumpHighlightCache(w); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
		})
	}

	// Registry server, the pendant of shadcn's /init route and static
	// r/styles registry: /init returns the registry:base item for a design
	// system config (?preset=<code> or individual params, ?only=theme|font
	// for the partial item); /r/styles/{style}/{name}.json returns a
	// component compiled for that style through the inliner.
	mux.Handle("GET /init", registryapi.InitHandler())
	mux.Handle("GET /r/styles/{style}/{file}", registryapi.StylesHandler())

	// The source registry file (shadcn's app-root registry.json shape),
	// served verbatim.
	mux.HandleFunc("GET /r/registry.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(registry.JSON())
	})

	// Markdown-based documentation pages
	markdownDocsHandler := func(slug string) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			doc, err := docsService.GetPage(slug)
			if err != nil {
				http.Error(w, "Documentation page not found: "+err.Error(), http.StatusNotFound)
				return
			}

			prev, next := docsPagerLinks("/docs/" + slug)
			htmxHandler(pages.MarkdownDoc(doc, prev, next)).ServeHTTP(w, r)
		})
	}

	// Raw markdown of a root docs page under <slug>.md, like the component
	// pages, for the copy-page menu.
	markdownSourceHandler := func(slug string) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			source, err := docsService.GetPageSource(slug)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
			w.Write(source)
		})
	}

	// The components overview and the changelog have no page of their own in
	// DocSlugs, but their copy-page menu links a .md all the same: the overview
	// exports the generated component index, the changelog its intro page.
	mux.Handle("GET /docs/components.md", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.Write(docsService.ComponentsIndexSource())
	}))
	mux.Handle("GET /docs/changelog.md", markdownSourceHandler("changelog"))

	// Changelog: the overview inlines the latest entries, each entry has its
	// own page (the reference's per-entry directory), and rss.xml feeds them.
	mux.Handle("GET /docs/changelog", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		entries, err := docsService.GetChangelogPages()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		htmxHandler(pages.Changelog(entries)).ServeHTTP(w, r)
	}))
	mux.Handle("GET /docs/changelog/{slug}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slug := r.PathValue("slug")
		// {slug}.md is not a valid mux pattern, so the raw-markdown export
		// shares this route via the suffix.
		if raw, ok := strings.CutSuffix(slug, ".md"); ok {
			source, err := docsService.GetChangelogPageSource(raw)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
			w.Write(source)
			return
		}
		entry, err := docsService.GetChangelogPage(slug)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		htmxHandler(pages.ChangelogEntry(entry)).ServeHTTP(w, r)
	}))
	mux.HandleFunc("GET /rss.xml", func(w http.ResponseWriter, r *http.Request) {
		entries, err := docsService.GetChangelogPages()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
		fmt.Fprint(w, pages.ChangelogRSS(shared.BaseURL(), entries))
	})

	for _, slug := range shared.DocSlugs {
		mux.Handle("GET /docs/"+slug, markdownDocsHandler(slug))
		mux.Handle("GET /docs/"+slug+".md", markdownSourceHandler(slug))
	}
	// The old How To Use page moved into the installation chapter.
	mux.Handle("GET /docs/how-to-use", http.RedirectHandler("/docs/installation", http.StatusMovedPermanently))
	// Typography redirects to /docs/typeset, like shadcn's
	// /docs/components/*/typography redirects (permanent: true).
	mux.Handle("GET /docs/components/typography", http.RedirectHandler("/docs/typeset", http.StatusMovedPermanently))
	// Components
	mux.Handle("GET /docs/components/{slug}", componentDocHandler(docsService))
	mux.Handle("GET /charts", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/charts/area", http.StatusMovedPermanently)
	}))
	mux.Handle("GET /charts/{type}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		chartType := r.PathValue("type")
		if !pages.ChartTypes[chartType] {
			http.NotFound(w, r)
			return
		}
		if err := pages.Charts(chartType).Render(r.Context(), w); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
	// Blocks gallery, the pendant of shadcn's /blocks pages: /blocks shows
	// the featured list, /blocks/{category} one registry category.
	mux.Handle("GET /blocks", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := pages.Blocks("").Render(r.Context(), w); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
	mux.Handle("GET /blocks/{category}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		category := r.PathValue("category")
		if !pages.BlockCategories[category] {
			http.NotFound(w, r)
			return
		}
		if err := pages.Blocks(category).Render(r.Context(), w); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
	// /view/{name} serves charts and blocks standalone, like shadcn's
	// (view)/view route resolves both through the registry index.
	mux.Handle("GET /view/{name}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if charts.Component(name) != nil {
			if err := pages.ChartView(name).Render(r.Context(), w); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}
		if blocks.Component(name) != nil {
			// Blocks with URL-driven state (dashboard-01's pagination) read
			// the request from the render context, the same wiring a user
			// project mounts (see dashboard01.WithRequest).
			r = r.WithContext(dashboard01.WithRequest(r.Context(), r))
			// ?fragment= serves just that templ fragment of the block, the
			// server half of the htmx partial updates. Pagination swaps
			// (data-table) push the clean URL back via HX-Push-Url; drawer
			// fragments leave the URL alone.
			if f := r.URL.Query().Get("fragment"); f != "" {
				if f == "data-table" && r.Header.Get("HX-Request") == "true" {
					q := r.URL.Query()
					q.Del("fragment")
					clean := r.URL.Path
					if enc := q.Encode(); enc != "" {
						clean += "?" + enc
					}
					w.Header().Set("HX-Push-Url", clean)
				}
				templ.Handler(pages.BlockView(name), templ.WithFragments(f)).ServeHTTP(w, r)
				return
			}
			if err := pages.BlockView(name).Render(r.Context(), w); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}
		http.NotFound(w, r)
	}))
	mux.Handle("GET /preview/{name}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		entry, ok := examples.Registry[r.PathValue("name")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		if err := pages.ExamplePreview(r.PathValue("name"), entry).Render(r.Context(), w); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))

	// Showcase API

	// Test Form Items Handler
	mux.Handle("GET /docs/test-form-items", htmxHandler(pages.TestFormItems()))
	mux.HandleFunc("POST /docs/test-form-items", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		fmt.Println("=== Form Values Received ===")
		fmt.Printf("switch_default: %q\n", r.FormValue("switch_default"))
		fmt.Printf("switch_custom: %q\n", r.FormValue("switch_custom"))
		fmt.Printf("checkbox_default: %q\n", r.FormValue("checkbox_default"))
		fmt.Printf("checkbox_custom: %q\n", r.FormValue("checkbox_custom"))
		fmt.Printf("interests (multiple checkboxes): %v\n", r.Form["interests"])
		fmt.Printf("features (multiple switches): %v\n", r.Form["features"])
		fmt.Println("============================")

		// Redirect back to form
		http.Redirect(w, r, "/docs/test-form-items", http.StatusSeeOther)
	})

	// 404 handler - using Go 1.22+ wildcard syntax
	// The {$} ensures this only matches exactly "/" and not as a prefix
	// All unmatched routes will fall through to this catch-all
	mux.HandleFunc("/{path...}", notFoundHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}
	log.Println("Server is running on http://localhost:" + port)
	server := http.NewServeMux()
	server.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	server.Handle("/", wrappedMux)
	http.ListenAndServe(":"+port, server)
}

func notFoundHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotFound)
	pages.NotFound().Render(r.Context(), w)
}

func SetupAssetsRoutes(mux *http.ServeMux) {
	var isDevelopment = config.AppConfig.GoEnv != "production"

	assetHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isDevelopment {
			w.Header().Set("Cache-Control", "no-store")
		} else if strings.HasPrefix(strings.TrimPrefix(r.URL.Path, "/"), "js/shadcn-templ-") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}

		var fs http.Handler
		if isDevelopment {
			fs = http.FileServer(http.Dir("./assets"))
		} else {
			fs = http.FileServer(http.FS(assets.Assets))
		}

		fs.ServeHTTP(w, r)
	})

	mux.Handle("GET /assets/", http.StripPrefix("/assets/", assetHandler))

	// Per-page open-graph image, the pendant of app/og/route.tsx
	mux.Handle("GET /og", og.Handler())

	// Safari Favicon Compatibility
	// Safari often ignores HTML favicon tags and looks for files in the root directory.
	// We serve specific favicon files from /assets/img/favicon/ at root URLs for better Safari compatibility.
	faviconRoutes := map[string]string{
		"/favicon.ico":          "img/favicon/favicon.ico",
		"/apple-touch-icon.png": "img/favicon/apple-touch-icon.png",
		"/favicon-32x32.png":    "img/favicon/favicon-32x32.png",
		"/favicon-16x16.png":    "img/favicon/favicon-16x16.png",
	}

	for route, assetPath := range faviconRoutes {
		// Capture variables for closure
		r := route
		path := assetPath

		mux.HandleFunc("GET "+r, func(w http.ResponseWriter, r *http.Request) {
			// Set content type based on file extension
			if strings.HasSuffix(path, ".ico") {
				w.Header().Set("Content-Type", "image/x-icon")
			} else if strings.HasSuffix(path, ".png") {
				w.Header().Set("Content-Type", "image/png")
			}

			if isDevelopment {
				w.Header().Set("Cache-Control", "no-store")
				http.ServeFile(w, r, "./assets/"+path)
			} else {
				content, err := assets.Assets.ReadFile(path)
				if err != nil {
					http.Error(w, "Favicon not found", http.StatusNotFound)
					return
				}
				w.Write(content)
			}
		})
	}
}

// componentDocHandler serves markdown-authored component pages (and their
// raw markdown under <slug>.md for the copy-page menu).
func componentDocHandler(docsService *service.DocsService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slug := r.PathValue("slug")

		if strings.HasSuffix(slug, ".md") {
			source, err := docsService.GetComponentPageSource(strings.TrimSuffix(slug, ".md"))
			if err != nil {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
			w.Write(source)
			return
		}

		page, err := docsService.GetComponentPage(slug)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		prev, next := docsPagerLinks("/docs/components/" + slug)
		htmxHandler(pages.ComponentDoc(page, prev, next)).ServeHTTP(w, r)
	})
}

// docsPagerLinks finds the previous/next docs page from the sidebar sections,
// flattened across section boundaries like shadcn's findNeighbour over the
// docs page tree. Links outside /docs/ (llms.txt) are not pages and stay out.
func docsPagerLinks(href string) (pages.PagerLink, pages.PagerLink) {
	var flat []shared.SideLink
	for _, section := range shared.Sections {
		// The components overview is the section's index page: it sits
		// between the last root page and the first component, like the
		// reference's components/index.mdx in the page tree.
		if section.Title == "Components" {
			flat = append(flat, shared.SideLink{Text: "Components", Href: "/docs/components"})
		}
		for _, link := range section.Links {
			if strings.HasPrefix(link.Href, "/docs/") {
				flat = append(flat, link)
			}
		}
	}
	var prev, next pages.PagerLink
	for i, link := range flat {
		if link.Href != href {
			continue
		}
		if i > 0 {
			prev = pages.PagerLink{Title: flat[i-1].Text, Href: flat[i-1].Href}
		}
		if i < len(flat)-1 {
			next = pages.PagerLink{Title: flat[i+1].Text, Href: flat[i+1].Href}
		}
	}
	return prev, next
}
