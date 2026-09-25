---
title: Select
description: Displays a list of options for the user to pick from, triggered by a button.
---

<ComponentPreview name="select-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add select
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="select" title="components/select/select.templ" />

<ComponentSource name="select" title="components/select/select.js" />

<ComponentSource name="select" title="components/baseui/scroll_lock.js" />

<ComponentSource name="select" title="components/floatingui/floating_ui_core.js" />

<ComponentSource name="select" title="components/floatingui/floating_ui_dom.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import selectcomp "github.com/axadrn/shadcn-templ/v2/components/select"
```

```templ showLineNumbers
@selectcomp.Select() {
	@selectcomp.Trigger(selectcomp.TriggerProps{Class: "w-[180px]"}) {
		@selectcomp.Value(selectcomp.ValueProps{Placeholder: "Theme"})
	}
	@selectcomp.Content() {
		@selectcomp.Group() {
			@selectcomp.Item(selectcomp.ItemProps{Value: "light"}) {
				Light
			}
			@selectcomp.Item(selectcomp.ItemProps{Value: "dark"}) {
				Dark
			}
			@selectcomp.Item(selectcomp.ItemProps{Value: "system"}) {
				System
			}
		}
	}
}
```

## Composition

Use the following composition to build a `Select`:

```text
selectcomp.Select
├── selectcomp.Trigger
│   └── selectcomp.Value
└── selectcomp.Content
    ├── selectcomp.Group
    │   ├── selectcomp.Label
    │   ├── selectcomp.Item
    │   └── selectcomp.Item
    ├── selectcomp.Separator
    └── selectcomp.Group
        ├── selectcomp.Label
        ├── selectcomp.Item
        └── selectcomp.Item
```

## Align Item With Trigger

By default the popup positions so the selected item appears over the trigger (Base UI's `alignItemWithTrigger`). Set `AlignItemWithTrigger: utils.Ptr(false)` on `selectcomp.Content` to open it below the trigger edge like a dropdown instead.

<ComponentPreview name="select-align-item" />

## Groups

Use `selectcomp.Group`, `selectcomp.Label`, and `selectcomp.Separator` to organize items.

<ComponentPreview name="select-groups" />

## Scrollable

A select with many items that scrolls.

<ComponentPreview name="select-scrollable" />

## Disabled

<ComponentPreview name="select-disabled" />

## Invalid

Set the `Invalid` prop on the `field.Field` component and `aria-invalid` on the `selectcomp.Trigger` component to show an error state.

```templ showLineNumbers /aria-invalid/
@field.Field(field.Props{Attributes: templ.Attributes{"data-invalid": "true"}}) {
	@field.Label() {
		Fruit
	}
	@selectcomp.Trigger(selectcomp.TriggerProps{Attributes: templ.Attributes{"aria-invalid": "true"}}) {
		@selectcomp.Value()
	}
}
```

<ComponentPreview name="select-invalid" />

## API Reference

### Select

The `selectcomp.Select` component is the root that carries the selection and the form value.

The `select-open-change` event detail contains `open` and `openMethod`.
`openMethod` is `null` when the event requests that the Select close. A Select
the server renders open counts as opened programmatically.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Name`     | `string` | -       |
| `Value`    | `string` | -       |
| `DefaultValue` | `string` | - |
| `Open` | `*bool` | - |
| `DefaultOpen` | `bool` | `false` |
| `Disabled` | `bool`   | `false` |

### SelectTrigger

The `selectcomp.Trigger` component is the button that opens the listbox.

| Prop      | Type                       | Default       |
| --------- | -------------------------- | ------------- |
| `Size`    | `SizeDefault \| SizeSm`    | `SizeDefault` |
| `Class`   | `string`                   | -             |

### SelectValue

The `selectcomp.Value` component shows the selected label inside the trigger.

| Prop          | Type     | Default |
| ------------- | -------- | ------- |
| `Placeholder` | `string` | -       |
| `Class`       | `string` | -       |

### SelectContent

The `selectcomp.Content` component is the listbox popup.

| Prop       | Type                                       | Default               |
| ---------- | ------------------------------------------ | --------------------- |
| `AlignItemWithTrigger` | `*bool` | `true` |
| `Align`    | `AlignStart \| AlignCenter \| AlignEnd`    | `AlignCenter`         |
| `Class`    | `string`                                   | -                     |

### SelectGroup

The `selectcomp.Group` component wraps related items.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### SelectLabel

The `selectcomp.Label` component titles a group.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### SelectItem

The `selectcomp.Item` component is a selectable option.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Value`    | `string` | -       |
| `Label`    | `string` | -       |
| `Disabled` | `bool`   | `false` |
| `Class`    | `string` | -       |

### SelectSeparator

The `selectcomp.Separator` component divides groups.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
