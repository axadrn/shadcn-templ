---
title: Empty
description: Use the Empty component to display a empty state.
---

<ComponentPreview name="empty-demo" previewClassName="h-96 p-0" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add empty
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="empty" title="components/empty/empty.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go
import "github.com/axadrn/shadcn-templ/v2/components/empty"
```

```templ
@empty.Empty() {
	@empty.Header() {
		@empty.Media(empty.MediaProps{Variant: empty.MediaVariantIcon}) {
			@icon.FolderOpen()
		}
		@empty.Title() {
			No data
		}
		@empty.Description() {
			No data found
		}
	}
	@empty.Content() {
		@button.Button() {
			Add data
		}
	}
}
```

## Composition

Use the following composition to build an `Empty` state:

```text
empty.Empty
├── empty.Header
│   ├── empty.Media
│   ├── empty.Title
│   └── empty.Description
└── empty.Content
```

## Outline

Use the `border` utility class to create an outline empty state.

<ComponentPreview name="empty-outline" previewClassName="h-96 p-6 md:p-10" />

## Background

Use the `bg-*` and `bg-gradient-*` utilities to add a background to the empty state.

<ComponentPreview name="empty-background" previewClassName="h-96 p-0" />

## Avatar

Use the `empty.Media` component to display an avatar in the empty state.

<ComponentPreview name="empty-avatar" previewClassName="h-96 p-0" />

## Avatar Group

Use the `empty.Media` component to display an avatar group in the empty state.

<ComponentPreview name="empty-avatar-group" previewClassName="h-96 p-0" />

## InputGroup

You can add an `inputgroup.InputGroup` component to the `empty.Content` component.

<ComponentPreview name="empty-input-group" previewClassName="h-96 p-0" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="empty-rtl" direction="rtl" />

## API Reference

### Empty

The main component of the empty state. Wraps the `empty.Header` and `empty.Content` components.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@empty.Empty() {
	@empty.Header()
	@empty.Content()
}
```

### EmptyHeader

The `empty.Header` component wraps the empty media, title, and description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@empty.Header() {
	@empty.Media()
	@empty.Title()
	@empty.Description()
}
```

### EmptyMedia

Use the `empty.Media` component to display the media of the empty state such as an icon or an image. You can also use it to display other components such as an avatar.

| Prop      | Type                                       | Default               |
| --------- | ------------------------------------------- | --------------------- |
| `Variant` | `MediaVariantDefault \| MediaVariantIcon` | `MediaVariantDefault` |
| `Class`   | `string`                                   | -                     |

```templ
@empty.Media(empty.MediaProps{Variant: empty.MediaVariantIcon}) {
	@icon.FolderCode()
}
```

```templ
@empty.Media() {
	@avatar.Avatar() {
		@avatar.Image(avatar.ImageProps{Src: "..."})
		@avatar.Fallback() {
			AA
		}
	}
}
```

### EmptyTitle

Use the `empty.Title` component to display the title of the empty state.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@empty.Title() {
	No data
}
```

### EmptyDescription

Use the `empty.Description` component to display the description of the empty state.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@empty.Description() {
	You do not have any notifications.
}
```

### EmptyContent

Use the `empty.Content` component to display the content of the empty state such as a button, input or a link.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@empty.Content() {
	@button.Button() {
		Add Project
	}
}
```
