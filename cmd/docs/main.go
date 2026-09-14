package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/a-h/templ"

	"github.com/templui/templui/assets"
	"github.com/templui/templui/components"
	"github.com/templui/templui/components/toast"
	"github.com/templui/templui/internal/config"
	"github.com/templui/templui/internal/middleware"
	"github.com/templui/templui/internal/service"
	"github.com/templui/templui/internal/ui/modules"
	"github.com/templui/templui/internal/ui/pages"
	"github.com/templui/templui/static"
)

func toastDemoHandler(w http.ResponseWriter, r *http.Request) {
	duration, err := strconv.Atoi(r.FormValue("duration"))
	if err != nil {
		duration = 0
	}

	toastProps := toast.Props{
		Title:         r.FormValue("title"),
		Description:   r.FormValue("description"),
		Variant:       toast.Variant(r.FormValue("type")),
		Position:      toast.Position(r.FormValue("position")),
		Duration:      duration,
		Dismissible:   r.FormValue("dismissible") == "on",
		ShowIndicator: r.FormValue("indicator") == "on",
		Icon:          r.FormValue("icon") == "on",
	}

	toast.Toast(toastProps).Render(r.Context(), w)
}

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

func main() {
	mux := http.NewServeMux()
	config.LoadConfig()

	SetupAssetsRoutes(mux)

	// Initialize markdown docs service
	docsService := service.NewDocsService()

	wrappedMux := middleware.WithURLPathValue(
		middleware.CacheControlMiddleware(
			middleware.GitHubStarsMiddleware(
				mux,
			),
		),
	)

	mux.HandleFunc("GET /sitemap.xml", func(w http.ResponseWriter, r *http.Request) {
		content, err := static.Files.ReadFile("sitemap.xml")
		if err != nil {
			http.Error(w, "Sitemap not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/xml")
		w.Write(content)
	})

	mux.HandleFunc("GET /robots.txt", func(w http.ResponseWriter, r *http.Request) {
		content, err := static.Files.ReadFile("robots.txt")
		if err != nil {
			http.Error(w, "Robots.txt not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		w.Write(content)
	})

	mux.HandleFunc("GET /llms.txt", func(w http.ResponseWriter, r *http.Request) {
		content, err := static.Files.ReadFile("llms.txt")
		if err != nil {
			http.Error(w, "llms.txt not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write(content)
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

	mux.Handle("GET /{$}", templ.Handler(pages.Landing()))
	mux.Handle("GET /docs", http.RedirectHandler("/docs/introduction", http.StatusSeeOther))
	mux.Handle("GET /docs/getting-started", http.RedirectHandler("/docs/introduction", http.StatusSeeOther))
	mux.Handle("GET /docs/components", htmxHandler(pages.ComponentsOverview()))
	mux.Handle("GET /docs/themes", htmxHandler(pages.Themes()))

	// Markdown-based documentation pages
	markdownDocsHandler := func(slug string) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			doc, err := docsService.GetPage(slug)
			if err != nil {
				http.Error(w, "Documentation page not found: "+err.Error(), http.StatusNotFound)
				return
			}

			if middleware.IsHtmxRequest(r) {
				templ.Handler(pages.MarkdownDoc(doc), templ.WithFragments("content", "toc")).ServeHTTP(w, r)
			} else {
				templ.Handler(pages.MarkdownDoc(doc)).ServeHTTP(w, r)
			}
		})
	}

	mux.Handle("GET /docs/introduction", markdownDocsHandler("introduction"))
	mux.Handle("GET /docs/how-to-use", markdownDocsHandler("how-to-use"))
	// Components
	mux.Handle("GET /docs/components/accordion", htmxHandler(pages.Accordion()))
	mux.Handle("GET /docs/components/alert", htmxHandler(pages.Alert()))
	mux.Handle("GET /docs/components/aspect-ratio", htmxHandler(pages.AspectRatio()))
	mux.Handle("GET /docs/components/avatar", htmxHandler(pages.Avatar()))
	mux.Handle("GET /docs/components/badge", htmxHandler(pages.Badge()))
	mux.Handle("GET /docs/components/breadcrumb", htmxHandler(pages.Breadcrumb()))
	mux.Handle("GET /docs/components/button", htmxHandler(pages.Button()))
	mux.Handle("GET /docs/components/calendar", htmxHandler(pages.Calendar()))
	mux.Handle("GET /docs/components/card", htmxHandler(pages.Card()))
	mux.Handle("GET /docs/components/carousel", htmxHandler(pages.Carousel()))
	mux.Handle("GET /docs/components/charts", htmxHandler(pages.Chart()))
	mux.Handle("GET /docs/components/checkbox", htmxHandler(pages.Checkbox()))
	mux.Handle("GET /docs/components/collapsible", htmxHandler(pages.Collapsible()))
	mux.Handle("GET /docs/components/copy-button", htmxHandler(pages.CopyButton()))
	mux.Handle("GET /docs/components/date-picker", htmxHandler(pages.DatePicker()))
	mux.Handle("GET /docs/components/sheet", htmxHandler(pages.Sheet()))
	mux.Handle("GET /docs/components/dropdown", htmxHandler(pages.Dropdown()))
	mux.Handle("GET /docs/components/form", htmxHandler(pages.Form()))
	mux.Handle("GET /docs/components/icon", htmxHandler(pages.Icon()))
	mux.Handle("GET /docs/components/input", htmxHandler(pages.Input()))
	mux.Handle("GET /docs/components/input-otp", htmxHandler(pages.InputOtp()))
	mux.Handle("GET /docs/components/label", htmxHandler(pages.Label()))
	mux.Handle("GET /docs/components/dialog", htmxHandler(pages.Dialog()))
	mux.Handle("GET /docs/components/pagination", htmxHandler(pages.Pagination()))
	mux.Handle("GET /docs/components/progress", htmxHandler(pages.Progress()))
	mux.Handle("GET /docs/components/radio", htmxHandler(pages.Radio()))
	mux.Handle("GET /docs/components/rating", htmxHandler(pages.Rating()))
	mux.Handle("GET /docs/components/select-box", htmxHandler(pages.SelectBox()))
	mux.Handle("GET /docs/components/separator", htmxHandler(pages.Separator()))
	mux.Handle("GET /docs/components/sidebar", htmxHandler(pages.Sidebar()))
	mux.Handle("GET /docs/components/sidebar-fullscreen", htmxHandler(pages.SidebarFullscreen()))
	mux.Handle("GET /docs/components/sidebar-preview", htmxHandler(pages.SidebarPreview()))
	mux.Handle("GET /docs/components/skeleton", htmxHandler(pages.Skeleton()))
	mux.Handle("GET /docs/components/slider", htmxHandler(pages.Slider()))
	mux.Handle("GET /docs/components/table", htmxHandler(pages.Table()))
	mux.Handle("GET /docs/components/tabs", htmxHandler(pages.Tabs()))
	mux.Handle("GET /docs/components/tags-input", htmxHandler(pages.TagsInput()))
	mux.Handle("GET /docs/components/textarea", htmxHandler(pages.Textarea()))
	mux.Handle("GET /docs/components/time-picker", htmxHandler(pages.TimePicker()))
	mux.Handle("GET /docs/components/toast", htmxHandler(pages.Toast()))
	mux.Handle("GET /docs/components/switch", htmxHandler(pages.Switch()))
	mux.Handle("GET /docs/components/tooltip", htmxHandler(pages.Tooltip()))
	mux.Handle("GET /docs/components/popover", htmxHandler(pages.Popover()))
	mux.Handle("GET /docs/components/hover-card", htmxHandler(pages.HoverCard()))

	// Showcase API
	mux.Handle("POST /docs/toast/demo", http.HandlerFunc(toastDemoHandler))

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

	log.Println("Server is running on http://localhost:8090")
	server := http.NewServeMux()
	server.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	server.Handle("/", wrappedMux)
	http.ListenAndServe(":8090", server)
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

	// Component JS Handler - serves individual minified JS files
	componentJSHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract the component path from the URL
		// e.g., /components/js/avatar/avatar.min.js -> avatar/avatar.min.js
		path := strings.TrimPrefix(r.URL.Path, "/components/js/")

		// Set content type for JS files
		w.Header().Set("Content-Type", "application/javascript")

		if isDevelopment {
			w.Header().Set("Cache-Control", "no-store")
			// In dev, serve from filesystem
			http.ServeFile(w, r, "./components/"+path)
		} else {
			// In production, serve from embedded FS
			w.Header().Set("Cache-Control", "public, max-age=31536000")
			data, err := components.TemplFiles.ReadFile(path)
			if err != nil {
				http.Error(w, "File not found", http.StatusNotFound)
				return
			}
			w.Write(data)
		}
	})

	mux.Handle("GET /components/js/", componentJSHandler)

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
