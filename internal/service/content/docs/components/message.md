---
title: Message
description: Displays a message in a conversation, with optional avatar, header, footer, and alignment.
---

<ComponentPreview styleName="base-rhea" name="message-demo" previewClassName="h-auto theme-blue" />

The `Message` component lays out a single message in a conversation. It handles the avatar, alignment, header, and footer around the message surface.

For AI apps, you can render reasoning steps, tool calls and assistant messages using the `Message` component.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add message
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="message" title="components/message/message.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import (
	"github.com/axadrn/shadcn-templ/v2/components/avatar"
	"github.com/axadrn/shadcn-templ/v2/components/bubble"
	"github.com/axadrn/shadcn-templ/v2/components/message"
)
```

```templ showLineNumbers
@message.Message() {
	@message.Avatar() {
		@avatar.Avatar() {
			@avatar.Image(avatar.ImageProps{Src: "https://github.com/shadcn.png", Alt: "@shadcn"})
			@avatar.Fallback() {
				CN
			}
		}
	}
	@message.Content() {
		@bubble.Bubble() {
			@bubble.Content() {
				How can I help you today?
			}
		}
	}
}
```

**Note:** `Message` owns the row layout—avatar, alignment, header, and footer.
Render the visible message surface inside it with
[`Bubble`](/docs/components/bubble).

## Composition

Use the following composition to build a message:

```text
message.Message
├── message.Avatar
└── message.Content
    ├── message.Header
    ├── bubble.Bubble
    └── message.Footer
```

Use `message.Group` to stack consecutive messages from the same sender:

```text
message.Group
├── message.Message
└── message.Message
```

## Features

- Start and end alignment for sender and receiver rows via the `Align` prop
- Avatar slot that anchors to the bottom of the message and stays clear of the footer
- Header and footer slots for sender names, status, and message actions
- Footer follows the message side; actions stay aligned on `AlignEnd` rows
- Group wrapper for stacking consecutive messages from the same sender
- Customizable styling through the `Class` prop on every part

## Avatar

Use `message.Avatar` to render an avatar next to the message. Set `Align: message.AlignEnd` on the message to align the avatar to the end of the message.

<ComponentPreview styleName="base-rhea" name="message-avatar" previewClassName="h-auto theme-blue" />

| Align        | Description                                         |
| ------------ | --------------------------------------------------- |
| `AlignStart` | Align the message to the start of the conversation. |
| `AlignEnd`   | Align the message to the end of the conversation.   |

## Group

Use `message.Group` to stack consecutive messages from the same sender. Render an empty `message.Avatar` on the earlier messages to keep them aligned with the avatar on the last one.

<ComponentPreview styleName="base-rhea" name="message-group" previewClassName="h-auto theme-blue" />

## Header and Footer

Use `message.Header` for a sender name and `message.Footer` for metadata such as a delivery or read status.

<ComponentPreview styleName="base-rhea" name="message-header-footer" previewClassName="h-auto theme-blue" />

## Actions

Place message-level actions in `message.Footer`, such as copy, retry, or feedback buttons.

<ComponentPreview styleName="base-rhea" name="message-actions" previewClassName="h-auto theme-blue" />

## Attachment

<ComponentPreview styleName="base-rhea" name="message-attachment" previewClassName="h-auto theme-blue" />

## Accessibility

`Message` is a presentational layout wrapper. Accessibility comes from the content you place inside it.

### Label icon-only actions

Action buttons in `message.Footer` are usually icon-only, so give each one an `aria-label`.

```templ showLineNumbers
@message.Footer() {
	@button.Button(button.Props{Variant: button.VariantGhost, Size: button.SizeIcon, Attributes: templ.Attributes{"aria-label": "Copy"}}) {
		@icon.Copy()
	}
}
```

### Status updates

For in-progress messages, use a [`Marker`](/docs/components/marker) with `role="status"` so assistive tech announces the update as it appears.

```templ showLineNumbers
@message.Message() {
	@marker.Marker(marker.Props{Attributes: templ.Attributes{"role": "status"}}) {
		@marker.Icon() {
			@spinner.Spinner()
		}
		@marker.Content() {
			Checking the logs...
		}
	}
}
```

## API Reference

### Message

The message row wrapper.

| Prop    | Type                    | Default      |
| ------- | ----------------------- | ------------ |
| `Align` | `AlignStart \| AlignEnd` | `AlignStart` |
| `Class` | `string`                | -            |

### Group

Groups consecutive messages from the same sender.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Avatar

The avatar slot, aligned to the bottom of the message. When the message has a `message.Footer`, the avatar shifts up to stay aligned with the message surface instead of the footer.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Content

Wraps the header, message surface, and footer.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Header

Displays content above the message, such as a sender name. Stays aligned to the start regardless of `Align`.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Footer

Displays content below the message, such as status or actions. Aligns to the message side.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
