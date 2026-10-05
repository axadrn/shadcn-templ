// Port of shadcn packages/shadcn/src/utils/transformers/transform-rtl.ts:
// with config.rtl, every class string goes through applyRtlMapping, which
// turns physical utilities into logical ones (ml- to ms-, left- to start-,
// text-left to text-start), adds rtl: variants where there is no logical
// utility (translate-x, space-x, divide-x, the resize cursors), maps the
// slide animations inside the logical side variants, and replaces the
// cn-rtl-flip marker with rtl:rotate-180. Without RTL the transformer is a
// no-op and transformCleanup strips the marker.
//
// The side prop part of the source (ContextMenuContent, ContextMenuSubContent
// and DropdownMenuSubContent defaults from right/left to inline-end/
// inline-start) has no class string to rewrite here: those defaults are the
// scripts' and templ's own, see their components.
package inliner

import "strings"

// rtlFlipMarker mirrors RTL_FLIP_MARKER.
const rtlFlipMarker = "cn-rtl-flip"

// rtlMappings is RTL_MAPPINGS: physical to logical, direct replacement. Order
// matters: negative before positive, corners before sides, with value before
// without.
var rtlMappings = [][2]string{
	{"-ml-", "-ms-"},
	{"-mr-", "-me-"},
	{"ml-", "ms-"},
	{"mr-", "me-"},
	{"pl-", "ps-"},
	{"pr-", "pe-"},
	{"-left-", "-start-"},
	{"-right-", "-end-"},
	{"left-", "start-"},
	{"right-", "end-"},
	{"inset-l-", "inset-inline-start-"},
	{"inset-r-", "inset-inline-end-"},
	{"rounded-tl-", "rounded-ss-"},
	{"rounded-tr-", "rounded-se-"},
	{"rounded-bl-", "rounded-es-"},
	{"rounded-br-", "rounded-ee-"},
	{"rounded-l-", "rounded-s-"},
	{"rounded-r-", "rounded-e-"},
	{"border-l-", "border-s-"},
	{"border-r-", "border-e-"},
	{"border-l", "border-s"},
	{"border-r", "border-e"},
	{"text-left", "text-start"},
	{"text-right", "text-end"},
	{"scroll-ml-", "scroll-ms-"},
	{"scroll-mr-", "scroll-me-"},
	{"scroll-pl-", "scroll-ps-"},
	{"scroll-pr-", "scroll-pe-"},
	{"float-left", "float-start"},
	{"float-right", "float-end"},
	{"clear-left", "clear-start"},
	{"clear-right", "clear-end"},
	{"origin-top-left", "origin-top-start"},
	{"origin-top-right", "origin-top-end"},
	{"origin-bottom-left", "origin-bottom-start"},
	{"origin-bottom-right", "origin-bottom-end"},
	{"origin-left", "origin-start"},
	{"origin-right", "origin-end"},
}

// rtlTranslateXMappings is RTL_TRANSLATE_X_MAPPINGS: an added rtl: variant
// with the opposite sign.
var rtlTranslateXMappings = [][2]string{
	{"-translate-x-", "translate-x-"},
	{"translate-x-", "-translate-x-"},
}

// rtlReverseMappings is RTL_REVERSE_MAPPINGS: an added rtl:*-reverse.
var rtlReverseMappings = [][2]string{
	{"space-x-", "space-x-reverse"},
	{"divide-x-", "divide-x-reverse"},
}

// rtlSwapMappings is RTL_SWAP_MAPPINGS: an added rtl: variant with the
// swapped value.
var rtlSwapMappings = [][2]string{
	{"cursor-w-resize", "cursor-e-resize"},
	{"cursor-e-resize", "cursor-w-resize"},
}

// rtlLogicalSideSlideMappings is RTL_LOGICAL_SIDE_SLIDE_MAPPINGS:
// [variant, physical, logical].
var rtlLogicalSideSlideMappings = [][3]string{
	{"data-[side=inline-start]", "slide-in-from-right", "slide-in-from-end"},
	{"data-[side=inline-start]", "slide-out-to-right", "slide-out-to-end"},
	{"data-[side=inline-end]", "slide-in-from-left", "slide-in-from-start"},
	{"data-[side=inline-end]", "slide-out-to-left", "slide-out-to-start"},
}

// positioningPrefixes is POSITIONING_PREFIXES, skipped inside physical side
// variants.
var positioningPrefixes = []string{"-left-", "-right-", "left-", "right-"}

// transformRtl runs applyRtlMapping over every string literal (transformRtl
// with config.rtl).
func transformRtl(sourceFile *sourceFile, _ StyleMap, opts Options) {
	if !opts.RTL {
		return
	}

	sourceFile.forEachStringLiteral(applyRtlMapping)
}

