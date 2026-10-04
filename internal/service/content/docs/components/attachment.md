---
title: Attachment
description: Displays a file or image attachment with media, metadata, upload state, and actions.
---

<ComponentPreview styleName="base-rhea" name="attachment-demo" previewClassName="h-auto theme-blue bg-surface dark:bg-background" />

The `Attachment` component displays a file or image attachment, its media, name, and metadata, with optional actions and upload state. Use it for files and images in chat composers, message threads, and upload lists.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add attachment
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Install the required shadcn-templ dependencies:</Step>

```bash
shadcn-templ add button
```

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="attachment" title="components/attachment/attachment.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/attachment"
```

```templ showLineNumbers
@attachment.Attachment() {
	@attachment.Media() {
		@icon.FileText()
	}
	@attachment.Content() {
		@attachment.Title() {
			sales-dashboard.pdf
		}
		@attachment.Description() {
			PDF · 2.4 MB
		}
	}
	@attachment.Actions() {
		@attachment.Action(attachment.ActionProps{Attributes: templ.Attributes{"aria-label": "Remove sales-dashboard.pdf"}}) {
			@icon.X()
		}
	}
}
```

## Composition

Use the following composition to build an attachment:

```text
attachment.Attachment
├── attachment.Media
├── attachment.Content
│   ├── attachment.Title
│   └── attachment.Description
├── attachment.Actions
│   └── attachment.Action
└── attachment.Trigger
```

Use `attachment.Group` to lay out multiple attachments in a scrollable row:

```text
attachment.Group
├── attachment.Attachment
└── attachment.Attachment
```

## Features

- Icon and image media through `attachment.Media`
- Upload states: idle, uploading, processing, error, and done with built-in styling and a shimmer while in progress
- Three sizes and horizontal or vertical orientation
- A full-card `attachment.Trigger` that opens a link or dialog while the actions stay independently clickable
- Scrollable, snapping `attachment.Group` with an edge fade
- Customizable styling through the `Class` prop on every part

## Image

Set `Variant: attachment.MediaVariantImage` on `attachment.Media` and render an `<img>` inside it. Use `Orientation: attachment.OrientationVertical` to stack the media above the content.

<ComponentPreview styleName="base-rhea" name="attachment-image" previewClassName="h-auto theme-blue bg-surface dark:bg-background" />

## States

Set `State` to reflect the upload lifecycle. `StateUploading` and `StateProcessing` shimmer the title, and `StateError` switches to a destructive treatment.

<ComponentPreview styleName="base-rhea" name="attachment-states" previewClassName="h-auto theme-blue bg-surface dark:bg-background" />

## Sizes

Use `Size` to switch between `SizeDefault`, `SizeSm`, and `SizeXs`.

<ComponentPreview styleName="base-rhea" name="attachment-sizes" previewClassName="h-auto theme-blue bg-surface dark:bg-background" />

## Group

Wrap attachments in `attachment.Group` to lay them out in a horizontally scrollable, snapping row with an edge fade.

<ComponentPreview styleName="base-rhea" name="attachment-group" previewClassName="h-auto theme-blue bg-surface dark:bg-background" />

## Trigger

Add an `attachment.Trigger` to make the whole card open a link or dialog. It fills the card behind the actions, so the actions stay clickable.

<ComponentPreview styleName="base-rhea" name="attachment-trigger" previewClassName="h-auto theme-blue bg-surface dark:bg-background" />

```templ showLineNumbers
@dialog.Dialog() {
	@attachment.Attachment() {
		// media, content, actions
		@attachment.Trigger(attachment.TriggerProps{
			Attributes: utils.MergeAttributes(
				dialog.Trigger(ctx),
				templ.Attributes{"data-slot": "dialog-trigger", "aria-label": "Preview research-summary.pdf"},
			),
		})
	}
	@dialog.Content() {
		// ...
	}
}
```

## Accessibility

`attachment.Action` renders a `Button`, and `attachment.Trigger` renders a real `<button>` (or an `<a>` with `Href`). Follow the guidance below so both are operable and announced.

### Label icon-only actions

`attachment.Action` is usually icon-only, so give each one an `aria-label` describing the action and its target.

```templ showLineNumbers
@attachment.Action(attachment.ActionProps{Attributes: templ.Attributes{"aria-label": "Remove sales-dashboard.pdf"}}) {
	@icon.X()
}
```

### Label the trigger

`attachment.Trigger` covers the card with no text of its own, so give it an `aria-label` for what activating it does.

```templ showLineNumbers
@attachment.Trigger(attachment.TriggerProps{
	Href:       url,
	Attributes: templ.Attributes{"target": "_blank", "rel": "noreferrer", "aria-label": "Open workspace.png"},
})
```

The trigger sits behind the actions in the stacking order, so an `attachment.Action` and the `attachment.Trigger` never trap each other — both remain separately focusable and clickable.

### Keyboard scrolling

An `attachment.Group` scrolls horizontally. When its attachments are interactive: a trigger or actions, keyboard users reach off-screen items by tabbing to them. For a row of presentational attachments, make the group itself focusable and scrollable by adding `tabindex="0"`, `role="group"`, and an `aria-label`.

### Meaning beyond color

The error state uses a destructive color. Keep the failure reason in `attachment.Description` so the state is not conveyed by color alone.

## API Reference

### Attachment

The root attachment container.

| Prop          | Type                                                                        | Default                 |
| ------------- | --------------------------------------------------------------------------- | ----------------------- |
| `State`       | `StateIdle \| StateUploading \| StateProcessing \| StateError \| StateDone` | `StateDone`             |
| `Size`        | `SizeDefault \| SizeSm \| SizeXs`                                           | `SizeDefault`           |
| `Orientation` | `OrientationHorizontal \| OrientationVertical`                              | `OrientationHorizontal` |
| `Class`       | `string`                                                                    | -                       |

### Media

The media slot for an icon or image preview.

| Prop      | Type                                    | Default            |
| --------- | --------------------------------------- | ------------------ |
| `Variant` | `MediaVariantIcon \| MediaVariantImage` | `MediaVariantIcon` |
| `Class`   | `string`                                | -                  |

### Content

Wraps the title and description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Title

The attachment name. Shimmers while the attachment is uploading or processing.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Description

Secondary metadata such as the file type, size, or upload status.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Actions

A container for one or more actions, aligned to the end of the attachment.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Action

An action button. Renders a [`Button`](/docs/components/button).

| Prop       | Type             | Default             |
| ---------- | ---------------- | ------------------- |
| `Variant`  | `button.Variant` | `VariantGhost`      |
| `Size`     | `button.Size`    | `SizeIconXs`        |
| `Type`     | `button.Type`    | `TypeButton`        |
| `Disabled` | `bool`           | `false`             |
| `Class`    | `string`         | -                   |

### Trigger

A full-card overlay that activates the attachment. Renders a `<button>` by default, an `<a>` with `Href`.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Href`  | `string` | -       |
| `Class` | `string` | -       |

### Group

Lays out attachments in a horizontally scrollable, snapping row.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
