package utils

import (
	"context"
	"crypto/rand"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/a-h/templ"

	twmerge "github.com/Oudwins/tailwind-merge-go"
)

// CN combines Tailwind classes and resolves conflicts (definition below).
// Example: "bg-red-500 hover:bg-blue-500", "bg-green-500" → "hover:bg-blue-500 bg-green-500"
// tailwind-merge-go does not understand two pieces of Tailwind v4 syntax yet,
// so conflicts against such classes were never resolved:
//   - the variable shorthand px-(--card-spacing), translated to the v3
//     arbitrary form px-[var(--card-spacing)] for the merge and back after
//   - the trailing important marker p-2!, translated to the v3 prefix form
//     !p-2 for the merge and back after
//
// The repo uses the v4 forms exclusively, so the back translations cannot
// collide. DELETE this shim (the regexes, twImportant* and their calls) once
// github.com/Oudwins/tailwind-merge-go parses the v4 syntax natively.
var (
	twV4Var = regexp.MustCompile(`-\((--[A-Za-z0-9-]+)\)`)
	twV3Var = regexp.MustCompile(`-\[var\((--[A-Za-z0-9-]+)\)\]`)
)

// lastTopLevelColon returns the index of the last variant separator outside
// of square brackets, or -1 (arbitrary values may contain colons, e.g.
// has-[:checked]:bg-primary).
func lastTopLevelColon(s string) int {
	depth, last := 0, -1
	for i, r := range s {
		switch r {
		case '[':
			depth++
		case ']':
			depth--
		case ':':
			if depth == 0 {
				last = i
			}
		}
	}
	return last
}

// twImportantToV3 rewrites a trailing v4 important marker onto the base
// utility: group-data-[x]:p-2! → group-data-[x]:!p-2.
func twImportantToV3(token string) string {
	if !strings.HasSuffix(token, "!") {
		return token
	}
	base := strings.TrimSuffix(token, "!")
	i := lastTopLevelColon(base)
	return base[:i+1] + "!" + base[i+1:]
}

// twImportantToV4 moves the prefix marker back to the v4 trailing position.
func twImportantToV4(token string) string {
	i := lastTopLevelColon(token)
	if i+1 >= len(token) || token[i+1] != '!' {
		return token
	}
	return token[:i+1] + token[i+2:] + "!"
}

func twMapTokens(s string, f func(string) string) string {
	if !strings.Contains(s, "!") {
		return s
	}
	tokens := strings.Fields(s)
	for i, t := range tokens {
		tokens[i] = f(t)
	}
	return strings.Join(tokens, " ")
}

// twReorder re-emits the classes that survived a merge in the order they had
// in the input. tailwind-merge-go collects the survivors in a map and ranges
// over it, so the order it returns is the random map order, while the JS
// tailwind-merge walks the list and keeps the original order. cn() depends on
// that order: "p-2 pb-11" is padding with a taller bottom, "pb-11 p-2" is just
// padding, so a merge that reorders turns the next merge over its own output
// into a silent loss. Of repeated classes the last one wins, as in the JS
// implementation, hence the walk from the right.
func twReorder(input, merged string) string {
	survivors := strings.Fields(merged)
	if len(survivors) < 2 {
		return merged
	}
	remaining := make(map[string]int, len(survivors))
	for _, c := range survivors {
		remaining[c]++
	}
	ordered := make([]string, 0, len(survivors))
	tokens := strings.Fields(input)
	for i := len(tokens) - 1; i >= 0; i-- {
		if remaining[tokens[i]] == 0 {
			continue
		}
		remaining[tokens[i]]--
		ordered = append(ordered, tokens[i])
	}
	// Every survivor is one of the input tokens, verbatim. Should that ever
	// stop holding, the merge result is still correct, only unordered.
	if len(ordered) != len(survivors) {
		return merged
	}
	slices.Reverse(ordered)
	return strings.Join(ordered, " ")
}

