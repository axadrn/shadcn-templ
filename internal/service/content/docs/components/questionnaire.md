---
title: Questionnaire
description: A multi-step questionnaire with single-choice, multiple-choice, freeform, and skippable questions.
---

<ComponentPreview name="questionnaire-demo" previewClassName="min-h-[560px] p-4 sm:p-8" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add questionnaire
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="questionnaire" title="components/questionnaire/questionnaire.templ" />

<ComponentSource name="questionnaire" title="components/questionnaire/questionnaire.js" />

<ComponentSource name="questionnaire" title="components/baseui/lifecycle.js" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/questionnaire"
```

```templ showLineNumbers
@questionnaire.Questionnaire(questionnaire.Props{
	ID: "plan",
	Items: []questionnaire.ItemDefinition{
		{Name: "direction", Required: true},
		{Name: "detail"},
	},
}) {
	@questionnaire.Progress()
	@questionnaire.Item(questionnaire.ItemProps{Name: "direction", Required: true}) {
		@questionnaire.Title() {
			What should we prototype next?
		}
		@questionnaire.Description() {
			Choose a direction or write your own.
		}
		@questionnaire.Choices() {
			@questionnaire.Choice(questionnaire.ChoiceProps{Value: "delegation"}) {
				<span class="font-medium">Delegation</span>
				<span class="text-muted-foreground">Show how work moves to a specialist.</span>
			}
			@questionnaire.Choice(questionnaire.ChoiceProps{Value: "questions"}) {
				Question prompts
			}
			@questionnaire.Input(questionnaire.InputProps{
				Attributes: templ.Attributes{"aria-label": "Another answer", "placeholder": "Type another answer…"},
			})
		}
		@questionnaire.Error()
	}
	@questionnaire.Item(questionnaire.ItemProps{Name: "detail"}) {
		@questionnaire.Title() {
			How much detail should it include?
		}
		@questionnaire.Choices() {
			@questionnaire.Choice(questionnaire.ChoiceProps{Value: "focused"}) {
				Focused
			}
			@questionnaire.Choice(questionnaire.ChoiceProps{Value: "complete"}) {
				Complete flow
			}
		}
		@questionnaire.Error()
	}
	@questionnaire.Actions() {
		@questionnaire.Previous()
		@questionnaire.Skip()
		@questionnaire.Next()
		@questionnaire.Submit()
	}
}
```

`Questionnaire` renders a native form. Read the answers with `FormData` in a
submit listener (or post the form to the server):

```js
document.getElementById("plan").addEventListener("submit", (event) => {
  event.preventDefault()
  const answers = new FormData(event.currentTarget)
  // answers.get("direction"), answers.getAll(...) for multiple items.
})
```

## Composition

```text
questionnaire.Questionnaire
├── questionnaire.Progress
├── questionnaire.Item
│   ├── questionnaire.Title
│   ├── questionnaire.Description
│   ├── questionnaire.Choices
│   │   ├── questionnaire.Choice
│   │   └── questionnaire.Input
│   └── questionnaire.Error
└── questionnaire.Actions
    ├── questionnaire.Previous
    ├── questionnaire.Skip
    ├── questionnaire.Next
    └── questionnaire.Submit
