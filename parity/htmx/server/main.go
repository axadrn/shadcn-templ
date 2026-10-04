package main

import (
	"log"
	"net/http"
	"os"

	"github.com/a-h/templ"
	"github.com/axadrn/shadcn-templ/v2/assets"
)

func main() {
	mux := http.NewServeMux()
	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.FS(assets.Assets))))
	mux.HandleFunc("/htmx.js", func(w http.ResponseWriter, r *http.Request) {
		path := os.Getenv("HTMX_JS")
		if path == "" {
			// go run ./parity/htmx/server from the repository root.
			path = "parity/htmx/htmx.js"
		}
		http.ServeFile(w, r, path)
	})
	mux.Handle("/", templ.Handler(Page()))
	mux.Handle("/fragment", templ.Handler(Fragment()))
	mux.Handle("/open", templ.Handler(OpenPage()))
	mux.Handle("/fragment-open", templ.Handler(OpenModal()))
	mux.HandleFunc("POST /hit/{id}", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("hit %s", r.PathValue("id"))
		w.WriteHeader(http.StatusNoContent)
	})
	port := os.Getenv("PORT")
	if port == "" {
		port = "8099"
	}
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
