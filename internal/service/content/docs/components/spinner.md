---
title: Spinner
description: An indicator that can be used to show a loading state.
---

<ComponentPreview name="spinner-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add spinner
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="spinner" title="components/spinner/spinner.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/spinner"
```

```templ showLineNumbers
@spinner.Spinner()
```

## Customization

You can replace the default spinner icon with any other icon by editing the `Spinner` component.

<ComponentPreview name="spinner-custom" />

```templ showLineNumbers title="components/spinner/spinner.templ"
templ Spinner(props ...Props) {
	{{ var p Props }}
	if len(props) > 0 {
		{{ p = props[0] }}
	}
	@icon.Loader(icon.Props{
		Class: utils.CN("size-4 animate-spin", p.Class),
		Attributes: templ.Attributes{
			"role":       "status",
			"aria-label": "Loading",
		},
	})
}
```

## Size

Use the `size-*` utility class to change the size of the spinner.

<ComponentPreview name="spinner-size" />

## Button

Add a spinner to a button to indicate a loading state. Place the `@spinner.Spinner()` before the label with `data-icon="inline-start"` for a start position, or after the label with `data-icon="inline-end"` for an end position.

<ComponentPreview name="spinner-button" />

## Badge

Add a spinner to a badge to indicate a loading state. Place the `@spinner.Spinner()` before the label with `data-icon="inline-start"` for a start position, or after the label with `data-icon="inline-end"` for an end position.

<ComponentPreview name="spinner-badge" />

## Input Group

<ComponentPreview name="spinner-input-group" />

## Empty

<ComponentPreview name="spinner-empty" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="spinner-rtl" direction="rtl" />

## API Reference

### Spinner

The `Spinner` component renders a spinning loader icon with `role="status"`.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
