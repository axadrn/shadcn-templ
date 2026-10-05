---
title: Toggle Group
description: A set of two-state buttons that can be toggled on or off.
---

<ComponentPreview name="toggle-group-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add toggle-group
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="toggle-group" title="components/togglegroup/togglegroup.templ" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/togglegroup"
```

```templ showLineNumbers
@togglegroup.ToggleGroup(togglegroup.Props{}) {
	@togglegroup.Item(togglegroup.ItemProps{Value: "a"}) {
		A
	}
	@togglegroup.Item(togglegroup.ItemProps{Value: "b"}) {
		B
	}
	@togglegroup.Item(togglegroup.ItemProps{Value: "c"}) {
		C
	}
}
```

## Composition

Use the following composition to build a `ToggleGroup`:

```text
togglegroup.ToggleGroup
├── togglegroup.Item
└── togglegroup.Item
```

## Outline

Use `Variant: togglegroup.VariantOutline` for an outline style.

<ComponentPreview name="toggle-group-outline" />

## Size

Use the `Size` prop to change the size of the toggle group.

<ComponentPreview name="toggle-group-sizes" />

## Spacing

Use `Spacing` to add spacing between toggle group items.

<ComponentPreview name="toggle-group-spacing" />

## Vertical

Use `Orientation: togglegroup.OrientationVertical` for vertical toggle groups.

<ComponentPreview name="toggle-group-vertical" />

## Disabled

<ComponentPreview name="toggle-group-disabled" />

## Custom

A custom toggle group example.

<ComponentPreview name="toggle-group-font-weight-selector" previewClassName="*:data-[slot=field]:max-w-xs" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="toggle-group-rtl" direction="rtl" />

## API Reference

### ToggleGroup

The `togglegroup.ToggleGroup` component wraps its items into a single or multiple selection group.

| Prop          | Type                                          | Default      |
| ------------- | --------------------------------------------- | ------------ |
| `ToggleMultiple` | `bool` | `false` |
| `Variant`     | `VariantDefault \| VariantOutline`            | `default`    |
| `Size`        | `SizeDefault \| SizeSm \| SizeLg`             | `default`    |
| `Spacing`     | `*int`                                        | `0`          |
| `Orientation` | `OrientationHorizontal \| OrientationVertical` | `horizontal` |
| `Disabled`    | `bool`                                        | `false`      |
| `Class`       | `string`                                      | -            |
