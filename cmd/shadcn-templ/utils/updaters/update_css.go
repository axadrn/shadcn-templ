// Package updaters is the pendant of shadcn/src/utils/updaters:
// update_css.go ports update-css-vars.ts and update-css.ts (the Tailwind v4
// path; shadcn-templ is v4-only). Instead of postcss the file is parsed into a
// small CSS node tree and re-rendered, so user formatting is normalized to
// the CLI's 2-space style.
package updaters

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/axadrn/shadcn-templ/v2/cmd/shadcn-templ/registry"
	moduleutils "github.com/axadrn/shadcn-templ/v2/utils"
)

// cssNode is one CSS construct: a declaration, a semicolon statement
// (at-rule without body, comment) or a block with children.
type cssNode struct {
	prelude  string // selector, at-rule prelude, statement text or comment
	block    bool
	children []*cssNode
	decl     bool
	prop     string
	value    string
}

var declRe = regexp.MustCompile(`^(--[\w-]+|[a-zA-Z][\w-]*)\s*:\s*(.+)$`)

// parseCSS splits CSS text into nodes, tracking strings and brackets so
// selectors like has-[:checked] or url(...) survive.
func parseCSS(input string) []*cssNode {
	var nodes []*cssNode
	i := 0
	n := len(input)

	for i < n {
		// Skip whitespace between nodes.
		for i < n && (input[i] == ' ' || input[i] == '\t' || input[i] == '\n' || input[i] == '\r') {
			i++
		}
		if i >= n {
			break
		}

		// Comments become verbatim statements.
		if strings.HasPrefix(input[i:], "/*") {
			end := strings.Index(input[i+2:], "*/")
			if end == -1 {
				nodes = append(nodes, &cssNode{prelude: input[i:]})
				break
			}
			nodes = append(nodes, &cssNode{prelude: input[i : i+2+end+2]})
			i += 2 + end + 2
			continue
		}

		// Accumulate until ';', '{' or EOF at depth zero.
		start := i
		var quote byte
		depth := 0
		for i < n {
			c := input[i]
			if quote != 0 {
				if c == quote && input[i-1] != '\\' {
					quote = 0
				}
				i++
				continue
			}
			switch c {
			case '"', '\'':
				quote = c
			case '(', '[':
				depth++
			case ')', ']':
				depth--
			}
			if depth == 0 && (c == ';' || c == '{') {
				break
			}
			i++
		}

		prelude := strings.TrimSpace(input[start:i])
		if i >= n || input[i] == ';' {
			if i < n {
				i++
			}
			if prelude == "" {
				continue
			}
			nodes = append(nodes, statementNode(prelude))
			continue
		}

		// Block: read balanced braces.
		i++ // consume '{'
		bodyStart := i
		braceDepth := 1
		quote = 0
		for i < n && braceDepth > 0 {
			c := input[i]
			if quote != 0 {
				if c == quote && input[i-1] != '\\' {
					quote = 0
				}
				i++
				continue
			}
			switch c {
			case '"', '\'':
				quote = c
			case '{':
				braceDepth++
			case '}':
				braceDepth--
			}
			i++
		}
		bodyEnd := i
		if braceDepth == 0 {
			bodyEnd = i - 1
		}
		nodes = append(nodes, &cssNode{
			prelude:  prelude,
			block:    true,
			children: parseCSS(input[bodyStart:bodyEnd]),
		})
	}

	return nodes
}

func statementNode(prelude string) *cssNode {
	if !strings.HasPrefix(prelude, "@") {
		if m := declRe.FindStringSubmatch(prelude); m != nil {
			return &cssNode{decl: true, prop: m[1], value: strings.TrimSpace(m[2])}
		}
	}
	return &cssNode{prelude: prelude}
}

// renderCSS re-renders the node tree with 2-space indentation. Top-level
// nodes get blank lines between groups (the ---break--- pendant).
func renderCSS(nodes []*cssNode) string {
	var b strings.Builder
	prevGroup := ""
	for i, node := range nodes {
		group := nodeGroup(node)
		if i > 0 && (node.block || group != prevGroup) {
			b.WriteString("\n")
		}
		renderNode(&b, node, 0)
		prevGroup = group
	}
	return b.String()
}

func nodeGroup(node *cssNode) string {
	if node.block {
		return "{" + node.prelude
	}
	if node.decl {
		return "decl"
	}
	if idx := strings.IndexAny(node.prelude, " \t"); idx > 0 {
		return node.prelude[:idx]
	}
	return node.prelude
}