```

Questionnaire owns the ordered items, active item, answer state, validation,
progress, and navigation. The containing page, card, dialog, or drawer owns
close and cancellation behavior, persistence, transport, and branching.

## Server Rendering

Pass `Items` to server-render the active item, progress, actions, and answer
shortcuts.

## Multiple Selection

Use `Multiple` for an item that accepts more than one fixed answer.

<ComponentPreview name="questionnaire-multiple" previewClassName="min-h-[420px] p-4 sm:p-8" />

## Freeform Answer

Compose `questionnaire.Input` with fixed choices when the user can provide another answer.

<ComponentPreview name="questionnaire-freeform" previewClassName="min-h-[420px] p-4 sm:p-8" />

## Explicit Skip

Add `questionnaire.Skip` when an optional item may be intentionally left unanswered.

<ComponentPreview name="questionnaire-skip" previewClassName="min-h-[520px] p-4 sm:p-8" />

## Shortcuts

Assign a letter or number key to each answer with `Shortcuts`.

<ComponentPreview name="questionnaire-shortcuts" previewClassName="min-h-[480px] p-4 sm:p-8" />

## Custom Validation

Combine controlled navigation with your own schema to return to an invalid item and present its error.

<ComponentPreview name="questionnaire-validation" previewClassName="min-h-[520px] p-4 sm:p-8" />

## Controlled

Control the active item from host state, such as returning to an invalid step.
Set `Item` and commit every `questionnaire-item-change` event with
`window.templ.questionnaire.setItem(root, event.detail.item)`.

<ComponentPreview name="questionnaire-controlled" previewClassName="min-h-[520px] p-4 sm:p-8" />

## Resume

Restore a saved active item and default answers, then reset changes back to that saved state.

<ComponentPreview name="questionnaire-resume" previewClassName="min-h-[520px] p-4 sm:p-8" />

## Conditional Items

Disable items that do not apply to the user's earlier answers.

<ComponentPreview name="questionnaire-conditional" previewClassName="min-h-[520px] p-4 sm:p-8" />

## Navigation State

Read item status (`questionnaire-status-change`) to opt into disabled navigation and custom action styling.

<ComponentPreview name="questionnaire-navigation-state" previewClassName="min-h-[480px] p-4 sm:p-8" />

## Custom Progress

Pass children to `questionnaire.Progress` to build a custom progress indicator.

<ComponentPreview name="questionnaire-progress" previewClassName="min-h-[520px] p-4 sm:p-8" />

## Animated Items

Animate the active item while keeping progress and navigation stationary.

<ComponentPreview name="questionnaire-animated" previewClassName="min-h-[520px] p-4 sm:p-8" />

## Card

Compose Questionnaire with Card slots while keeping the question title and description semantic.

<ComponentPreview name="questionnaire-card" previewClassName="min-h-[560px] p-4 sm:p-8" />

## Dialog

Compose Questionnaire inside a Dialog while keeping cancellation and dismissal host-owned.

<ComponentPreview name="questionnaire-dialog" previewClassName="min-h-[320px] p-4 sm:p-8" />

## Accessibility

`questionnaire.Item` renders a `fieldset`, and `questionnaire.Title` renders its
`legend`. Descriptions and active errors are associated with the current item,
and invalid items and answer controls expose `aria-invalid`.

Fixed choices preserve native radio and checkbox behavior. Progress is exposed
as a named progressbar, navigation uses real buttons, and inactive items and
actions are hidden and inert. Successful navigation focuses the newly active
item; failed validation focuses an available answer control.

Always give `questionnaire.Input` an accessible name with a visible label,
`aria-label`, or `aria-labelledby`. A placeholder is not a label.

| Key                           | Action                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| `ArrowUp` / `ArrowDown`       | Move between the answers of the active item.               |
| `ArrowLeft` / `ArrowRight`    | Go to the previous item, or the next one once answered.    |
| `Enter`                       | On a selected answer: confirm it and continue.             |
| `Meta+Enter` / `Control+Enter`| Confirm the active item from anywhere in the form.         |
| `A`–`Z` / `1`–`9`             | Select the answer with that shortcut (`Shortcuts`).        |

## API Reference

### Questionnaire

| Prop          | Type               | Default |
| ------------- | ------------------ | ------- |
| `Items`       | `[]ItemDefinition` | -       |
| `Item`        | `*string`          | -       |
| `DefaultItem` | `string`           | -       |
| `Shortcuts`   | `Shortcuts`        | -       |

`Items` is the ordered collection (`Name`, `Required`, `Disabled`, `Choices`
with `Value` and `Disabled`). The root dispatches `questionnaire-item-change`
(`detail.item`) when the active item changes.

### Item

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Name`     | `string` | -       |
| `Required` | `bool`   | `false` |
| `Multiple` | `bool`   | `false` |
| `Disabled` | `bool`   | `false` |
| `Invalid`  | `bool`   | `false` |

The item dispatches `questionnaire-status-change` (`detail.status`:
`unanswered`, `answered` or `skipped`).

### Title, Description

| Prop     | Type      | Default |
| -------- | --------- | ------- |
| `Render` | `*Render` | -       |

`Render` renders the part as another component's element (its `Tag`, `Class`
and `Attributes`), like a card or dialog title.

### Choice

| Prop             | Type     | Default |
| ---------------- | -------- | ------- |
| `Value`          | `string` | -       |
| `DefaultChecked` | `bool`   | `false` |
| `Disabled`       | `bool`   | `false` |

### Input

| Prop           | Type     | Default  |
| -------------- | -------- | -------- |
| `Type`         | `string` | `"text"` |
| `DefaultValue` | `string` | -        |
| `Disabled`     | `bool`   | `false`  |

### Previous, Skip, Next, Submit

| Prop       | Type             | Default                            |
| ---------- | ---------------- | ---------------------------------- |
| `Variant`  | `button.Variant` | `"outline"` / `"default"`          |
| `Size`     | `button.Size`    | `"default"`                        |
| `Disabled` | `bool`           | `false`                            |

`questionnaire.Actions` and `questionnaire.ChoiceDescription` are styled-only
layout helpers.