// splitClassName ports transform-css-vars.ts splitClassName: [variant, name,
// alpha], the variant split at the last colon outside brackets, the alpha
// after the last slash of the rest.
func splitClassName(className string) (variant, name, alpha string) {
	if !strings.Contains(className, "/") && !strings.Contains(className, ":") {
		return "", className, ""
	}

	lastColonIndex := -1
	bracketDepth := 0
	for i := len(className) - 1; i >= 0; i-- {
		switch className[i] {
		case ']':
			bracketDepth++
		case '[':
			bracketDepth--
		case ':':
			if bracketDepth == 0 {
				lastColonIndex = i
			}
		}
		if lastColonIndex != -1 {
			break
		}
	}

	nameWithAlpha := className
	if lastColonIndex != -1 {
		variant = className[:lastColonIndex]
		nameWithAlpha = className[lastColonIndex+1:]
	}

	slashIndex := strings.LastIndex(nameWithAlpha, "/")
	if slashIndex == -1 {
		return variant, nameWithAlpha, ""
	}
	return variant, nameWithAlpha[:slashIndex], nameWithAlpha[slashIndex+1:]
}

// ApplyRtlMapping is applyRtlMapping for callers outside the pipeline, e.g.
// the Tailwind candidates generator, which must list the RTL forms.
func ApplyRtlMapping(input string) string {
	return applyRtlMapping(input)
}

// applyRtlMapping ports applyRtlMapping for one class string.
func applyRtlMapping(input string) string {
	classNames := strings.Split(input, " ")
	out := make([]string, 0, len(classNames))
	for _, className := range classNames {
		out = append(out, rtlClass(className)...)
	}
	return strings.Join(out, " ")
}

func withModifier(value, modifier string) string {
	if modifier != "" {
		return value + "/" + modifier
	}
	return value
}

func withVariant(variant, value string) string {
	if variant != "" {
		return variant + ":" + value
	}
	return value
}

func rtlClass(className string) []string {
	// Classes that already have an rtl: or ltr: prefix stay.
	if strings.HasPrefix(className, "rtl:") || strings.HasPrefix(className, "ltr:") {
		return []string{className}
	}

	if className == rtlFlipMarker {
		return []string{"rtl:rotate-180"}
	}

	variant, value, modifier := splitClassName(className)
	if value == "" {
		return []string{className}
	}

	// translate-x: an added rtl: variant, nothing replaced.
	for _, m := range rtlTranslateXMappings {
		if strings.HasPrefix(value, m[0]) {
			rtlValue := strings.Replace(value, m[0], m[1], 1)
			return []string{className, "rtl:" + withVariant(variant, withModifier(rtlValue, modifier))}
		}
	}

	// space-x and divide-x: an added rtl:*-reverse.
	for _, m := range rtlReverseMappings {
		if strings.HasPrefix(value, m[0]) {
			return []string{className, "rtl:" + withVariant(variant, m[1])}
		}
	}

	// Cursors: an added rtl: variant with the swapped value.
	for _, m := range rtlSwapMappings {
		if value == m[0] {
			return []string{className, "rtl:" + withVariant(variant, m[1])}
		}
	}

	// Slide animations inside the logical side variants.
	for _, m := range rtlLogicalSideSlideMappings {
		if variant != "" && strings.Contains(variant, m[0]) && strings.HasPrefix(value, m[1]) {
			mapped := strings.Replace(value, m[1], m[2], 1)
			return []string{withVariant(variant, withModifier(mapped, modifier))}
		}
	}

	// Inside a physical side variant positioning stays physical
	// (data-[side=left]:-right-1 is not data-[side=left]:-end-1).
	isPhysicalSideVariant := strings.Contains(variant, "data-[side=left]") || strings.Contains(variant, "data-[side=right]")

	mappedValue := value
	for _, m := range rtlMappings {
		physical, logical := m[0], m[1]
		if isPhysicalSideVariant && hasAnyPrefix(physical, positioningPrefixes) {
			continue
		}
		if strings.HasPrefix(value, physical) {
			// Without a trailing dash only the exact class matches (border-ring
			// is not border-r).
			if !strings.HasSuffix(physical, "-") && value != physical {
				continue
			}
			mappedValue = strings.Replace(value, physical, logical, 1)
			break
		}
	}

	return []string{withVariant(variant, withModifier(mappedValue, modifier))}
}

func hasAnyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

// replaceToken replaces whole space-separated tokens, preserving the
// surrounding class order (the split(" ")/flatMap walk of applyRtlMapping).
func replaceToken(value, token, replacement string) string {
	fields, changed := splitFieldsIfToken(value, token)
	if !changed {
		return value
	}
	for i, field := range fields {
		if field == token {
			fields[i] = replacement
		}
	}
	return joinFields(fields)
}