func renderNode(b *strings.Builder, node *cssNode, depth int) {
	indent := strings.Repeat("  ", depth)
	switch {
	case node.decl:
		fmt.Fprintf(b, "%s%s: %s;\n", indent, node.prop, node.value)
	case node.block:
		fmt.Fprintf(b, "%s%s {\n", indent, node.prelude)
		for _, child := range node.children {
			renderNode(b, child, depth+1)
		}
		fmt.Fprintf(b, "%s}\n", indent)
	default:
		if strings.HasPrefix(node.prelude, "/*") {
			fmt.Fprintf(b, "%s%s\n", indent, node.prelude)
		} else {
			fmt.Fprintf(b, "%s%s;\n", indent, node.prelude)
		}
	}
}

// document wraps the top-level node list with the edit operations the
// updaters need.
type document struct {
	nodes []*cssNode
}

func (d *document) findBlock(prelude string) *cssNode {
	for _, node := range d.nodes {
		if node.block && node.prelude == prelude {
			return node
		}
	}
	return nil
}

func (d *document) ensureBlock(prelude string) *cssNode {
	if node := d.findBlock(prelude); node != nil {
		return node
	}
	node := &cssNode{prelude: prelude, block: true}
	d.nodes = append(d.nodes, node)
	return node
}

func (d *document) lastImportIndex() int {
	last := -1
	for i, node := range d.nodes {
		if !node.block && strings.HasPrefix(node.prelude, "@import") {
			last = i
		}
	}
	return last
}

func (d *document) insertAt(index int, node *cssNode) {
	d.nodes = append(d.nodes, nil)
	copy(d.nodes[index+1:], d.nodes[index:])
	d.nodes[index] = node
}

func findDecl(block *cssNode, prop string) *cssNode {
	for _, child := range block.children {
		if child.decl && child.prop == prop {
			return child
		}
	}
	return nil
}

// upsertDecl adds or updates a declaration. Without overwrite an existing
// declaration is kept (user-defined vars win, like the reference).
func upsertDecl(block *cssNode, prop, value string, overwrite bool) {
	if existing := findDecl(block, prop); existing != nil {
		if overwrite {
			existing.value = value
		}
		return
	}
	block.children = append(block.children, &cssNode{decl: true, prop: prop, value: value})
}

// CSSVarsOptions mirrors the transformCssVars options the CLI uses.
type CSSVarsOptions struct {
	// OverwriteCssVars overwrites existing variables (registry:theme/style/
	// base installs); component installs keep user values.
	OverwriteCssVars bool
}

// isLocalHSLValue is the isLocalHSLValue pendant.
func isLocalHSLValue(value string) bool {
	if strings.HasPrefix(value, "hsl") || strings.HasPrefix(value, "rgb") ||
		strings.HasPrefix(value, "#") || strings.HasPrefix(value, "oklch") {
		return false
	}
	chunks := strings.Split(value, " ")
	if len(chunks) != 3 {
		return false
	}
	return strings.Contains(chunks[1], "%") && strings.Contains(chunks[2], "%")
}

// isColorValue is the isColorValue pendant.
func isColorValue(value string) bool {
	return strings.HasPrefix(value, "hsl") || strings.HasPrefix(value, "rgb") ||
		strings.HasPrefix(value, "#") || strings.HasPrefix(value, "oklch") ||
		strings.Contains(value, "--color-")
}

func varProp(key string) string {
	return "--" + strings.TrimPrefix(key, "--")
}

// transformCssVars is the transformCssVars pendant (v4 path): the dark custom
// variant, :root/.dark/@theme inline variables and the @theme color and
// radius mappings.
func transformCssVars(doc *document, cssVars *registry.ItemVars, options CSSVarsOptions) {
	if cssVars.Empty() {
		return
	}

	addCustomVariant(doc, "dark (&:is(.dark *))")

	// Theme variables go into @theme inline.
	if cssVars.Theme.Len() > 0 {
		themeNode := doc.ensureBlock("@theme inline")
		for _, key := range cssVars.Theme.Keys {
			upsertDecl(themeNode, varProp(key), cssVars.Theme.GetString(key), options.OverwriteCssVars)
		}
	}

	// Light -> :root, dark -> .dark.
	// :root before .dark, like shadcn's output; a map range would order
	// them at random from run to run.
	for _, block := range []struct {
		selector string
		vars     *registry.OrderedMap
	}{{":root", cssVars.Light}, {".dark", cssVars.Dark}} {
		selector, vars := block.selector, block.vars
		if vars.Len() == 0 {
			continue
		}
		rule := doc.ensureBlock(selector)
		for _, key := range vars.Keys {
			prop := varProp(key)
			if prop == "--sidebar-background" {
				prop = "--sidebar"
			}
			value := vars.GetString(key)
			if isLocalHSLValue(value) {
				value = "hsl(" + value + ")"
			}
			upsertDecl(rule, prop, value, options.OverwriteCssVars)
		}
	}

	updateTheme(doc, cssVars)
}

