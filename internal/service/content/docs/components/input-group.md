---
title: Input Group
description: Display additional information or actions to an input or textarea.
---

<ComponentPreview name="input-group-demo" previewClassName="h-[26rem]" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add input-group
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="input-group" title="components/inputgroup/inputgroup.templ" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/inputgroup"
```

```templ showLineNumbers
@inputgroup.InputGroup() {
	@inputgroup.Input(inputgroup.InputProps{Placeholder: "Search..."})
	@inputgroup.Addon() {
		@icon.Search()
	}
}
```

## Composition

Use the following composition to build an `InputGroup`:

```text
inputgroup.InputGroup
├── inputgroup.Input or inputgroup.Textarea
├── inputgroup.Addon
├── inputgroup.Button
└── inputgroup.Text
```

## Align

Use the `Align` prop on `inputgroup.Addon` to position the addon relative to the input.

<Callout>
For proper focus management, `inputgroup.Addon` should always be placed after `inputgroup.Input` or `inputgroup.Textarea` in the DOM. Use the `Align` prop to visually position the addon.
</Callout>

### inline-start

Use `Align: inputgroup.AlignInlineStart` to position the addon at the start of the input. This is the default.

<ComponentPreview name="input-group-inline-start" previewClassName="h-48" />

### inline-end

Use `Align: inputgroup.AlignInlineEnd` to position the addon at the end of the input.

<ComponentPreview name="input-group-inline-end" previewClassName="h-48" />

### block-start

Use `Align: inputgroup.AlignBlockStart` to position the addon above the input.

<ComponentPreview name="input-group-block-start" previewClassName="h-96" />

### block-end

Use `Align: inputgroup.AlignBlockEnd` to position the addon below the input.

<ComponentPreview name="input-group-block-end" previewClassName="h-[26rem]" />

## Icon

<ComponentPreview name="input-group-icon" previewClassName="h-80" />

## Text

<ComponentPreview name="input-group-text" previewClassName="h-80" />

## Button

<ComponentPreview name="input-group-button" previewClassName="h-72" />

## Kbd

<ComponentPreview name="input-group-kbd" previewClassName="h-40" />

## Dropdown

<ComponentPreview name="input-group-dropdown" previewClassName="h-56" />

## Spinner

<ComponentPreview name="input-group-spinner" previewClassName="h-80" />

## Textarea

<ComponentPreview name="input-group-textarea" previewClassName="h-96" />

## Custom Input

Add the `data-slot="input-group-control"` attribute to your custom input for automatic focus state handling.

Here's an example of a custom resizable textarea.

<ComponentPreview name="input-group-custom" previewClassName="h-56" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="input-group-rtl" direction="rtl" previewClassName="h-[30rem]" />

## API Reference

### InputGroup

The main component that wraps inputs and addons.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@inputgroup.InputGroup() {
	@inputgroup.Input()
	@inputgroup.Addon()
}
```

### InputGroupAddon

Displays icons, text, buttons, or other content alongside inputs.

<Callout>
For proper focus navigation, the `inputgroup.Addon` component should be placed after the input. Set the `Align` prop to position the addon.
</Callout>

| Prop    | Type                                                                      | Default            |
| ------- | ------------------------------------------------------------------------- | ------------------ |
| `Align` | `AlignInlineStart \| AlignInlineEnd \| AlignBlockStart \| AlignBlockEnd` | `AlignInlineStart` |
| `Class` | `string`                                                                  | -                  |

```templ
@inputgroup.Addon(inputgroup.AddonProps{Align: inputgroup.AlignInlineEnd}) {
	@icon.Search()
}
```

**For `inputgroup.Input`, use the `inline-start` or `inline-end` alignment. For `inputgroup.Textarea`, use the `block-start` or `block-end` alignment.**

The `inputgroup.Addon` component can have multiple `inputgroup.Button` components and icons.

```templ
@inputgroup.Addon() {
	@inputgroup.Button() {
		Button
	}
	@inputgroup.Button() {
		Button
	}
}
```

### InputGroupButton

Displays buttons within input groups.

| Prop       | Type                                                                    | Default        |
| ---------- | ------------------------------------------------------------------------ | -------------- |
| `Size`     | `ButtonSizeXs \| ButtonSizeSm \| ButtonSizeIconXs \| ButtonSizeIconSm` | `ButtonSizeXs` |
| `Variant`  | `button.Variant`                                                        | `VariantGhost` |
| `Type`     | `button.Type`                                                           | `TypeButton`   |
| `Disabled` | `bool`                                                                  | `false`        |
| `Class`    | `string`                                                                | -              |

```templ
@inputgroup.Button() {
	Button
}
@inputgroup.Button(inputgroup.ButtonProps{Size: inputgroup.ButtonSizeIconXs, Attributes: templ.Attributes{"aria-label": "Copy"}}) {
	@icon.Copy()
}
```

### InputGroupInput

Replacement for `input.Input` when building input groups. This component has the input group styles pre-applied and uses the unified `data-slot="input-group-control"` for focus state handling.

| Prop          | Type     | Default |
| ------------- | -------- | ------- |
| `Placeholder` | `string` | -       |
| `Value`       | `string` | -       |
| `Class`       | `string` | -       |

```templ
@inputgroup.InputGroup() {
	@inputgroup.Input(inputgroup.InputProps{Placeholder: "Enter text..."})
	@inputgroup.Addon() {
		@icon.Search()
	}
}
```

### InputGroupTextarea

Replacement for `textarea.Textarea` when building input groups. This component has the textarea group styles pre-applied and uses the unified `data-slot="input-group-control"` for focus state handling.

| Prop          | Type     | Default |
| ------------- | -------- | ------- |
| `Placeholder` | `string` | -       |
| `Class`       | `string` | -       |

```templ
@inputgroup.InputGroup() {
	@inputgroup.Textarea(inputgroup.TextareaProps{Placeholder: "Enter message..."})
	@inputgroup.Addon(inputgroup.AddonProps{Align: inputgroup.AlignBlockEnd}) {
		@inputgroup.Button() {
			Send
		}
	}
}
```

### InputGroupText

The `inputgroup.Text` component displays muted text inside the group.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
