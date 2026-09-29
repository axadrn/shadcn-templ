---
title: Combobox
description: Autocomplete input with a list of suggestions.
---

<ComponentPreview name="combobox-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add combobox
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="combobox" title="components/combobox/combobox.templ" />

<ComponentSource name="combobox" title="components/combobox/combobox.js" />

<ComponentSource name="combobox" title="components/baseui/lifecycle.js" />

<ComponentSource name="combobox" title="components/baseui/portal.js" />

<ComponentSource name="combobox" title="components/baseui/use_dismiss.js" />

<ComponentSource name="combobox" title="components/baseui/use_transition_status.js" />

<ComponentSource name="combobox" title="components/baseui/use_anchor_positioning.js" />

<ComponentSource name="combobox" title="components/baseui/tabbable.js" />

<ComponentSource name="combobox" title="components/baseui/mark_others.js" />

<ComponentSource name="combobox" title="components/baseui/floating_focus_manager.js" />

<ComponentSource name="combobox" title="components/baseui/composite.js" />

<ComponentSource name="combobox" title="components/baseui/use_list_navigation.js" />

<ComponentSource name="combobox" title="components/floatingui/floating_ui_core.js" />

<ComponentSource name="combobox" title="components/floatingui/floating_ui_dom.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/combobox"
```

```templ showLineNumbers
@combobox.Combobox() {
	@combobox.Input(combobox.InputProps{Placeholder: "Select a framework"})
	@combobox.Content() {
		@combobox.Empty() {
			No items found.
		}
		@combobox.List() {
			@combobox.Item(combobox.ItemProps{Value: "templ"}) {
				templ
			}
			@combobox.Item(combobox.ItemProps{Value: "htmx"}) {
				htmx
			}
		}
	}
}
```

## Composition

### Simple

A single-line input and a flat list (see [Basic](#basic)).

```text
combobox.Combobox
├── combobox.Input
└── combobox.Content
    ├── combobox.Empty
    └── combobox.List
        ├── combobox.Item
        └── combobox.Item
```

### With chips

Multi-select with `Multiple`, chips, and a chips input (see [Multiple](#multiple)).

```text
combobox.Combobox
├── combobox.Chips
│   ├── combobox.Value
│   │   └── combobox.Chip
│   └── combobox.ChipsInput
└── combobox.Content
    ├── combobox.Empty
    └── combobox.List
        ├── combobox.Item
        └── combobox.Item
```

### With groups

Nested items per group, with a separator between groups (see [Groups](#groups)).

```text
combobox.Combobox
├── combobox.Input
└── combobox.Content
    ├── combobox.Empty
    └── combobox.List
        ├── combobox.Group
        │   ├── combobox.Label
        │   ├── combobox.Item
        │   └── combobox.Item
        ├── combobox.Separator
        └── combobox.Group
            ├── combobox.Label
            ├── combobox.Item
            └── combobox.Item
