package questionnaire

import (
	"bytes"
	"context"
	"io"
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

func contains(t *testing.T, html string, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(html, want) {
			t.Fatalf("missing %q in:\n%s", want, html)
		}
	}
}

func TestRootRendersCollectionState(t *testing.T) {
	items := []ItemDefinition{{Name: "a", Required: true}, {Name: "b"}, {Name: "c", Disabled: true}}
	html := render(t, Questionnaire(Props{Items: items, DefaultItem: "b", Shortcuts: ShortcutsLetters}))
	contains(t, html,
		`data-slot="questionnaire"`,
		`data-current="2"`,
		`data-last`,
		`data-total="2"`,
		`data-shortcuts="letters"`,
		`data-templ-default-item="b"`,
		`data-templ-items="[{&#34;name&#34;:&#34;a&#34;,&#34;required&#34;:true}`,
		`novalidate`,
	)
}

func TestControlledItem(t *testing.T) {
	item := "b"
	html := render(t, Questionnaire(Props{Item: &item, Items: []ItemDefinition{{Name: "a"}, {Name: "b"}}}))
	contains(t, html, `data-templ-item="b"`, `data-current="2"`)
}

func TestItemPartsAndShortcuts(t *testing.T) {
	items := []ItemDefinition{{Name: "a", Required: true, Choices: []ChoiceDefinition{{Value: "x"}, {Value: "y"}}}}
	var out bytes.Buffer
	root := Questionnaire(Props{Items: items, Shortcuts: ShortcutsNumbers})
	choices := templ.ComponentFunc(func(ctx context.Context, w io.Writer) error {
		if err := Choice(ChoiceProps{Value: "x"}).Render(ctx, w); err != nil {
			return err
		}
		return Choice(ChoiceProps{Value: "y", DefaultChecked: true}).Render(ctx, w)
	})
	item := templ.ComponentFunc(func(ctx context.Context, w io.Writer) error {
		return Item(ItemProps{Name: "a", Required: true}).Render(templ.WithChildren(ctx, choices), w)
	})
	if err := root.Render(templ.WithChildren(context.Background(), item), &out); err != nil {
		t.Fatal(err)
	}
	html := out.String()
	contains(t, html,
		`data-slot="questionnaire-item"`,
		`data-templ-name="a"`,
		`data-active`,
		`data-required`,
		`data-status="unanswered"`,
		`tabindex="-1"`,
		`data-slot="questionnaire-choice"`,
		`data-shortcut="1"`,
		`data-shortcut="2"`,
		`data-type="radio"`,
		`data-slot="questionnaire-choice-input"`,
		`name="a"`,
		`aria-keyshortcuts="2 Enter"`,
		`checked`,
		`data-slot="questionnaire-choice-indicator-check"`,
	)
}

func TestNavigationVisibility(t *testing.T) {
	items := []ItemDefinition{{Name: "a"}, {Name: "b"}}
	nav := templ.ComponentFunc(func(ctx context.Context, w io.Writer) error {
		for _, c := range []templ.Component{Previous(), Skip(), Next(), Submit()} {
			if err := c.Render(ctx, w); err != nil {
				return err
			}
		}
		return nil
	})
	var out bytes.Buffer
	if err := Questionnaire(Props{Items: items}).Render(templ.WithChildren(context.Background(), nav), &out); err != nil {
		t.Fatal(err)
	}
	html := out.String()
	contains(t, html,
		`data-slot="questionnaire-next" data-size="default" data-variant="default" data-shortcut="Enter" aria-keyshortcuts="Enter"`,
		`data-slot="questionnaire-previous" data-size="default" data-variant="outline" data-status="unanswered" data-hidden aria-hidden="true" hidden inert tabindex="-1"`,
		`data-slot="questionnaire-skip"`,
		`>Skip</button>`,
		`type="submit" data-slot="questionnaire-submit"`,
	)
}

func TestClientDispatchesOwnerEvents(t *testing.T) {
	source, err := os.ReadFile("questionnaire.js")
	if err != nil {
		t.Fatal(err)
	}
	js := string(source)
	for _, want := range []string{`"questionnaire-item-change"`, `"questionnaire-status-change"`, `data-templ-item`, `window.templ.questionnaire`} {
		if !strings.Contains(js, want) {
			t.Fatalf("client behavior is missing %q", want)
		}
	}
}
