package navigationmenu

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"

	"github.com/a-h/templ"
)

func render(t *testing.T, c templ.Component) string {
	t.Helper()
	var out bytes.Buffer
	if err := c.Render(context.Background(), &out); err != nil {
		t.Fatal(err)
	}
	return out.String()
}

func TestRootRendersSlotAndPositioner(t *testing.T) {
	html := render(t, NavigationMenu(Props{Delay: 100, CloseDelay: 200}))
	for _, want := range []string{
		`<nav`,
		`data-slot="navigation-menu"`,
		`data-templ-delay="100"`,
		`data-templ-close-delay="200"`,
		`role="presentation"`,
		`data-templ-side="bottom"`,
		`data-templ-side-offset="8"`,
		`data-templ-align="start"`,
		`tabindex="-1"`,
		`data-base-ui-portal`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("root is missing %q: %s", want, html)
		}
	}
}

func TestPartsRenderBaseUIAttributes(t *testing.T) {
	cases := map[string]struct {
		c    templ.Component
		want []string
	}{
		"list":    {List(), []string{`<ul`, `data-slot="navigation-menu-list"`}},
		"item":    {Item(), []string{`<li`, `data-slot="navigation-menu-item"`}},
		"trigger": {Trigger(), []string{`<button`, `type="button"`, `aria-expanded="false"`, `aria-disabled="false"`, `data-base-ui-navigation-menu-trigger`, `data-slot="navigation-menu-trigger"`, `cn-navigation-menu-trigger-icon`}},
		"content": {Content(), []string{`data-templ-portal`, `hidden`, `data-slot="navigation-menu-content"`}},
		"link":    {Link(LinkProps{Href: "/docs"}), []string{`<a`, `href="/docs"`, `data-slot="navigation-menu-link"`}},
		"icon":    {Indicator(), []string{`aria-hidden="true"`, `data-slot="navigation-menu-indicator"`}},
	}
	for name, tc := range cases {
		html := render(t, tc.c)
		for _, want := range tc.want {
			if !strings.Contains(html, want) {
				t.Fatalf("%s is missing %q: %s", name, want, html)
			}
		}
	}
}

func TestPositionerProps(t *testing.T) {
	zero := 0
	html := render(t, Positioner(PositionerProps{Side: SideTop, SideOffset: &zero, Align: AlignEnd, AlignOffset: 4}))
	for _, want := range []string{`data-templ-side="top"`, `data-templ-side-offset="0"`, `data-templ-align="end"`, `data-templ-align-offset="4"`} {
		if !strings.Contains(html, want) {
			t.Fatalf("positioner is missing %q: %s", want, html)
		}
	}
}

func TestClientUsesBlocks(t *testing.T) {
	source, err := os.ReadFile("navigationmenu.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{
		`window.templ.lifecycle.register(`,
		`hover.useHoverReferenceInteraction(`,
		`window.templ.click.useClick(`,
		`window.templ.dismiss.useDismiss(`,
		`window.templ.anchorPositioning.useAnchorPositioning(`,
		`window.templ.composite.useCompositeRoot(`,
		`adaptiveOrigin: true`,
		`--positioner-width`,
		`data-activation-direction`,
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("client is missing %q", want)
		}
	}
	if strings.Contains(js, ".cn-") {
		t.Fatal("client selects by cn-* classes")
	}
}
