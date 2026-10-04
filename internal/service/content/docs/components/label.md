---
title: Label
description: Renders an accessible label associated with controls.
---

<ComponentPreview name="label-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add label
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="label" title="components/label/label.templ" />

<ComponentSource name="label" title="components/label/label.js" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/label"
```

```templ showLineNumbers
@label.Label(label.Props{For: "email"}) {
	Your email address
}
```

## Label in Field

For form fields, use the [Field](/docs/components/field) component which includes built-in `field.Label`, `field.Description`, and `field.Error` components.

```templ showLineNumbers
@field.Field() {
	@field.Label(field.LabelProps{For: "email"}) {
		Your email address
	}
	@input.Input(input.Props{ID: "email"})
}
```

<ComponentPreview name="field-demo" previewClassName="h-[44rem]" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="label-rtl" direction="rtl" />

## API Reference

### Label

The `Label` component renders a native label associated with a control.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `For`   | `string` | -       |
| `Class` | `string` | -       |
