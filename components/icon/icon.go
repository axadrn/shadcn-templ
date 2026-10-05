package icon

import (
	"context"
	"fmt"
	"io"
	"sort"
	"strings"
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
	Class string
	// Attributes renders extra HTML attributes on the svg element,
	// e.g. data-icon="inline-start" for the icon spacing inside buttons
	// and badges.
	Attributes templ.Attributes
	// Size is lucide's size prop, the width and height. Defaults to 24.
	Size int
}

// Icon returns a function that generates a templ.Component for the specified icon name.
func Icon(name string) func(...Props) templ.Component {
	return func(props ...Props) templ.Component {
		var p Props
		if len(props) > 0 {
			p = props[0]
		}

		// Cache by icon name, class and attributes so repeated renders
		// reuse the generated SVG.
		cacheKey := fmt.Sprintf("%s|cl:%s|at:%s|sz:%d", name, p.Class, attrString(p.Attributes), p.Size)

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

	// Construct the final SVG string, the attributes lucide-react renders,
	// with its "lucide lucide-<name>" classes before the given ones.
	class := strings.TrimSpace("lucide lucide-" + name + " " + props.Class)
	size := props.Size
	if size == 0 {
		size = 24
	}
	return fmt.Sprintf("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%d\" height=\"%d\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"%s\"%s>%s</svg>",
		size, size, templ.EscapeString(class), attrString(props.Attributes), content), nil
}

// attrString renders extra attributes deterministically (sorted by key) so
// they are stable as part of the cache key and the generated SVG.
func attrString(attrs templ.Attributes) string {
	if len(attrs) == 0 {
		return ""
	}
	keys := make([]string, 0, len(attrs))
	for k := range attrs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		switch v := attrs[k].(type) {
		case bool:
			if v {
				b.WriteString(" " + templ.EscapeString(k))
			}
		default:
			b.WriteString(fmt.Sprintf(" %s=\"%s\"", templ.EscapeString(k), templ.EscapeString(fmt.Sprint(v))))
		}
	}
	return b.String()
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
