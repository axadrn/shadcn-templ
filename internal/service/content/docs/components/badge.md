---
title: Badge
description: Displays a badge or a component that looks like a badge.
---

<ComponentPreview name="badge-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add badge
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="badge" title="components/badge/badge.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go
import "github.com/axadrn/shadcn-templ/v2/components/badge"
```

```templ
@badge.Badge(badge.Props{Variant: badge.VariantOutline}) {
	Badge
}
```

## Variants

Use the `Variant` prop to change the variant of the badge.

<ComponentPreview name="badge-variants" />

## With Icon

You can render an icon inside the badge. Use `data-icon="inline-start"` to render the icon on the left and `data-icon="inline-end"` to render the icon on the right.

<ComponentPreview name="badge-icon" />

## With Spinner

You can render a spinner inside the badge. Remember to add the `data-icon="inline-start"` or `data-icon="inline-end"` attribute to the spinner.

<ComponentPreview name="badge-spinner" />

## Link

Set the `Href` prop to render the badge as a link.

<ComponentPreview name="badge-link" />

## Custom Colors

You can customize the colors of a badge by adding custom classes such as `bg-green-50 dark:bg-green-800` to the `Badge` component.

<ComponentPreview name="badge-colors" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="badge-rtl" direction="rtl" />

## API Reference

### Badge

The `Badge` component displays a badge or a component that looks like a badge.

| Prop      | Type                                                                                                        | Default          |
| --------- | ----------------------------------------------------------------------------------------------------------- | ---------------- |
| `Variant` | `VariantDefault \| VariantSecondary \| VariantDestructive \| VariantOutline \| VariantGhost \| VariantLink` | `VariantDefault` |
| `Href`    | `string`                                                                                                    | -                |
| `Class`   | `string`                                                                                                    | -                |
