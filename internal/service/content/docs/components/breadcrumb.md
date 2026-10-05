---
title: Breadcrumb
description: Displays the path to the current resource using a hierarchy of links.
---

<ComponentPreview name="breadcrumb-demo" previewClassName="p-2" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add breadcrumb
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="breadcrumb" title="components/breadcrumb/breadcrumb.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/breadcrumb"
```

```templ showLineNumbers
@breadcrumb.Breadcrumb() {
	@breadcrumb.List() {
		@breadcrumb.Item() {
			@breadcrumb.Link(breadcrumb.LinkProps{Href: "/"}) {
				Home
			}
		}
		@breadcrumb.Separator()
		@breadcrumb.Item() {
			@breadcrumb.Link(breadcrumb.LinkProps{Href: "/docs/components"}) {
				Components
			}
		}
		@breadcrumb.Separator()
		@breadcrumb.Item() {
			@breadcrumb.Page() {
				Breadcrumb
			}
		}
	}
}
```

## Composition

Use the following composition to build a `Breadcrumb`:

```text
breadcrumb.Breadcrumb
└── breadcrumb.List
    ├── breadcrumb.Item
    │   └── breadcrumb.Link
    ├── breadcrumb.Separator
    ├── breadcrumb.Item
    │   └── breadcrumb.Link
    ├── breadcrumb.Separator
    └── breadcrumb.Item
        └── breadcrumb.Page
```

## Basic

A basic breadcrumb with a home link and a components link.

<ComponentPreview name="breadcrumb-basic" />

## Custom separator

Pass custom children to `breadcrumb.Separator` to replace the default separator icon.

<ComponentPreview name="breadcrumb-separator" />

## Dropdown

You can compose `breadcrumb.Item` with a `dropdownmenu` to create a dropdown in the breadcrumb.

<ComponentPreview name="breadcrumb-dropdown" />

## Collapsed

We provide a `breadcrumb.Ellipsis` component to show a collapsed state when the breadcrumb is too long.

<ComponentPreview name="breadcrumb-ellipsis" previewClassName="p-2" />

## Link component

The `breadcrumb.Link` component renders a standard anchor. Set the `Href` prop to link a breadcrumb item.

<ComponentPreview name="breadcrumb-link" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="breadcrumb-rtl" direction="rtl" previewClassName="p-2" />

## API Reference

### Breadcrumb

The `Breadcrumb` component is the root navigation element that wraps all breadcrumb components.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### List

The `breadcrumb.List` component displays the ordered list of breadcrumb items.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Item

The `breadcrumb.Item` component wraps individual breadcrumb items.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Link

The `breadcrumb.Link` component displays a clickable link in the breadcrumb.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Href`  | `string` | -       |
| `Class` | `string` | -       |

### Page

The `breadcrumb.Page` component displays the current page in the breadcrumb (non-clickable).

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Separator

The `breadcrumb.Separator` component displays a separator between breadcrumb items. Pass custom children to override the default separator icon.

| Prop        | Type     | Default |
| ----------- | -------- | ------- |
| `Class`     | `string` | -       |

### Ellipsis

The `breadcrumb.Ellipsis` component displays an ellipsis indicator for collapsed breadcrumb items.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
