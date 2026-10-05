---
title: Aspect Ratio
description: Displays content within a desired ratio.
---

<ComponentPreview name="aspect-ratio-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add aspect-ratio
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="aspect-ratio" title="components/aspectratio/aspectratio.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/aspectratio"
```

```templ showLineNumbers
@aspectratio.AspectRatio(aspectratio.Props{Ratio: "16/9"}) {
	<img src="..." alt="Image" class="absolute inset-0 h-full w-full rounded-md object-cover"/>
}
```

## Square

A square aspect ratio component using the `Ratio: "1/1"` prop. This is useful for displaying images in a square format.

<ComponentPreview name="aspect-ratio-square" />

## Portrait

A portrait aspect ratio component using the `Ratio: "9/16"` prop. This is useful for displaying images in a portrait format.

<ComponentPreview name="aspect-ratio-portrait" previewClassName="h-96" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="aspect-ratio-rtl" direction="rtl" previewClassName="h-96" />

## API Reference

### AspectRatio

The `AspectRatio` component displays content within a desired ratio.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Ratio` | `string` | -       |
| `Class` | `string` | -       |
