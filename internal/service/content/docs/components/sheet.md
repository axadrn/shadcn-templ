---
title: Sheet
description: Extends the Dialog component to display content that complements the main content of the screen.
---

<ComponentPreview name="sheet-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add sheet
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="sheet" title="components/sheet/sheet.templ" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/sheet"
```

```templ showLineNumbers
@sheet.Sheet() {
	<button { sheet.Trigger(ctx)... }>Open</button>
	@sheet.Content() {
		@sheet.Header() {
			@sheet.Title() {
				Are you absolutely sure?
			}
			@sheet.Description() {
				This action cannot be undone.
			}
		}
	}
}
```

## Composition

Use the following composition to build a `Sheet`:

```text
sheet.Sheet
├── sheet.Trigger
└── sheet.Content
    ├── sheet.Header
    │   ├── sheet.Title
    │   └── sheet.Description
    └── sheet.Footer
```

## Side

Use the `Side` prop on `sheet.Content` to set the edge of the screen where the sheet appears. Values are `top`, `right`, `bottom`, and `left`.

<ComponentPreview name="sheet-side" />

## No Close Button

Use `HideCloseButton` on `sheet.Content` to hide the close button.

<ComponentPreview name="sheet-no-close-button" />

## API Reference

### Sheet

The `sheet.Sheet` component is the root, it carries the id that links trigger and content.

| Prop               | Type   | Default |
| ------------------ | ------ | ------- |
| `Open`             | `bool` | `false` |
| `DisablePointerDismissal` | `bool` | `false` |

### SheetTrigger

`sheet.Trigger(ctx)` returns the attributes that turn any element into the sheet trigger, `sheet.TriggerFor(id)` targets a sheet outside the current root. `sheet.Close(ctx)` and `sheet.CloseFor(id)` close it.

### SheetContent

The `sheet.Content` component is the sliding panel.

| Prop              | Type                                             | Default     |
| ----------------- | ------------------------------------------------ | ----------- |
| `Side`            | `SideTop \| SideRight \| SideBottom \| SideLeft` | `SideRight` |
| `HideCloseButton` | `bool`                                           | `false`     |
| `Class`           | `string`                                         | -           |

### SheetHeader

The `sheet.Header` component wraps the title and description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### SheetFooter

The `sheet.Footer` component holds actions at the bottom.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### SheetTitle

The `sheet.Title` component renders the accessible sheet title.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### SheetDescription

The `sheet.Description` component renders the accessible sheet description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
