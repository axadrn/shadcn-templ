---
title: Alert Dialog
description: A modal dialog that interrupts the user with important content and expects a response.
---

<ComponentPreview name="alert-dialog-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add alert-dialog
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="alert-dialog" title="components/alertdialog/alertdialog.templ" />

The alert dialog reuses the dialog component and its script. Copy the `dialog` component as well, including `dialog.js`.

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/alertdialog"
```

```templ showLineNumbers
@alertdialog.AlertDialog() {
	@button.Button(button.Props{Attributes: alertdialog.Trigger(ctx)}) {
		Show Dialog
	}
	@alertdialog.Content() {
		@alertdialog.Header() {
			@alertdialog.Title() {
				Are you absolutely sure?
			}
			@alertdialog.Description() {
				This action cannot be undone. This will permanently delete your account
				from our servers.
			}
		}
		@alertdialog.Footer() {
			@alertdialog.Cancel() {
				Cancel
			}
			@alertdialog.Action() {
				Continue
			}
		}
	}
}
```

## Composition

Use the following composition to build an `AlertDialog`:

```text
alertdialog.AlertDialog
├── alertdialog.Trigger
└── alertdialog.Content
    ├── alertdialog.Header
    │   ├── alertdialog.Media
    │   ├── alertdialog.Title
    │   └── alertdialog.Description
    └── alertdialog.Footer
        ├── alertdialog.Cancel
        └── alertdialog.Action
```

## Basic

A basic alert dialog with a title, description, and cancel and continue buttons.

<ComponentPreview name="alert-dialog-basic" />

## Small

Use the `Size` prop to make the alert dialog smaller.

<ComponentPreview name="alert-dialog-small" />

## Media

Use the `alertdialog.Media` component to add a media element such as an icon or image to the alert dialog.

<ComponentPreview name="alert-dialog-media" />

## Small with Media

Use the `Size` prop to make the alert dialog smaller and the `alertdialog.Media` component to add a media element such as an icon or image to the alert dialog.

<ComponentPreview name="alert-dialog-small-media" />

## Destructive

Use the `alertdialog.Action` component to add a destructive action button to the alert dialog.

<ComponentPreview name="alert-dialog-destructive" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="alert-dialog-rtl" direction="rtl" previewClassName="h-56" />

## API Reference

### AlertDialog

The `AlertDialog` component is the root that links trigger, content and cancel via context. Unlike the dialog, it never closes on a click outside, only `Esc` and its buttons close it.

| Prop   | Type   | Default |
| ------ | ------ | ------- |
| `Open` | `bool` | `false` |

### Trigger

`alertdialog.Trigger(ctx)` returns the attributes that turn any element into the trigger, usually spread onto a Button. Use `alertdialog.TriggerFor(id)` to target an alert dialog outside the current root.

| Prop  | Type              | Default |
| ----- | ----------------- | ------- |
| `ctx` | `context.Context` | -       |

### Content

The `alertdialog.Content` component is the alert dialog window.

| Prop    | Type                | Default     |
| ------- | ------------------- | ----------- |
| `Size`  | `"default" \| "sm"` | `"default"` |
| `Class` | `string`            | -           |

### Header

The `alertdialog.Header` component holds the media, title and description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Media

The `alertdialog.Media` component holds a media element such as an icon or image.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Title

The `alertdialog.Title` component is the accessible alert dialog title.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Description

The `alertdialog.Description` component is the accessible alert dialog description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Footer

The `alertdialog.Footer` component holds the actions at the bottom of the alert dialog.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Action

The `alertdialog.Action` component is the confirm button. Like shadcn's `AlertDialogAction` it is a plain button and does not close the alert dialog by itself, spread `alertdialog.Close(ctx)` into `Attributes` or submit a form to wire the confirm behavior.

| Prop      | Type             | Default     |
| --------- | ---------------- | ----------- |
| `Variant` | `button.Variant` | `"default"` |
| `Size`    | `button.Size`    | `"default"` |
| `Class`   | `string`         | -           |

### Cancel

The `alertdialog.Cancel` component is the button that closes the alert dialog.

| Prop      | Type             | Default     |
| --------- | ---------------- | ----------- |
| `Variant` | `button.Variant` | `"outline"` |
| `Size`    | `button.Size`    | `"default"` |
| `Class`   | `string`         | -           |

### Close

`alertdialog.Close(ctx)` returns the attributes that make any element close the alert dialog. Use `alertdialog.CloseFor(id)` to target an alert dialog outside the current root.

| Prop  | Type              | Default |
| ----- | ----------------- | ------- |
| `ctx` | `context.Context` | -       |
