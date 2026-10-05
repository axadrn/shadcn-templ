package registryapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"

	"github.com/axadrn/shadcn-templ/v2/internal/inliner"
	"github.com/axadrn/shadcn-templ/v2/internal/shared"
)

func TestVarsOrder(t *testing.T) {
	var v Vars
	if err := json.Unmarshal([]byte(`{"b":"1","a":"2","c":"3"}`), &v); err != nil {
		t.Fatal(err)
	}
	// Updating an existing key keeps its position (JS spread semantics).
	v.Set("a", "9")
	v.Set("d", "4")
	out, err := json.Marshal(&v)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"b":"1","a":"9","c":"3","d":"4"}`
	if string(out) != want {
		t.Errorf("Vars marshal = %s, want %s", out, want)
	}
}

func TestThemesData(t *testing.T) {
	all := Themes()
	if len(all) != 24 {
		t.Fatalf("Themes() = %d entries, want 24", len(all))
	}
	if all[0].Name != "neutral" {
		t.Errorf("first theme = %q, want neutral", all[0].Name)
	}
	if got := len(BaseColors()); got != 7 {
		t.Errorf("BaseColors() = %d entries, want 7", got)
	}

	// Neutral base color: neutral itself and all colored themes, but not the
	// other base colors.
	names := map[string]bool{}
	for _, th := range ThemesForBaseColor("neutral") {
		names[th.Name] = true
	}
	if !names["neutral"] || !names["blue"] || names["stone"] || names["taupe"] {
		t.Errorf("ThemesForBaseColor(neutral) unexpected set: %v", names)
	}
}

func mustParse(t *testing.T, rawQuery string) DesignSystemConfig {
	t.Helper()
	q, err := url.ParseQuery(rawQuery)
	if err != nil {
		t.Fatal(err)
	}
	config, err := ParseDesignSystemConfig(q)
	if err != nil {
		t.Fatalf("ParseDesignSystemConfig(%q): %v", rawQuery, err)
	}
	return config
}

func parseErr(t *testing.T, rawQuery string) string {
	t.Helper()
	q, _ := url.ParseQuery(rawQuery)
	_, err := ParseDesignSystemConfig(q)
	if err == nil {
		t.Fatalf("ParseDesignSystemConfig(%q) succeeded, want error", rawQuery)
	}
	return err.Error()
}

func TestParseDesignSystemConfig(t *testing.T) {
	// preset=b0 is the all-defaults v2 code.
	c := mustParse(t, "preset=b0")
	if c != DefaultConfig {
		t.Errorf("preset=b0 = %+v, want DEFAULT_CONFIG %+v", c, DefaultConfig)
	}

	// bIkeymG differs from the default only in the style (vega), verified
	// against the live ui.shadcn.com/init?preset=bIkeymG.
	c = mustParse(t, "preset=bIkeymG")
	if c.Style != "vega" || c.Theme != "neutral" {
		t.Errorf("preset=bIkeymG = %+v", c)
	}

	// v1 code: chartColor restored through the v1 chart color map.
	c = mustParse(t, "preset=a0")
	if c.ChartColor != "blue" {
		t.Errorf("preset=a0 chartColor = %q, want blue (V1 map)", c.ChartColor)
	}

	// Query overrides on top of a preset.
	c = mustParse(t, "preset=b0&chartColor=emerald&fontHeading=lora&rtl=true&pointer=true")
	if c.ChartColor != "emerald" || c.FontHeading != "lora" || !c.RTL || !c.Pointer {
		t.Errorf("preset overrides = %+v", c)
	}

	// Individual params: every enum param is required (zod defaults do not
	// apply to null), like the live route.
	c = mustParse(t, "base=base&style=nova&iconLibrary=lucide&baseColor=neutral&theme=neutral&font=inter&fontHeading=inherit&menuAccent=subtle&menuColor=default&radius=default")
	if c.Style != "nova" || c.ChartColor != "neutral" {
		t.Errorf("individual params = %+v", c)
	}

	if msg := parseErr(t, ""); msg != "Expected 'base', received null" {
		t.Errorf("empty query error = %q", msg)
	}
	if msg := parseErr(t, "base=base"); !strings.Contains(msg, "received null") || !strings.Contains(msg, "'vega'") {
		t.Errorf("missing style error = %q", msg)
	}
	if msg := parseErr(t, "preset=b0&fontHeading=bogus"); !strings.HasPrefix(msg, "Invalid enum value.") {
		t.Errorf("bad fontHeading error = %q", msg)
	}
	// An unusable preset param falls through to the individual-params branch.
	if msg := parseErr(t, "preset=zzzz"); msg != "Expected 'base', received null" {
		t.Errorf("bad preset error = %q", msg)
	}
	// Refinement: stone is a base color, not available under neutral.
	msg := parseErr(t, "base=base&style=nova&iconLibrary=lucide&baseColor=neutral&theme=stone&font=inter&fontHeading=inherit&menuAccent=subtle&menuColor=default&radius=default")
	if msg != `Theme "stone" is not available for base color "neutral"` {
		t.Errorf("refine error = %q", msg)
	}
}

func TestParseRegistryBaseParts(t *testing.T) {
	if parts, err := ParseRegistryBaseParts(nil); parts != nil || err != nil {
		t.Errorf("nil value = %v, %v", parts, err)
	}
	v := "theme, fonts,THEME"
	parts, err := ParseRegistryBaseParts(&v)
	if err != nil || len(parts) != 2 || parts[0] != "theme" || parts[1] != "font" {
		t.Errorf("parts = %v, %v", parts, err)
	}
	bad := "theme,bogus"
	if _, err := ParseRegistryBaseParts(&bad); err == nil {
		t.Error("invalid part accepted")
	}
	empty := " , "
	if _, err := ParseRegistryBaseParts(&empty); err == nil {
		t.Error("empty parts accepted")
	}
}

// mustVar reads a key or fails.
func mustVar(t *testing.T, v *Vars, key string) string {
	t.Helper()
	val, ok := v.Get(key)
	if !ok {
		t.Fatalf("missing var %q", key)
	}
	return val
}

func TestBuildRegistryTheme(t *testing.T) {
	// Defaults: the merged vars equal the neutral theme, golden values from
	// the live /init?preset=b0.
	theme, err := BuildRegistryTheme(DefaultConfig)
	if err != nil {
		t.Fatal(err)
	}
	if theme.Name != "neutral-neutral" || theme.Type != "registry:theme" {
		t.Errorf("theme identity = %q %q", theme.Name, theme.Type)
	}
	if got := mustVar(t, theme.Light, "primary"); got != "oklch(0.205 0 0)" {
		t.Errorf("light primary = %q", got)
	}
	if got := mustVar(t, theme.Light, "chart-1"); got != "oklch(0.87 0 0)" {
		t.Errorf("light chart-1 = %q", got)
	}
	if got := mustVar(t, theme.Light, "radius"); got != "0.625rem" {
		t.Errorf("light radius = %q", got)
	}
	if got := mustVar(t, theme.Dark, "border"); got != "oklch(1 0 0 / 10%)" {
		t.Errorf("dark border = %q", got)
	}

	// Chart color overlays only chart-1..5.
	config := DefaultConfig
	config.ChartColor = "blue"
	theme, err = BuildRegistryTheme(config)
	if err != nil {
		t.Fatal(err)
	}
	blue := GetTheme("blue")
	wantChart1, _ := blue.CSSVars.Light.Get("chart-1")
	if got := mustVar(t, theme.Light, "chart-1"); got != wantChart1 {
		t.Errorf("chart override chart-1 = %q, want %q", got, wantChart1)
	}
	bluePrimary, _ := blue.CSSVars.Light.Get("primary")
	if got := mustVar(t, theme.Light, "primary"); got == bluePrimary {
		t.Error("chart color must not overlay primary")
	}

	// Bold menu accent: accent := primary.
	config = DefaultConfig
	config.MenuAccent = "bold"
	theme, _ = BuildRegistryTheme(config)
	if mustVar(t, theme.Light, "accent") != mustVar(t, theme.Light, "primary") {
		t.Error("bold accent != primary (light)")
	}
	if mustVar(t, theme.Dark, "accent-foreground") != mustVar(t, theme.Dark, "primary-foreground") {
		t.Error("bold accent-foreground != primary-foreground (dark)")
	}

	// Radius override goes to light only.
	config = DefaultConfig
	config.Radius = "small"
	theme, _ = BuildRegistryTheme(config)
	if got := mustVar(t, theme.Light, "radius"); got != "0.45rem" {
		t.Errorf("small radius = %q", got)
	}
}

func TestBuildRegistryBaseGolden(t *testing.T) {
	config := mustParse(t, "preset=b0")
	item, err := BuildRegistryBase(config)
	if err != nil {
		t.Fatal(err)
	}

	if item.Name != "base-nova" || item.Extends != "none" || item.Type != "registry:base" {
		t.Errorf("identity = %q %q %q", item.Name, item.Extends, item.Type)
	}
	if len(item.Dependencies) != 1 || item.Dependencies[0] != ModuleDependency {
		t.Errorf("dependencies = %v", item.Dependencies)
	}
	if strings.Join(item.RegistryDependencies, ",") != "utils,font-inter" {
		t.Errorf("registryDependencies = %v", item.RegistryDependencies)
	}
	if got := mustVar(t, item.CSSVars.Theme, "--font-heading"); got != "var(--font-sans)" {
		t.Errorf("--font-heading = %q", got)
	}
	if item.Config.Style != "base-nova" || item.Config.IconLibrary != "lucide" ||
		item.Config.Tailwind.BaseColor != "neutral" || item.Config.RTL == nil || *item.Config.RTL ||
		item.Config.MenuColor != "default" || item.Config.MenuAccent != "subtle" {
		t.Errorf("config block = %+v", item.Config)
	}

	// JSON shape: field order and css keys match the live init output
	// (extends first, config last; both npm @imports mapped to the vendored
	// stylesheets).
	out, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.HasPrefix(s, `{"extends":"none","name":"base-nova","dependencies":[`) {
		t.Errorf("field order prefix = %.80s", s)
	}
	for _, want := range []string{
		`"@import \"./tw-animate.css\"":{}`,
		`"@import \"./shadcn-tailwind.css\"":{}`,
		`"@layer base":{"*":{"@apply border-border outline-ring/50":{}},"body":{"@apply bg-background text-foreground":{}}}`,
		`"type":"registry:base","config":{`,
	} {
		if !strings.Contains(s, want) {
			t.Errorf("marshaled base item missing %s", want)
		}
	}

	// Pointer adds the cursor rule.
	config.Pointer = true
	item, _ = BuildRegistryBase(config)
	out, _ = json.Marshal(item)
	if !strings.Contains(string(out), `"cursor":"pointer"`) {
		t.Error("pointer cursor rule missing")
	}

	// fontHeading equal to font normalizes to inherit.
	config = mustParse(t, "preset=b0&fontHeading=inter")
	item, _ = BuildRegistryBase(config)
	if strings.Contains(strings.Join(item.RegistryDependencies, ","), "font-heading") {
		t.Errorf("normalized fontHeading leaked: %v", item.RegistryDependencies)
	}
	// A real heading font becomes a registry dependency and no theme var.
	config = mustParse(t, "preset=b0&fontHeading=lora")
	item, _ = BuildRegistryBase(config)
	if !contains(item.RegistryDependencies, "font-heading-lora") {
		t.Errorf("font-heading-lora missing: %v", item.RegistryDependencies)
	}
	if item.CSSVars.Theme.Len() != 0 {
		t.Errorf("theme vars should be empty with explicit heading font, got %v", item.CSSVars.Theme)
	}
}

func TestBuildPartialRegistryBase(t *testing.T) {
	config := mustParse(t, "preset=b0")

	item, err := BuildPartialRegistryBase(config, []string{"theme"})
	if err != nil {
		t.Fatal(err)
	}
	if item.Name != "base-nova-theme" {
		t.Errorf("name = %q", item.Name)
	}
	if item.Config == nil || item.Config.Style != "" || item.Config.MenuColor != "default" {
		t.Errorf("partial config = %+v", item.Config)
	}
	if item.CSSVars == nil || item.CSSVars.Theme != nil || item.CSSVars.Light.Len() == 0 {
		t.Errorf("partial cssVars = %+v", item.CSSVars)
	}
	if item.RegistryDependencies != nil {
		t.Errorf("theme part must not add registryDependencies: %v", item.RegistryDependencies)
	}

	item, _ = BuildPartialRegistryBase(config, []string{"font"})
	if item.Name != "base-nova-font" || !contains(item.RegistryDependencies, "font-inter") {
		t.Errorf("font part = %+v", item)
	}
	if item.CSSVars == nil || item.CSSVars.Theme == nil {
		t.Fatalf("font part cssVars = %+v", item.CSSVars)
	}
	if got := mustVar(t, item.CSSVars.Theme, "--font-heading"); got != "var(--font-sans)" {
		t.Errorf("font part --font-heading = %q", got)
	}

	item, _ = BuildPartialRegistryBase(config, []string{"theme", "font", "theme"})
	if item.Name != "base-nova-theme-font" {
		t.Errorf("combined name = %q", item.Name)
	}
}

func TestBuildStyleItem(t *testing.T) {
	// Force the embed path so the test does not depend on the working
	// directory (development mode reads ./assets and ./components from the
	// repo root).
	t.Setenv("GO_ENV", "production")

	item, err := BuildStyleItem("base-nova", "button", inliner.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if item == nil {
		t.Fatal("button not found")
	}
	if item.Name != "button" || item.Type != "registry:ui" {
		t.Errorf("identity = %q %q", item.Name, item.Type)
	}
	if len(item.Files) == 0 || item.Files[0].Path != "components/button/button.templ" {
		t.Fatalf("files = %+v", item.Files)
	}
	content := item.Files[0].Content
	// \bcn- keeps the module path (shadcn-templ) out of the match.
	if regexp.MustCompile(`\bcn-`).MatchString(content) {
		t.Error("compiled content still contains cn-* markers")
	}
	if !strings.Contains(content, "bg-primary") {
		t.Error("compiled content misses flat utility classes")
	}
	if item.Meta == nil || item.Meta.Links.Docs != shared.BaseURL()+"/docs/components/button" {
		t.Errorf("meta = %+v", item.Meta)
	}
	if contains(item.RegistryDependencies, "scripts") {
		t.Errorf("button has no JavaScript but depends on scripts: %v", item.RegistryDependencies)
	}

	accordion, err := BuildStyleItem("base-nova", "accordion", inliner.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if !contains(accordion.RegistryDependencies, "scripts") {
		t.Errorf("JavaScript component dependencies = %v, want scripts", accordion.RegistryDependencies)
	}

	scripts, err := BuildStyleItem("base-nova", "scripts", inliner.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if scripts == nil || scripts.Type != "registry:lib" || len(scripts.Files) != 2 {
		t.Fatalf("scripts item = %+v", scripts)
	}
	wantScriptFiles := []string{"components/scripts.templ", "components/scripts_bundle.go"}
	for i, want := range wantScriptFiles {
		if scripts.Files[i].Path != want {
			t.Errorf("scripts file %d = %q, want %q", i, scripts.Files[i].Path, want)
		}
	}

	vega, err := BuildStyleItem("base-vega", "button", inliner.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if vega.Files[0].Content == content {
		t.Error("vega and nova compile to identical content")
	}

	// Unknown style and unknown component are the 404 case.
	if item, _ := BuildStyleItem("base-bogus", "button", inliner.Options{}); item != nil {
		t.Error("unknown style returned an item")
	}
	if item, _ := BuildStyleItem("radix-nova", "button", inliner.Options{}); item != nil {
		t.Error("radix base must 404, shadcn-templ has only base-*")
	}
	if item, _ := BuildStyleItem("base-nova", "bogus", inliner.Options{}); item != nil {
		t.Error("unknown component returned an item")
	}
}

func TestBuildStyleItemCompilesJavaScript(t *testing.T) {
	t.Setenv("GO_ENV", "production")
	marker := regexp.MustCompile(`\bcn-[\w-]+`)

	for _, styleName := range StyleNames() {
		bare, ok := splitStyleName(styleName)
		if !ok {
			t.Fatalf("invalid style name %q", styleName)
		}
		styleMap, err := styleMapFor(bare)
		if err != nil {
			t.Fatal(err)
		}

		chart, err := BuildStyleItem(styleName, "chart", inliner.Options{})
		if err != nil {
			t.Fatalf("%s chart: %v", styleName, err)
		}
		chartJavaScript := itemFileContent(t, chart, "components/chart/chart.js")
		if marker.MatchString(chartJavaScript) {
			t.Errorf("%s chart JavaScript contains a cn-* marker", styleName)
		}
		assertContainsClasses(t, styleName+" chart", chartJavaScript, styleMap["cn-chart-tooltip"])

		toast, err := BuildStyleItem(styleName, "toast", inliner.Options{})
		if err != nil {
			t.Fatalf("%s toast: %v", styleName, err)
		}
		toastJavaScript := itemFileContent(t, toast, "components/toast/toast.js")
		if marker.MatchString(toastJavaScript) {
			t.Errorf("%s toast JavaScript contains a cn-* marker", styleName)
		}
		// The toast's markup lives in the Toaster's templates.
		toastTempl := itemFileContent(t, toast, "components/toast/toast.templ")
		assertContainsClasses(t, styleName+" toast cn-toast", toastTempl, styleMap["cn-toast"])
	}

	lyra, err := BuildStyleItem("base-lyra", "chart", inliner.Options{})
	if err != nil {
		t.Fatal(err)
	}
	content := itemFileContent(t, lyra, "components/chart/chart.js")
	if !strings.Contains(content, "rounded-none") {
		t.Error("Lyra chart tooltip misses rounded-none")
	}

	luma, err := BuildStyleItem("base-luma", "chart", inliner.Options{})
	if err != nil {
		t.Fatal(err)
	}
	lumaMap, err := styleMapFor("luma")
	if err != nil {
		t.Fatal(err)
	}
	assertContainsClasses(t, "Luma chart", itemFileContent(t, luma, "components/chart/chart.js"), lumaMap["cn-chart-tooltip"])
}

func TestBuildStyleItemPreservesMarkerFreeJavaScript(t *testing.T) {
	t.Setenv("GO_ENV", "production")
	accordion, err := BuildStyleItem("base-nova", "accordion", inliner.Options{})
	if err != nil {
		t.Fatal(err)
	}
	got := itemFileContent(t, accordion, "components/accordion/accordion.js")
	source, err := componentSource("components/accordion/accordion.js")
	if err != nil {
		t.Fatal(err)
	}
	if got != string(source) {
		t.Error("marker-free accordion JavaScript changed during registry compilation")
	}
	if !contains(accordion.RegistryDependencies, "scripts") {
		t.Errorf("JavaScript component dependencies = %v, want scripts", accordion.RegistryDependencies)
	}
}

func TestBuildStyleItemCachesFontHeadingSeparately(t *testing.T) {
	t.Setenv("GO_ENV", "production")
	tests := []struct {
		name  string
		first inliner.Options
		last  inliner.Options
	}{
		{name: "disabled then enabled", first: inliner.Options{}, last: inliner.Options{FontHeading: true}},
		{name: "enabled then disabled", first: inliner.Options{FontHeading: true}, last: inliner.Options{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			itemMu.Lock()
			itemCache = map[itemKey]*Item{}
			itemMu.Unlock()

			first, err := BuildStyleItem("base-nova", "card", tt.first)
			if err != nil {
				t.Fatal(err)
			}
			last, err := BuildStyleItem("base-nova", "card", tt.last)
			if err != nil {
				t.Fatal(err)
			}
			firstContent := itemFileContent(t, first, "components/card/card.templ")
			lastContent := itemFileContent(t, last, "components/card/card.templ")
			assertFontHeadingOption(t, firstContent, tt.first.FontHeading)
			assertFontHeadingOption(t, lastContent, tt.last.FontHeading)
			if firstContent == lastContent {
				t.Error("font-heading options returned identical cached content")
			}
		})
	}
}

func TestStylesHandlerParsesFontHeadingStrictly(t *testing.T) {
	t.Setenv("GO_ENV", "production")
	tests := []struct {
		query string
		want  bool
	}{
		{query: "fontHeading=true", want: true},
		{query: "fontHeading=false", want: false},
		{query: "fontHeading=1", want: false},
		{query: "fontHeading=True", want: false},
		{query: "", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.query, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/r/styles/base-nova/card.json?"+tt.query, nil)
			request.SetPathValue("style", "base-nova")
			request.SetPathValue("file", "card.json")
			response := httptest.NewRecorder()
			StylesHandler().ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d; body = %s", response.Code, http.StatusOK, response.Body.String())
			}
			var item Item
			err := json.Unmarshal(response.Body.Bytes(), &item)
			if err != nil {
				t.Fatal(err)
			}
			assertFontHeadingOption(t, itemFileContent(t, &item, "components/card/card.templ"), tt.want)
		})
	}
}

func assertFontHeadingOption(t *testing.T, content string, want bool) {
	t.Helper()
	has := strings.Contains(content, "font-heading")
	if has != want {
		t.Errorf("font-heading presence = %t, want %t", has, want)
	}
}

func itemFileContent(t *testing.T, item *Item, path string) string {
	t.Helper()
	if item == nil {
		t.Fatalf("item containing %s is nil", path)
	}
	for _, file := range item.Files {
		if file.Path == path {
			return file.Content
		}
	}
	t.Fatalf("item %s does not contain %s", item.Name, path)
	return ""
}

func assertContainsClasses(t *testing.T, name, content, classes string) {
	t.Helper()
	if classes == "" {
		t.Fatalf("%s style map classes are empty", name)
	}
	for _, class := range strings.Fields(classes) {
		if !strings.Contains(content, class) {
			t.Errorf("%s misses class %q", name, class)
		}
	}
}

func TestBuildStyleIndex(t *testing.T) {
	item := BuildStyleIndex("base-nova")
	if item == nil {
		t.Fatal("index missing")
	}
	out, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	// files and cssVars are present but empty, like the golden index.json.
	for _, want := range []string{`"files":[]`, `"cssVars":{}`, `"type":"registry:style"`, `"name":"index"`} {
		if !strings.Contains(s, want) {
			t.Errorf("index item missing %s in %s", want, s)
		}
	}
	if BuildStyleIndex("base-bogus") != nil {
		t.Error("unknown style index returned an item")
	}
}

// A chart installed from the registry needs the Go scale as well as its
// templ source; otherwise buildModel refers to a missing setValueScale.
func TestChartRegistryIncludesScale(t *testing.T) {
	t.Setenv("GO_ENV", "production")
	item, err := BuildStyleItem("base-nova", "chart", inliner.Options{})
	if err != nil {
		t.Fatal(err)
	}
	source := itemFileContent(t, item, "components/chart/scale.go")
	if !strings.Contains(source, "func setValueScale(") {
		t.Fatal("chart registry is missing its value-scale implementation")
	}
}
