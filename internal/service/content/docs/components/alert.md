---
title: Alert
description: Displays a callout for user attention.
---

<ComponentPreview name="alert-demo" previewClassName="h-auto sm:h-72 p-6" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add alert
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="alert" title="components/alert/alert.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/alert"
```

```templ showLineNumbers
@alert.Alert() {
	@icon.Info()
	@alert.Title() {
		Heads up!
	}
	@alert.Description() {
		You can add components to your app using the cli.
	}
	@alert.Action() {
		@button.Button(button.Props{Variant: button.VariantOutline}) {
			Enable
		}
	}
}
```

## Composition

Use the following composition to build an `Alert`:

```text
alert.Alert
├── icon
├── alert.Title
├── alert.Description
└── alert.Action
```

## Basic

A basic alert with an icon, title and description.

<ComponentPreview name="alert-basic" previewClassName="h-auto sm:h-72 p-6" />

## Destructive

Use `Variant: alert.VariantDestructive` to create a destructive alert.

<ComponentPreview name="alert-destructive" previewClassName="h-auto sm:h-72 p-6" />

## Action

Use `alert.Action` to add a button or other action element to the alert.

<ComponentPreview name="alert-action" previewClassName="h-auto sm:h-72 p-6" />

## Custom Colors

You can customize the alert colors by adding custom classes such as `bg-amber-50 dark:bg-amber-950` to the `Alert` component.

<ComponentPreview name="alert-colors" previewClassName="h-auto sm:h-72 p-6" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="alert-rtl" direction="rtl" previewClassName="h-auto sm:h-72 p-6" />

## API Reference

### Alert

The `Alert` component displays a callout for user attention.

| Prop      | Type                                   | Default          |
| --------- | -------------------------------------- | ---------------- |
| `Variant` | `VariantDefault \| VariantDestructive` | `VariantDefault` |
| `Class`   | `string`                               | -                |

### Title

The `alert.Title` component displays the title of the alert.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Description

The `alert.Description` component displays the description or content of the alert.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Action

The `alert.Action` component displays an action element (like a button) positioned absolutely in the top-right corner of the alert.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
