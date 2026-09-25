---
title: Tooltip
description: A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.
---

<ComponentPreview name="tooltip-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add tooltip
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="tooltip" title="components/tooltip/tooltip.templ" />

<ComponentSource name="tooltip" title="components/tooltip/tooltip.js" />

<ComponentSource name="tooltip" title="components/baseui/lifecycle.js" />

<ComponentSource name="tooltip" title="components/baseui/portal.js" />

<ComponentSource name="tooltip" title="components/baseui/use_dismiss.js" />

<ComponentSource name="tooltip" title="components/floatingui/floating_ui_core.js" />

<ComponentSource name="tooltip" title="components/floatingui/floating_ui_dom.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/tooltip"
```

```templ showLineNumbers
@tooltip.Tooltip() {
	<button { tooltip.Trigger(ctx)... }>Hover</button>
	@tooltip.Content() {
		<p>Add to library</p>
	}
}
```

## Composition

Use the following composition to build a `Tooltip`:

```text
tooltip.Tooltip
├── tooltip.Trigger
└── tooltip.Content
```

## Side

Use the `Side` prop to change the position of the tooltip.

<ComponentPreview name="tooltip-sides" />

## With Keyboard Shortcut

<ComponentPreview name="tooltip-keyboard" />

## Disabled Button

Show a tooltip on a disabled button by wrapping it with a span.

<ComponentPreview name="tooltip-disabled" />

## API Reference

### Tooltip

The `tooltip.Tooltip` component is the root, it generates the id that links trigger and content.

### TooltipTrigger

`tooltip.Trigger(ctx)` returns the attributes that turn any element into the tooltip trigger.

### TooltipContent

The `tooltip.Content` component is the popup.

| Prop         | Type                                             | Default   |
| ------------ | ------------------------------------------------ | --------- |
| `Side`       | `SideTop \| SideRight \| SideBottom \| SideLeft` | `SideTop` |
| `SideOffset` | `int`                                            | `4`       |
| `Class`      | `string`                                         | -         |
