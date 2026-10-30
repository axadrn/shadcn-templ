// The pendant of shadcn/src/registry/api.ts and constants.ts: URL building
// and item fetching against the shadcn-templ registry.
package registry

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// DefaultRegistry is the REGISTRY_URL pendant.
const DefaultRegistry = "https://shadcn-templ.com"

// SiteURL is the SHADCN_URL pendant, used for docs and /create links.
const SiteURL = "https://shadcn-templ.com"

// EnvRegistry is the environment variable that overrides the registry URL,
// below the --registry flag.
const EnvRegistry = "SHADCN_TEMPL_REGISTRY"

// Resolve returns the registry base URL: --registry flag > SHADCN_TEMPL_REGISTRY
// env > default.
func Resolve(flagValue string) string {
	if flagValue != "" {
		return strings.TrimRight(flagValue, "/")
	}
	if env := os.Getenv(EnvRegistry); env != "" {
		return strings.TrimRight(env, "/")
	}
	return DefaultRegistry
}

// IsURL is the isUrl pendant.
func IsURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https")
}

var client = &http.Client{Timeout: 30 * time.Second}

func fetchJSON(rawURL string, v any) error {
	resp, err := client.Get(rawURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return &NotFoundError{URL: rawURL}
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		message := strings.TrimSpace(string(body))
		var errBody struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(body, &errBody) == nil && errBody.Error != "" {
			message = errBody.Error
		}
		return fmt.Errorf("failed to fetch %s: %s (%s)", rawURL, resp.Status, message)
	}

	return json.NewDecoder(resp.Body).Decode(v)
}

// NotFoundError marks a 404 so callers can name the missing item.
type NotFoundError struct {
	URL string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("not found: %s", e.URL)
}

// ItemURL returns the per-style item URL, the pendant of
// r/styles/<style>/<name>.json. query carries the install-time config the
// reference CLI applies locally (menuColor, rtl) - shadcn-templ's registry
// resolves those markers at serve time instead.
func ItemURL(registryURL, style, name string, query url.Values) string {
	itemURL := fmt.Sprintf("%s/r/styles/%s/%s.json", registryURL, style, name)
	if enc := query.Encode(); enc != "" {
		itemURL += "?" + enc
	}
	return itemURL
}

// GetItem fetches one registry item by name (from the configured style) or
// by direct URL.
func GetItem(registryURL, style, nameOrURL string, query url.Values) (*Item, error) {
	itemURL := nameOrURL
	if !IsURL(nameOrURL) {
		itemURL = ItemURL(registryURL, style, nameOrURL, query)
	}

	var item Item
	if err := fetchJSON(itemURL, &item); err != nil {
		var notFound *NotFoundError
		if errors.As(err, &notFound) && !IsURL(nameOrURL) {
			return nil, fmt.Errorf("the item at %s was not found. It may not exist at the registry", itemURL)
		}
		return nil, err
	}
	return &item, nil
}

// GetIndex fetches the registry index (r/registry.json), the
// getShadcnRegistryIndex pendant.
func GetIndex(registryURL string) (*Index, error) {
	var index Index
	if err := fetchJSON(registryURL+"/r/registry.json", &index); err != nil {
		return nil, err
	}
	return &index, nil
}

// FetchText fetches a plain file from the registry host (the vendored CSS
// files the base item's css block imports).
func FetchText(rawURL string) (string, error) {
	resp, err := client.Get(rawURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to fetch %s: %s", rawURL, resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}
