---
title: Switch
description: A control that allows the user to toggle between checked and not checked.
---

<ComponentPreview name="switch-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add switch
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="switch" title="components/switch/switch.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import switchcomp "github.com/axadrn/shadcn-templ/v2/components/switch"
```

```templ showLineNumbers
@switchcomp.Switch()
```

## Description

<ComponentPreview name="switch-description" />

## Choice Card

Card-style selection where `field.Label` wraps the entire `field.Field` for a clickable card pattern.

<ComponentPreview name="switch-choice-card" />

## Disabled

Add the `Disabled` prop to the `Switch` component to disable the switch. Add the `Disabled` prop to the `field.Field` component for styling.

<ComponentPreview name="switch-disabled" />

## Invalid

Add the `aria-invalid` attribute to the `Switch` component to indicate an invalid state. Add the `Invalid` prop to the `field.Field` component for styling.

<ComponentPreview name="switch-invalid" />

## Size

Use the `Size` prop to change the size of the switch.

<ComponentPreview name="switch-sizes" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="switch-rtl" direction="rtl" />

## API Reference

### Switch

The `Switch` component renders the toggle as a `role="switch"` root with a hidden native checkbox beside it that carries form participation and label association.

| Prop       | Type                    | Default       |
| ---------- | ----------------------- | ------------- |
| `Name`     | `string`                | -             |
| `Value`    | `string`                | `on`          |
| `Checked`  | `bool`                  | `false`       |
| `Disabled` | `bool`                  | `false`       |
| `Form`     | `string`                | -             |
| `Size`     | `SizeDefault \| SizeSm` | `SizeDefault` |
| `Class`    | `string`                | -             |
