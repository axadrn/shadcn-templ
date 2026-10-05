---
title: Slider
description: An input where the user selects a value from within a given range.
---

<ComponentPreview name="slider-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add slider
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="slider" title="components/slider/slider.templ" />

<ComponentSource name="slider" title="components/slider/slider.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/slider"
```

```templ showLineNumbers
@slider.Slider(slider.Props{Value: []float64{33}, Max: 100, Step: 1})
```

## Range

Use an array with two values for a range slider.

<ComponentPreview name="slider-range" />

## Multiple Thumbs

Use an array with multiple values for multiple thumbs.

<ComponentPreview name="slider-multiple" />

## Vertical

Use `Orientation: slider.OrientationVertical` for a vertical slider.

<ComponentPreview name="slider-vertical" />

## Controlled

<ComponentPreview name="slider-controlled" />

## Disabled

Use the `Disabled` prop to disable the slider.

<ComponentPreview name="slider-disabled" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="slider-rtl" direction="rtl" />

## API Reference

### Slider

The `Slider` component renders one draggable thumb per value on a shared track.

| Prop          | Type                                             | Default                 |
| ------------- | ------------------------------------------------ | ----------------------- |
| `Value`      | `[]float64`                                      | `[Min, Max]`            |
| `Min`         | `float64`                                        | `0`                     |
| `Max`         | `float64`                                        | `100`                   |
| `Step`        | `float64`                                        | `1`                     |
| `Orientation` | `OrientationHorizontal \| OrientationVertical`   | `OrientationHorizontal` |
| `Name`        | `string`                                         | -                       |
| `Disabled`    | `bool`                                           | `false`                 |
| `Class`       | `string`                                         | -                       |