// addCustomVariant is the addCustomVariant pendant.
func addCustomVariant(doc *document, params string) {
	for _, node := range doc.nodes {
		if !node.block && strings.HasPrefix(node.prelude, "@custom-variant") {
			return
		}
	}
	variant := &cssNode{prelude: "@custom-variant " + params}
	if last := doc.lastImportIndex(); last >= 0 {
		doc.insertAt(last+1, variant)
	} else if len(doc.nodes) > 0 {
		doc.insertAt(1, variant)
	} else {
		doc.nodes = append(doc.nodes, variant)
	}
}

// updateTheme is the updateThemePlugin pendant: map color variables into
// @theme inline (--color-x: var(--x)) and expand radius into the scale.
func updateTheme(doc *document, cssVars *registry.ItemVars) {
	var variables []string
	seen := map[string]bool{}
	valueOf := map[string]string{}
	for _, vars := range []*registry.OrderedMap{cssVars.Theme, cssVars.Light, cssVars.Dark} {
		if vars == nil {
			continue
		}
		for _, key := range vars.Keys {
			if !seen[key] {
				seen[key] = true
				variables = append(variables, key)
			}
			if _, ok := valueOf[key]; !ok {
				valueOf[key] = vars.GetString(key)
			}
		}
	}
	if len(variables) == 0 {
		return
	}

	themeNode := doc.ensureBlock("@theme inline")

	for _, variable := range variables {
		value := valueOf[variable]
		if value == "" {
			continue
		}

		if variable == "radius" {
			for _, radius := range [][2]string{
				{"sm", "calc(var(--radius) * 0.6)"},
				{"md", "calc(var(--radius) * 0.8)"},
				{"lg", "var(--radius)"},
				{"xl", "calc(var(--radius) * 1.4)"},
				{"2xl", "calc(var(--radius) * 1.8)"},
				{"3xl", "calc(var(--radius) * 2.2)"},
				{"4xl", "calc(var(--radius) * 2.6)"},
			} {
				upsertDecl(themeNode, "--radius-"+radius[0], radius[1], false)
			}
			continue
		}

		prop := varProp(variable)
		if isLocalHSLValue(value) || isColorValue(value) {
			prop = "--color-" + strings.TrimPrefix(variable, "--")
		}
		if prop == "--color-sidebar-background" {
			prop = "--color-sidebar"
		}
		propValue := "var(" + varProp(variable) + ")"
		if prop == "--color-sidebar" {
			propValue = "var(--sidebar)"
		}
		upsertDecl(themeNode, prop, propValue, false)
	}
}

// transformCss is the transformCss/updateCssPlugin pendant for the shapes the
// shadcn-templ registry serves: @import statements, at-rule blocks (@layer base)
// with nested rules, declarations and bodiless at-rules (@apply).
func transformCss(doc *document, css *registry.OrderedMap) {
	for _, key := range css.Keys {
		value, _ := css.Get(key)
		properties, isMap := value.(*registry.OrderedMap)

		if strings.HasPrefix(key, "@") {
			name, params, _ := strings.Cut(strings.TrimPrefix(key, "@"), " ")
			switch {
			case name == "import":
				addImport(doc, params)
			case isMap && properties.Len() == 0:
				// Bodiless at-rule at the top level.
				if !hasStatement(doc.nodes, key) {
					doc.nodes = append(doc.nodes, &cssNode{prelude: key})
				}
			default:
				processAtRule(doc, key, properties)
			}
			continue
		}

		if isMap {
			processRule(doc.ensureBlockList(), key, properties)
		}
	}
}

// ensureBlockList adapts the document root to the child-list interface of
// processRule.
func (d *document) ensureBlockList() *[]*cssNode {
	return &d.nodes
}

func hasStatement(nodes []*cssNode, prelude string) bool {
	for _, node := range nodes {
		if !node.block && node.prelude == prelude {
			return true
		}
	}
	return false
}

