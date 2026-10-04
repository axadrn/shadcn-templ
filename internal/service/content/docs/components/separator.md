---
title: Separator
description: Visually or semantically separates content.
---

<ComponentPreview name="separator-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add separator
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="separator" title="components/separator/separator.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/separator"
```

```templ showLineNumbers
@separator.Separator()
```

## Vertical

Use `Orientation: separator.OrientationVertical` for a vertical separator.

<ComponentPreview name="separator-vertical" />

## Menu

Vertical separators between menu items with descriptions.

<ComponentPreview name="separator-menu" />

## List

Horizontal separators between list items.

<ComponentPreview name="separator-list" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="separator-rtl" direction="rtl" />

## API Reference

### Separator

The `Separator` component renders a semantic divider.

| Prop          | Type                                             | Default                 |
| ------------- | ------------------------------------------------ | ----------------------- |
| `Orientation` | `OrientationHorizontal \| OrientationVertical`   | `OrientationHorizontal` |
| `Class`       | `string`                                         | -                       |
