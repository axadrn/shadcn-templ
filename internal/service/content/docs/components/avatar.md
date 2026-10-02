---
title: Avatar
description: An image element with a fallback for representing the user.
---

<ComponentPreview name="avatar-demo" previewClassName="h-72" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add avatar
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="avatar" title="components/avatar/avatar.templ" />

<ComponentSource name="avatar" title="components/avatar/avatar.js" />

<ComponentSource name="avatar" title="components/baseui/lifecycle.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/avatar"
```

```templ showLineNumbers
@avatar.Avatar() {
	@avatar.Image(avatar.ImageProps{Src: "https://github.com/axadrn.png"})
	@avatar.Fallback() {
		AA
	}
}
```

## Composition

Use the following composition to build an `Avatar`:

```text
avatar.Avatar
├── avatar.Image
├── avatar.Fallback
└── avatar.Badge
```

Use the following composition to build an `avatar.Group`:

```text
avatar.Group
├── avatar.Avatar
│   ├── avatar.Image
│   ├── avatar.Fallback
│   └── avatar.Badge
├── avatar.Avatar
│   ├── avatar.Image
│   ├── avatar.Fallback
│   └── avatar.Badge
└── avatar.GroupCount
```

## Basic

A basic avatar component with an image and a fallback.

<ComponentPreview name="avatar-basic" />

## Badge

Use the `avatar.Badge` component to add a badge to the avatar. The badge is positioned at the bottom right of the avatar.

<ComponentPreview name="avatar-badge" />

Use the `Class` prop to add custom styles to the badge such as custom colors, sizes, etc.

```templ showLineNumbers
@avatar.Avatar() {
	@avatar.Image(avatar.ImageProps{Src: "https://github.com/axadrn.png", Alt: "@axadrn"})
	@avatar.Fallback() {
		AA
	}
	@avatar.Badge(avatar.BadgeProps{Class: "bg-green-600 dark:bg-green-800"})
}
```

## Badge with Icon

You can also use an icon inside `avatar.Badge`.

<ComponentPreview name="avatar-badge-icon" />

## Avatar Group

Use the `avatar.Group` component to add a group of avatars.

<ComponentPreview name="avatar-group" />

## Avatar Group Count

Use `avatar.GroupCount` to add a count to the group.

<ComponentPreview name="avatar-group-count" />

## Avatar Group with Icon

You can also use an icon inside `avatar.GroupCount`.

<ComponentPreview name="avatar-group-count-icon" />

## Sizes

Use the `Size` prop to change the size of the avatar.

<ComponentPreview name="avatar-size" />

## Dropdown

You can use the `Avatar` component as a trigger for a dropdown menu.

<ComponentPreview name="avatar-dropdown" />

## API Reference

### Avatar

The `Avatar` component is the root component that wraps the avatar image and fallback.

| Prop    | Type                              | Default       |
| ------- | --------------------------------- | ------------- |
| `Size`  | `SizeDefault \| SizeSm \| SizeLg` | `SizeDefault` |
| `Class` | `string`                          | -             |

### Image

The `avatar.Image` component displays the avatar image.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Src`   | `string` | -       |
| `Alt`   | `string` | -       |
| `Class` | `string` | -       |

### Fallback

The `avatar.Fallback` component displays a fallback when the image fails to load.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Badge

The `avatar.Badge` component displays a badge indicator on the avatar, typically positioned at the bottom right.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Group

The `avatar.Group` component displays a group of avatars with overlapping styling.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### GroupCount

The `avatar.GroupCount` component displays a count indicator in an avatar group, typically showing the number of additional avatars.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
