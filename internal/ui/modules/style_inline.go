package modules

import (
	"context"
	"strings"
	"sync"

	"github.com/a-h/templ"
	"github.com/axadrn/shadcn-templ/v2/assets"
	"github.com/axadrn/shadcn-templ/v2/internal/inliner"
)

// Rendering a component tree as the compiled utility build of a style, the
// pendant of shadcn's generated styles/<style>/ui/*: the tree is rendered
// once with its canonical cn-* classes, then the inliner's HTML pass expands
// them into that style's flat utilities. The stylesheet cascade never sees
// cn-* here, so twMerge's caller-wins semantics hold exactly — and nothing
// depends on an ancestor .style-* class, so a wall of rhea components can sit
// inside a nova page without either style leaking into the other.
//
// Two call sites, both matching a reference one: the docs previews (shadcn's
// docs render the per-style compiled registry) and the homepage card wall
// (their cards import @/styles/base-rhea/ui/*).

// styleNames lists the vendored styles in globals.css import order.
var styleNames = []string{"vega", "nova", "lyra", "maia", "mira", "luma", "sera", "rhea"}

var (
	styleMapsOnce sync.Once
	styleMaps     map[string]inliner.StyleMap
)

// resolveStyleMap resolves shadcn's styleName attribute ("base-rhea") to the
// parsed style map; the default is nova (the body's style).
func resolveStyleMap(styleName string) inliner.StyleMap {
	styleMapsOnce.Do(func() {
		styleMaps = make(map[string]inliner.StyleMap, len(styleNames))
		for _, name := range styleNames {
			css, err := assets.Assets.ReadFile("css/styles/style-" + name + ".css")
			if err != nil {
				continue
			}
			styleMap, err := inliner.CreateStyleMap(string(css))
			if err != nil {
				continue
			}
			styleMaps[name] = styleMap
		}
	})

	if styleMap, ok := styleMaps[strings.TrimPrefix(styleName, "base-")]; ok {
		return styleMap
	}
	return styleMaps["nova"]
}

// InlineSiteHTML compiles the class attributes of a full site page for the
// site's style (nova) - the delivery half of shadcn's build: the browser
// never sees raw cn-* classes, and the menu config markers resolve to the
// default, exactly like a shadcn install.
func InlineSiteHTML(html string) string {
	return inliner.InlineHTML(html, resolveStyleMap("nova"), inliner.Options{})
}

// InlinedStyleHTML renders component and compiles its class attributes for
// the named style ("base-rhea", "rhea", "" for the default).
func InlinedStyleHTML(ctx context.Context, component templ.Component, styleName string) (string, error) {
	return InlinedStyleHTMLWith(ctx, component, styleName, inliner.Options{})
}

// InlinedStyleHTMLWith is InlinedStyleHTML with the install options, e.g.
// RTL for the -rtl examples, which upstream renders from the ui-rtl build.
func InlinedStyleHTMLWith(ctx context.Context, component templ.Component, styleName string, opts inliner.Options) (string, error) {
	var buf strings.Builder
	if err := component.Render(ctx, &buf); err != nil {
		return "", err
	}
	return inliner.InlineHTML(buf.String(), resolveStyleMap(styleName), opts), nil
}