// CN is the cn() pendant of shadcn's lib/utils, twMerge(clsx(...inputs)):
// it flattens clsx-style inputs - strings, string slices, nested []any and
// map[string]bool conditionals (false and empty values drop out) - then
// resolves Tailwind conflicts with the last class winning, in input order.
func CN(classes ...any) string {
	flat := flattenClasses(classes)
	merged := make([]string, len(flat))
	for i, c := range flat {
		merged[i] = twMapTokens(twV4Var.ReplaceAllString(c, "-[var($1)]"), twImportantToV3)
	}
	input := strings.Join(merged, " ")
	out := twMapTokens(twReorder(input, twmerge.Merge(merged...)), twImportantToV4)
	return twV3Var.ReplaceAllString(out, "-($1)")
}

// flattenClasses is the clsx flattening: the object form is sorted for a
// stable output because Go maps have no iteration order.
func flattenClasses(values []any) []string {
	var out []string
	for _, v := range values {
		switch t := v.(type) {
		case nil:
		case string:
			if t != "" {
				out = append(out, t)
			}
		case []string:
			for _, c := range t {
				if c != "" {
					out = append(out, c)
				}
			}
		case []any:
			out = append(out, flattenClasses(t)...)
		case map[string]bool:
			keys := make([]string, 0, len(t))
			for c, on := range t {
				if on && c != "" {
					keys = append(keys, c)
				}
			}
			slices.Sort(keys)
			out = append(out, keys...)
		}
	}
	return out
}

// Ptr returns a pointer to v. Useful for optional props whose zero value is
// meaningful (e.g. togglegroup.Props{Spacing: utils.Ptr(0)}).
func Ptr[T any](v T) *T {
	return &v
}

// IfElse returns trueValue if condition is true, otherwise falseValue.
// Example: true, "bg-red-500", "bg-gray-300" → "bg-red-500"
func IfElse[T any](condition bool, trueValue T, falseValue T) T {
	if condition {
		return trueValue
	}
	return falseValue
}

// Map returns f applied to every element of s.
// Example: Map(fruits, func(f fruit) selectcomp.ItemData { ... }) → items
func Map[T, U any](s []T, f func(T) U) []U {
	out := make([]U, len(s))
	for i, v := range s {
		out[i] = f(v)
	}
	return out
}

// MergeAttributes combines multiple Attributes into one.
// Example: MergeAttributes(attr1, attr2) → combined attributes
func MergeAttributes(attrs ...templ.Attributes) templ.Attributes {
	merged := templ.Attributes{}
	for _, attr := range attrs {
		for k, v := range attr {
			merged[k] = v
		}
	}
	return merged
}

type directionKey struct{}

// WithDirection is Base UI's DirectionProvider context: components below it
// read the text direction from ctx (see components/direction).
func WithDirection(ctx context.Context, direction string) context.Context {
	return context.WithValue(ctx, directionKey{}, direction)
}

// Direction is useDirection: the nearest DirectionProvider's direction,
// "ltr" without one.
func Direction(ctx context.Context) string {
	if direction, ok := ctx.Value(directionKey{}).(string); ok && direction != "" {
		return direction
	}
	return "ltr"
}

// DirectionAttributes renders a DirectionProvider's direction on a part
// whose script reads it (window.templ.direction): data-templ-direction, a
// port marker for the context React keeps in memory. Nothing without a
// provider.
func DirectionAttributes(ctx context.Context) templ.Attributes {
	if direction, ok := ctx.Value(directionKey{}).(string); ok && direction != "" {
		return templ.Attributes{"data-templ-direction": direction}
	}
	return templ.Attributes{}
}

// RandomID generates a random ID string.
// Example: RandomID() → "id-1a2b3c"
func RandomID() string {
	return fmt.Sprintf("id-%s", rand.Text())
}

// ScriptVersion is a timestamp generated at app start for cache busting.
// Used in component script tags to append ?v=<timestamp> to script URLs.
var ScriptVersion = fmt.Sprintf("%d", time.Now().Unix())

// ScriptURL generates cache-busted script URLs.
// Override this to use custom cache busting (CDN, content hashing, etc.)
//
// Example override in your app:
//
//	func init() {
//	    utils.ScriptURL = func(path string) string {
//	        return myAssetManifest.GetURL(path)
//	    }
//	}
var ScriptURL = func(path string) string {
	return path + "?v=" + ScriptVersion
}
