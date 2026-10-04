---
title: Textarea
description: Displays a form textarea or a component that looks like a textarea.
---

<ComponentPreview name="textarea-demo" previewClassName="*:max-w-xs" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add textarea
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="textarea" title="components/textarea/textarea.templ" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/textarea"
```

```templ showLineNumbers
@textarea.Textarea()
```

## Field

Use `Field`, `FieldLabel`, and `FieldDescription` to create a textarea with a label and description.

<ComponentPreview name="textarea-field" previewClassName="*:max-w-xs" />

## Disabled

Use the `Disabled` prop to disable the textarea. To style the disabled state, set `Disabled` on the `field.Field` component.

<ComponentPreview name="textarea-disabled" previewClassName="*:max-w-xs" />

## Invalid

Use `aria-invalid` to mark the textarea as invalid. To style the invalid state, set `Invalid` on the `field.Field` component.

<ComponentPreview name="textarea-invalid" previewClassName="*:max-w-xs" />

## Button

Pair with `Button` to create a textarea with a submit button.

<ComponentPreview name="textarea-button" previewClassName="*:max-w-xs" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="textarea-rtl" direction="rtl" />

## API Reference

### Textarea

The `Textarea` component renders a native textarea element.

| Prop          | Type     | Default |
| ------------- | -------- | ------- |
| `Name`        | `string` | -       |
| `Value`       | `string` | -       |
| `Placeholder` | `string` | -       |
| `Rows`        | `int`    | -       |
| `Disabled`    | `bool`   | `false` |
| `ReadOnly`    | `bool`   | `false` |
| `Required`    | `bool`   | `false` |
| `Class`       | `string` | -       |
