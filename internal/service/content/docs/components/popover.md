---
title: Popover
description: Displays rich content in a portal, triggered by a button.
---

<ComponentPreview name="popover-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add popover
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="popover" title="components/popover/popover.templ" />

<ComponentSource name="popover" title="components/popover/popover.js" />

<ComponentSource name="popover" title="components/baseui/lifecycle.js" />

<ComponentSource name="popover" title="components/floatingui/floating_ui_core.js" />

<ComponentSource name="popover" title="components/floatingui/floating_ui_dom.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/popover"
```

```templ showLineNumbers
@popover.Popover() {
	@button.Button(button.Props{
		Variant:    button.VariantOutline,
		Attributes: popover.Trigger(ctx),
	}) {
		Open Popover
	}
	@popover.Content() {
		@popover.Header() {
			@popover.Title() {
				Title
			}
			@popover.Description() {
				Description text here.
			}
		}
	}
}
```

## Composition

Use the following composition to build a `Popover`:

```text
popover.Popover
├── popover.Trigger
└── popover.Content
```

## Basic

A simple popover with a header, title, and description.

<ComponentPreview name="popover-basic" />

## Align

Use the `Align` prop on `popover.Content` to control the horizontal alignment.

<ComponentPreview name="popover-alignments" />

## With Form

A popover with form fields inside.

<ComponentPreview name="popover-form" />

## API Reference

### Popover

The `popover.Root` component renders no element, it carries the id that links trigger and content.

| Prop | Type     | Default |
| ---- | -------- | ------- |
| `ID` | `string` | -       |

### PopoverTrigger

`popover.Trigger(ctx)` returns the attributes that turn any element into the popover trigger, `popover.TriggerFor(id)` targets a popover outside the current root.

### PopoverContent

The `popover.Content` component is the floating panel.

| Prop          | Type                                             | Default       |
| ------------- | ------------------------------------------------ | ------------- |
| `Side`        | `SideTop \| SideRight \| SideBottom \| SideLeft` | `SideBottom`  |
| `Align`       | `AlignStart \| AlignCenter \| AlignEnd`          | `AlignCenter` |
| `SideOffset`  | `int`                                            | `4`           |
| `AlignOffset` | `int`                                            | `0`           |
| `Class`       | `string`                                         | -             |

### PopoverHeader

The `popover.Header` component wraps the title and description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### PopoverTitle

The `popover.Title` component renders the accessible popover title.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### PopoverDescription

The `popover.Description` component renders the accessible popover description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
