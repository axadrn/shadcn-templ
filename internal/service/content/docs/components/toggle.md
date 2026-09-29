---
title: Toggle
description: A two-state button that can be either on or off.
---

<ComponentPreview name="toggle-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add toggle
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="toggle" title="components/toggle/toggle.templ" />

<ComponentSource name="toggle" title="components/toggle/toggle.js" />

<ComponentSource name="toggle" title="components/baseui/lifecycle.js" />

<ComponentSource name="toggle" title="components/baseui/tabbable.js" />

<ComponentSource name="toggle" title="components/baseui/composite.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/toggle"
```

```templ showLineNumbers
@toggle.Toggle() {
	Toggle
}
```

## Outline

Use `Variant: toggle.VariantOutline` for an outline style.

<ComponentPreview name="toggle-outline" />

## With Text

<ComponentPreview name="toggle-text" />

## Size

Use the `Size` prop to change the size of the toggle.

<ComponentPreview name="toggle-sizes" />

## Disabled

<ComponentPreview name="toggle-disabled" />

## API Reference

### Toggle

The `Toggle` component renders a pressable two-state button.

| Prop       | Type                                    | Default   |
| ---------- | --------------------------------------- | --------- |
| `Pressed`  | `bool`                                  | `false`   |
| `Value`    | `string`                                | -         |
| `Variant`  | `VariantDefault \| VariantOutline`      | `default` |
| `Size`     | `SizeDefault \| SizeSm \| SizeLg`       | `default` |
| `Disabled` | `bool`                                  | `false`   |
| `Class`    | `string`                                | -         |
