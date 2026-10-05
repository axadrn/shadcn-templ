---
title: Button Group
description: A container that groups related buttons together with consistent styling.
---

<ComponentPreview name="button-group-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add button-group
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="button-group" title="components/buttongroup/buttongroup.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go
import "github.com/axadrn/shadcn-templ/v2/components/buttongroup"
```

```templ
@buttongroup.ButtonGroup() {
	@button.Button() {
		Button 1
	}
	@button.Button() {
		Button 2
	}
}
```

## Composition

Use the following composition to build a `ButtonGroup`:

```text
buttongroup.ButtonGroup
├── button.Button or input.Input
├── buttongroup.Separator
└── buttongroup.Text
```

## Accessibility

- The `ButtonGroup` component has the `role` attribute set to `group`.
- Use `Tab` to navigate between the buttons in the group.
- Use `aria-label` or `aria-labelledby` to label the button group.

```templ showLineNumbers
@buttongroup.ButtonGroup(buttongroup.Props{Attributes: templ.Attributes{"aria-label": "Button group"}}) {
	@button.Button() {
		Button 1
	}
	@button.Button() {
		Button 2
	}
}
```

## ButtonGroup vs ToggleGroup

- Use the `ButtonGroup` component when you want to group buttons that perform an action.
- Use the `ToggleGroup` component when you want to group buttons that toggle a state.

## Orientation

Set the `Orientation` prop to change the button group layout.

<ComponentPreview name="button-group-orientation" />

## Size

Control the size of buttons using the `Size` prop on individual buttons.

<ComponentPreview name="button-group-size" />

## Nested

Nest `ButtonGroup` components to create button groups with spacing.

<ComponentPreview name="button-group-nested" />

## Separator

The `buttongroup.Separator` component visually divides buttons within a group.

Buttons with variant `outline` do not need a separator since they have a border. For other variants, a separator is recommended to improve the visual hierarchy.

<ComponentPreview name="button-group-separator" />

## Split

Create a split button group by adding two buttons separated by a `buttongroup.Separator`.

<ComponentPreview name="button-group-split" />

## Input

Wrap an `Input` component with buttons.

<ComponentPreview name="button-group-input" />

## Input Group

Wrap an `InputGroup` component to create complex input layouts.

<ComponentPreview name="button-group-input-group" />

## Dropdown Menu

Create a split button group with a `DropdownMenu` component.

<ComponentPreview name="button-group-dropdown" />

## Select

Pair with a `Select` component.

<ComponentPreview name="button-group-select" />

## Popover

Use with a `Popover` component.

<ComponentPreview name="button-group-popover" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="button-group-rtl" direction="rtl" />

## API Reference

### ButtonGroup

The `ButtonGroup` component is a container that groups related buttons together with consistent styling.

| Prop          | Type                                              | Default                 |
| ------------- | ------------------------------------------------- | ----------------------- |
| `Orientation` | `OrientationHorizontal \| OrientationVertical` | `OrientationHorizontal` |
| `Class`       | `string`                                          | -                       |

```templ
@buttongroup.ButtonGroup() {
	@button.Button() {
		Button 1
	}
	@button.Button() {
		Button 2
	}
}
```

Nest multiple button groups to create complex layouts with spacing. See the [nested](#nested) example for more details.

```templ
@buttongroup.ButtonGroup() {
	@buttongroup.ButtonGroup()
	@buttongroup.ButtonGroup()
}
```

### Separator

The `buttongroup.Separator` component visually divides buttons within a group.

| Prop          | Type                                              | Default               |
| ------------- | ------------------------------------------------- | --------------------- |
| `Orientation` | `OrientationHorizontal \| OrientationVertical` | `OrientationVertical` |
| `Class`       | `string`                                          | -                     |

```templ
@buttongroup.ButtonGroup() {
	@button.Button() {
		Button 1
	}
	@buttongroup.Separator()
	@button.Button() {
		Button 2
	}
}
```

### Text

Use the `buttongroup.Text` component to display text within a button group.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@buttongroup.ButtonGroup() {
	@buttongroup.Text() {
		Text
	}
	@button.Button() {
		Button
	}
}
```

Render a `label.Label` inside it to label an adjacent input.

```templ showLineNumbers
@buttongroup.ButtonGroup() {
	@buttongroup.Text() {
		@label.Label(label.Props{For: "name"}) {
			Text
		}
	}
	@input.Input(input.Props{ID: "name", Placeholder: "Type something here..."})
}
```
