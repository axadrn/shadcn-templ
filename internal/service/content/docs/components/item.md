---
title: Item
description: A versatile component that you can use to display any content.
---

<ComponentPreview name="item-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add item
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="item" title="components/item/item.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/item"
```

```templ showLineNumbers
@item.Item() {
	@item.Media(item.MediaProps{Variant: item.MediaVariantIcon}) {
		@icon.Star()
	}
	@item.Content() {
		@item.Title() {
			Title
		}
		@item.Description() {
			Description
		}
	}
	@item.Actions() {
		@button.Button() {
			Action
		}
	}
}
```

## Composition

Use the following composition to build an `Item`:

```text
item.Group
└── item.Item
    ├── item.Header
    ├── item.Media
    ├── item.Content
    │   ├── item.Title
    │   └── item.Description
    ├── item.Actions
    └── item.Footer
```

## Item vs Field

Use `Field` if you need to display a form input such as a checkbox, input, radio, or select.

If you only need to display content such as a title, description, and actions, use `Item`.

## Variant

Use the `Variant` prop to change the visual style of the item.

<ComponentPreview name="item-variant" previewClassName="h-96" />

## Size

Use the `Size` prop to change the size of the item. Available sizes are `default`, `sm`, and `xs`.

<ComponentPreview name="item-size" previewClassName="h-96" />

## Icon

Use `item.Media` with `Variant: item.MediaVariantIcon` to display an icon.

<ComponentPreview name="item-icon" />

## Avatar

You can use `item.Media` to display an avatar.

<ComponentPreview name="item-avatar" />

## Image

Use `item.Media` with `Variant: item.MediaVariantImage` to display an image.

<ComponentPreview name="item-image" />

## Group

Use `item.Group` to group related items together.

<ComponentPreview name="item-group" previewClassName="h-96" />

## Header

Use `item.Header` to add a header above the item content.

<ComponentPreview name="item-header" previewClassName="h-96" />

## Link

Set the `Href` prop to render the item as a link. The hover and focus states will be applied to the anchor element.

<ComponentPreview name="item-link" />

```templ showLineNumbers
@item.Item(item.Props{Href: "/dashboard"}) {
	@item.Media(item.MediaProps{Variant: item.MediaVariantIcon}) {
		@icon.House()
	}
	@item.Content() {
		@item.Title() {
			Dashboard
		}
		@item.Description() {
			Overview of your account and activity.
		}
	}
}
```

## Dropdown

<ComponentPreview name="item-dropdown" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="item-rtl" direction="rtl" />

## API Reference

### Item

The main component for displaying content with media, title, description, and actions. It renders as a link when `Href` is set.

| Prop      | Type                                               | Default          |
| --------- | -------------------------------------------------- | ---------------- |
| `Variant` | `VariantDefault \| VariantOutline \| VariantMuted` | `VariantDefault` |
| `Size`    | `SizeDefault \| SizeSm \| SizeXs`                  | `SizeDefault`    |
| `Href`    | `string`                                           | -                |
| `Class`   | `string`                                           | -                |

### ItemGroup

A container that groups related items together with consistent styling.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@item.Group() {
	@item.Item()
	@item.Item()
}
```

### ItemSeparator

A separator between items in a group.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@item.Group() {
	@item.Item()
	@item.Separator()
	@item.Item()
}
```

### ItemMedia

Use `item.Media` to display media content such as icons, images, or avatars.

| Prop      | Type                                                           | Default               |
| --------- | --------------------------------------------------------------- | --------------------- |
| `Variant` | `MediaVariantDefault \| MediaVariantIcon \| MediaVariantImage` | `MediaVariantDefault` |
| `Class`   | `string`                                                        | -                     |

```templ
@item.Media(item.MediaProps{Variant: item.MediaVariantIcon}) {
	@icon.ShieldAlert()
}
```

```templ
@item.Media(item.MediaProps{Variant: item.MediaVariantImage}) {
	<img src="..." alt="..."/>
}
```

### ItemContent

Wraps the title and description of the item.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@item.Content() {
	@item.Title() {
		Title
	}
	@item.Description() {
		Description
	}
}
```

### ItemTitle

Displays the title of the item.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@item.Title() {
	Item Title
}
```

### ItemDescription

Displays the description of the item.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@item.Description() {
	Item description
}
```

### ItemActions

Container for action buttons or other interactive elements.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@item.Actions() {
	@button.Button() {
		Action
	}
}
```

### ItemHeader

Displays a header above the item content.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@item.Item() {
	@item.Header() {
		Header
	}
	@item.Content() {
		// ...
	}
}
```

### ItemFooter

Displays a footer below the item content.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@item.Item() {
	@item.Content() {
		// ...
	}
	@item.Footer() {
		Footer
	}
}
```
