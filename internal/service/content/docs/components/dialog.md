---
title: Dialog
description: A window overlaid on either the primary window or another dialog window, rendering the content underneath inert.
---

<ComponentPreview name="dialog-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add dialog
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="dialog" title="components/dialog/dialog.templ" />

<ComponentSource name="dialog" title="components/dialog/dialog.js" />

<ComponentSource name="dialog" title="components/baseui/scroll_lock.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/dialog"
```

```templ showLineNumbers
@dialog.Dialog() {
	@button.Button(button.Props{Attributes: dialog.Trigger(ctx)}) {
		Open
	}
	@dialog.Content() {
		@dialog.Header() {
			@dialog.Title() {
				Are you absolutely sure?
			}
			@dialog.Description() {
				This action cannot be undone.
			}
		}
	}
}
```

## Composition

Use the following composition to build a `Dialog`:

```text
dialog.Dialog
├── dialog.Trigger
└── dialog.Content
    ├── dialog.Header
    │   ├── dialog.Title
    │   └── dialog.Description
    └── dialog.Footer
        └── dialog.Close
```

## Custom Close Button

Replace the default close control with your own button.

<ComponentPreview name="dialog-close-button" />

## No Close Button

Use `HideCloseButton` to hide the close button.

<ComponentPreview name="dialog-no-close-button" />

## Sticky Footer

Keep actions visible while the content scrolls.

<ComponentPreview name="dialog-sticky-footer" />

## Scrollable Content

Long content can scroll while the header stays in view.

<ComponentPreview name="dialog-scrollable-content" />

## API Reference

### Dialog

The `Dialog` component is the root that links trigger, content and close via context.

| Prop               | Type     | Default |
| ------------------ | -------- | ------- |
| `Open`             | `bool`   | `false` |
| `DisablePointerDismissal` | `bool` | `false` |

### Trigger

`dialog.Trigger(ctx)` returns the attributes that turn any element into the trigger, usually spread onto a Button. Use `dialog.TriggerFor(id)` to target a dialog outside the current root.

| Prop  | Type              | Default |
| ----- | ----------------- | ------- |
| `ctx` | `context.Context` | -       |

### Content

The `dialog.Content` component is the dialog window.

| Prop              | Type     | Default |
| ----------------- | -------- | ------- |
| `HideCloseButton` | `bool`   | `false` |
| `Modal`           | `*bool`  | `true`  |
| `Class`           | `string` | -       |

### Header

The `dialog.Header` component holds the title and description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Title

The `dialog.Title` component is the accessible dialog title.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Description

The `dialog.Description` component is the accessible dialog description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Footer

The `dialog.Footer` component holds the actions at the bottom of the dialog.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Close

`dialog.Close(ctx)` returns the attributes that make any element close the dialog. Use `dialog.CloseFor(id)` to target a dialog outside the current root.

| Prop  | Type              | Default |
| ----- | ----------------- | ------- |
| `ctx` | `context.Context` | -       |