```

## Custom Items

Use the `Label` prop when the text shown in the input differs from the item's value.

```templ showLineNumbers
@combobox.Combobox() {
	@combobox.Input(combobox.InputProps{Placeholder: "Select a framework"})
	@combobox.Content() {
		@combobox.Empty() {
			No items found.
		}
		@combobox.List() {
			@combobox.Item(combobox.ItemProps{Value: "next", Label: "Next.js"}) {
				Next.js
			}
			@combobox.Item(combobox.ItemProps{Value: "sveltekit", Label: "SvelteKit"}) {
				SvelteKit
			}
		}
	}
}
```

## Multiple Selection

Use `Multiple` with chips for multi-select behavior.

```templ showLineNumbers
@combobox.Combobox(combobox.Props{Multiple: true}) {
	@combobox.Chips() {
		@combobox.Value()
		@combobox.ChipsInput(combobox.ChipsInputProps{Placeholder: "Add framework"})
	}
	@combobox.Content() {
		@combobox.Empty() {
			No items found.
		}
		@combobox.List() {
			@combobox.Item(combobox.ItemProps{Value: "templ"}) {
				templ
			}
			@combobox.Item(combobox.ItemProps{Value: "htmx"}) {
				htmx
			}
		}
	}
}
```

## Basic

A simple combobox with a list of frameworks.

<ComponentPreview name="combobox-basic" />

## Multiple

A combobox with multiple selection using `Multiple` and `combobox.Chips`.

<ComponentPreview name="combobox-multiple" />

## Clear Button

Use the `ShowClear` prop to show a clear button.

<ComponentPreview name="combobox-clear" />

## Groups

Use `combobox.Group` and `combobox.Separator` to group items.

<ComponentPreview name="combobox-groups" />

## Custom Items

You can render a custom component inside `combobox.Item`.

<ComponentPreview name="combobox-custom" />

## Invalid

Use `aria-invalid` on `combobox.Input` to make the combobox invalid.

<ComponentPreview name="combobox-invalid" />

## Disabled

Use the `Disabled` prop to disable the combobox.

<ComponentPreview name="combobox-disabled" />

## Auto Highlight

Use the `AutoHighlight` prop to automatically highlight the first item on filter.

<ComponentPreview name="combobox-auto-highlight" />

## Popup

You can trigger the combobox from a button or any other component by using the `combobox.Trigger` attributes. Move the `combobox.Input` inside the `combobox.Content`.

<ComponentPreview name="combobox-popup" />

## Input Group

You can add an addon to the combobox by using the `inputgroup.Addon` component inside the `combobox.Input`.

<ComponentPreview name="combobox-input-group" />

## API Reference

### Combobox

The `Combobox` component is the root that manages filtering, selection and the form value.

| Prop            | Type       | Default |
| --------------- | ---------- | ------- |
| `Name`          | `string`   | -       |
| `Value`         | `string`   | -       |
| `Values`        | `[]string` | -       |
| `Multiple`      | `bool`     | `false` |
| `AutoHighlight` | `bool`     | `false` |
| `Disabled`      | `bool`     | `false` |

### Input

The `combobox.Input` component is the text input that filters the list.

| Prop          | Type     | Default |
| ------------- | -------- | ------- |
| `Placeholder` | `string` | -       |
| `HideTrigger` | `bool`   | `false` |
| `ShowClear`   | `bool`   | `false` |
| `Class`       | `string` | -       |

### Content

The `combobox.Content` component is the popup that holds the list.

| Prop          | Type                                             | Default      |
| ------------- | ------------------------------------------------ | ------------ |
| `Side`        | `SideTop \| SideRight \| SideBottom \| SideLeft` | `SideBottom` |
| `Align`       | `AlignStart \| AlignCenter \| AlignEnd`          | `AlignStart` |
| `SideOffset`  | `int`                                            | `6`          |
| `AlignOffset` | `int`                                            | `0`          |
| `Class`       | `string`                                         | -            |

### List

The `combobox.List` component holds the filterable items.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Empty

The `combobox.Empty` component shows while no item matches the filter.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Group

The `combobox.Group` component wraps related items.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Label

The `combobox.Label` component titles a group.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Item

The `combobox.Item` component is a selectable option.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Value`    | `string` | -       |
| `Label`    | `string` | -       |
| `Disabled` | `bool`   | `false` |
| `Class`    | `string` | -       |

### Separator

The `combobox.Separator` component divides groups.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Chips

The `combobox.Chips` component is the chip container and popup anchor in multiple mode, composed with `Value` and `ChipsInput`.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Chip

The `combobox.Chip` component renders one selected value as a removable chip, rendered by `Value` in multiple mode.

| Prop         | Type     | Default |
| ------------ | -------- | ------- |
| `Value`      | `string` | -       |
| `HideRemove` | `bool`   | `false` |
| `Class`      | `string` | -       |

### ChipsInput

The `combobox.ChipsInput` component is the inline filter input rendered after the chips.

| Prop          | Type     | Default |
| ------------- | -------- | ------- |
| `Placeholder` | `string` | -       |
| `Class`       | `string` | -       |

### Value

The `combobox.Value` component renders the current selection: the selected chips in multiple mode, or the selected item's label inside a button trigger (see [Popup](#popup)).

| Prop          | Type     | Default |
| ------------- | -------- | ------- |
| `Placeholder` | `string` | -       |
| `Class`       | `string` | -       |
