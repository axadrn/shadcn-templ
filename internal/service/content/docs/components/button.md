---
title: Button
description: Displays a button or a component that looks like a button.
---

<ComponentPreview name="button-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add button
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="button" title="components/button/button.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go
import "github.com/axadrn/shadcn-templ/v2/components/button"
```

```templ
@button.Button(button.Props{Variant: button.VariantOutline}) {
	Button
}
```

## Cursor

Tailwind v4 [switched](https://tailwindcss.com/docs/upgrade-guide#buttons-use-the-default-cursor) from `cursor: pointer` to `cursor: default` for the button component.

If you want to keep the `cursor: pointer` behavior, add the following code to your CSS file:

```css showLineNumbers title="globals.css"
@layer base {
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
}
```

## Size

Use the `Size` prop to change the size of the button.

<ComponentPreview name="button-size" />

## Default

<ComponentPreview name="button-default" />

## Outline

<ComponentPreview name="button-outline" />

## Secondary

<ComponentPreview name="button-secondary" />

## Ghost

<ComponentPreview name="button-ghost" />

## Destructive

<ComponentPreview name="button-destructive" />

## Link

<ComponentPreview name="button-link" />

## Icon

<ComponentPreview name="button-icon" />

## With Icon

Remember to add the `data-icon="inline-start"` or `data-icon="inline-end"` attribute to the icon for the correct spacing.

<ComponentPreview name="button-with-icon" />

## Rounded

Use the `rounded-full` class to make the button rounded.

<ComponentPreview name="button-rounded" />

## Spinner

Render a spinner component inside the button to show a loading state. Remember to add the `data-icon="inline-start"` or `data-icon="inline-end"` attribute to the spinner for the correct spacing.

<ComponentPreview name="button-spinner" />

## Button Group

To create a button group, use the `buttongroup` component. See the [Button Group](/docs/components/button-group) documentation for more details.

<ComponentPreview name="button-group-demo" />

## As Link

Set the `Href` prop to render the button as a semantic link that looks like a button.

<ComponentPreview name="button-render" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="button-rtl" direction="rtl" />

## API Reference

### Button

The `Button` component is a wrapper around the `button` element that adds a variety of styles and functionality.

| Prop       | Type                                                                                                        | Default          |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ---------------- |
| `Variant`  | `VariantDefault \| VariantSecondary \| VariantOutline \| VariantGhost \| VariantDestructive \| VariantLink` | `VariantDefault` |
| `Size`     | `SizeDefault \| SizeXs \| SizeSm \| SizeLg \| SizeIcon \| SizeIconXs \| SizeIconSm \| SizeIconLg`           | `SizeDefault`    |
| `Type`     | `TypeButton \| TypeSubmit \| TypeReset`                                                                     | `TypeButton`     |
| `Href`     | `string`                                                                                                    | -                |
| `Target`   | `string`                                                                                                    | -                |
| `Disabled` | `bool`                                                                                                      | `false`          |
| `Form`     | `string`                                                                                                    | -                |
| `Class`    | `string`                                                                                                    | -                |