// addImport dedupes on the unquoted params and inserts after the last
// import, or prepends.
func addImport(doc *document, params string) {
	unquote := func(s string) string { return strings.Trim(s, `"'`) }
	for _, node := range doc.nodes {
		if !node.block && strings.HasPrefix(node.prelude, "@import") {
			existing := strings.TrimSpace(strings.TrimPrefix(node.prelude, "@import"))
			if unquote(existing) == unquote(params) {
				return
			}
		}
	}
	importNode := &cssNode{prelude: "@import " + params}
	if last := doc.lastImportIndex(); last >= 0 {
		doc.insertAt(last+1, importNode)
	} else {
		doc.insertAt(0, importNode)
	}
}

func processAtRule(doc *document, prelude string, properties *registry.OrderedMap) {
	atRule := doc.ensureBlock(prelude)
	if properties == nil {
		return
	}
	for _, childKey := range properties.Keys {
		childValue, _ := properties.Get(childKey)
		childMap, isMap := childValue.(*registry.OrderedMap)
		if strings.HasPrefix(childKey, "@") {
			nested := &document{nodes: atRule.children}
			processAtRule(nested, childKey, childMap)
			atRule.children = nested.nodes
			continue
		}
		if isMap {
			processRule(&atRule.children, childKey, childMap)
		}
	}
}

// processRule is the processRule pendant. @apply statements merge via
// CN like the reference.
func processRule(parent *[]*cssNode, selector string, properties *registry.OrderedMap) {
	var rule *cssNode
	for _, node := range *parent {
		if node.block && node.prelude == selector {
			rule = node
			break
		}
	}
	if rule == nil {
		rule = &cssNode{prelude: selector, block: true}
		*parent = append(*parent, rule)
	}

	for _, prop := range properties.Keys {
		value, _ := properties.Get(prop)
		valueMap, isMap := value.(*registry.OrderedMap)

		switch {
		case strings.HasPrefix(prop, "@") && isMap && valueMap.Len() == 0:
			if hasStatement(rule.children, prop) {
				continue
			}
			if params, ok := strings.CutPrefix(prop, "@apply "); ok {
				merged := false
				for _, child := range rule.children {
					if !child.block && strings.HasPrefix(child.prelude, "@apply ") {
						child.prelude = "@apply " + moduleutils.CN(strings.TrimPrefix(child.prelude, "@apply "), params)
						merged = true
						break
					}
				}
				if merged {
					continue
				}
			}
			rule.children = append(rule.children, &cssNode{prelude: prop})
		case isMap:
			nestedSelector := prop
			if after, ok := strings.CutPrefix(prop, "&"); ok {
				nestedSelector = selector + after
			}
			processRule(parent, nestedSelector, valueMap)
		default:
			if s, ok := value.(string); ok {
				upsertDecl(rule, prop, s, true)
			}
		}
	}
}

// UpdateCSSOptions configures UpdateCSS.
type UpdateCSSOptions struct {
	CSSVars          *registry.ItemVars
	CSS              *registry.OrderedMap
	OverwriteCssVars bool
}

// UpdateCSS is the updateCss pendant: apply cssVars and the css block to the
// user's Tailwind entry file. Returns the relative "./x.css" import targets
// found in the css block so the caller can vendor those files next to the
// entry file.
func UpdateCSS(tailwindCSSPath string, options UpdateCSSOptions) ([]string, error) {
	hasVars := options.CSSVars != nil && !options.CSSVars.Empty()
	hasCSS := options.CSS.Len() > 0
	if !hasVars && !hasCSS {
		return nil, nil
	}

	data, err := os.ReadFile(tailwindCSSPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read %s: %w", tailwindCSSPath, err)
	}

	doc := &document{nodes: parseCSS(string(data))}
	if hasVars {
		transformCssVars(doc, options.CSSVars, CSSVarsOptions{OverwriteCssVars: options.OverwriteCssVars})
	}
	if hasCSS {
		transformCss(doc, options.CSS)
	}

	if err := os.WriteFile(tailwindCSSPath, []byte(renderCSS(doc.nodes)), 0o644); err != nil {
		return nil, err
	}

	return relativeImports(options.CSS), nil
}

// relativeImports lists "./name.css" targets of @import keys in the css
// block.
func relativeImports(css *registry.OrderedMap) []string {
	if css == nil {
		return nil
	}
	var out []string
	for _, key := range css.Keys {
		params, ok := strings.CutPrefix(key, "@import ")
		if !ok {
			continue
		}
		target := strings.Trim(params, `"'`)
		if strings.HasPrefix(target, "./") {
			out = append(out, strings.TrimPrefix(target, "./"))
		}
	}
	return out
}
