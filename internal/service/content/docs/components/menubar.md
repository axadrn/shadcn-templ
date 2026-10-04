---
title: Menubar
description: A visually persistent menu common in desktop applications that provides quick access to a consistent set of commands.
---

<ComponentPreview name="menubar-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add menubar
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="menubar" title="components/menubar/menubar.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/menubar"
```

```templ showLineNumbers
@menubar.Menubar() {
	@menubar.Menu() {
		@menubar.Trigger() {
			File
		}
		@menubar.Content() {
			@menubar.Group() {
				@menubar.Item() {
					New Tab
					@menubar.Shortcut() {
						⌘T
					}
				}
				@menubar.Item() {
					New Window
				}
			}
			@menubar.Separator()
			@menubar.Group() {
				@menubar.Item() {
					Share
				}
				@menubar.Item() {
					Print
				}
			}
		}
	}
}
```

## Composition

Use the following composition to build a `Menubar`:

```text
menubar.Menubar
├── menubar.Menu
│   ├── menubar.Trigger
│   └── menubar.Content
│       ├── menubar.Group
│       │   ├── menubar.Label
│       │   ├── menubar.Item
│       │   └── menubar.Item
│       ├── menubar.Separator
│       ├── menubar.Group
│       │   ├── menubar.Label
│       │   ├── menubar.CheckboxItem
│       │   └── menubar.CheckboxItem
│       ├── menubar.Separator
│       ├── menubar.Group
│       │   ├── menubar.Label
│       │   └── menubar.RadioGroup
│       │       ├── menubar.RadioItem
│       │       └── menubar.RadioItem
│       └── menubar.Sub
│           ├── menubar.SubTrigger
│           └── menubar.SubContent
│               └── menubar.Group
│                   ├── menubar.Label
│                   ├── menubar.Item
│                   └── menubar.Item
└── menubar.Menu
    ├── menubar.Trigger
    └── menubar.Content
        └── menubar.Group
            ├── menubar.Label
            ├── menubar.Item
            └── menubar.Item
```

## Checkbox

Use `menubar.CheckboxItem` for toggleable options.

<ComponentPreview name="menubar-checkbox" />

## Radio

Use `menubar.RadioGroup` and `menubar.RadioItem` for single-select options.

<ComponentPreview name="menubar-radio" />

## Submenu

Use `menubar.Sub`, `menubar.SubTrigger`, and `menubar.SubContent` for nested menus.

<ComponentPreview name="menubar-submenu" />

## With Icons

<ComponentPreview name="menubar-icons" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="menubar-rtl" direction="rtl" />

## API Reference

The menus are the [Dropdown Menu](/docs/components/dropdown-menu)'s Base UI menus. See the [Base UI Menubar](https://base-ui.com/react/components/menubar#api-reference) documentation.

### Menubar

The row of menus. One trigger is in the tab order, the arrow keys move between the triggers and loop, Home and End jump to the first and last. While a menu is open, ArrowLeft and ArrowRight, hover and focus move to the neighbouring menu.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `ID`    | `string` | -       |
| `Class` | `string` | -       |

### Menu

Groups a trigger with its content. Renders no element.

| Prop | Type     | Default |
| ---- | -------- | ------- |
| `ID` | `string` | random  |

### Content

The menu surface, below its trigger with `align` start, `alignOffset` -4 and `sideOffset` 8.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Item

| Prop       | Type                                           | Default              |
| ---------- | ---------------------------------------------- | -------------------- |
| `Variant`  | `ItemVariantDefault \| ItemVariantDestructive` | `ItemVariantDefault` |
| `Inset`    | `bool`                                         | `false`              |
| `Disabled` | `bool`                                         | `false`              |
| `Class`    | `string`                                       | -                    |

### CheckboxItem

Toggles on click and keeps the menu open. Controlled when `Checked` is set: the item dispatches a cancelable `dropdownmenu-checked-change` event and the owner commits the state.

| Prop             | Type    | Default |
| ---------------- | ------- | ------- |
| `Checked`        | `*bool` | -       |
| `DefaultChecked` | `bool`  | `false` |
| `Inset`          | `bool`  | `false` |
| `Disabled`       | `bool`  | `false` |

### RadioGroup

Controlled when `Value` is set: a selection dispatches a cancelable `dropdownmenu-value-change` event.

| Prop           | Type      | Default |
| -------------- | --------- | ------- |
| `Value`        | `*string` | -       |
| `DefaultValue` | `string`  | -       |
| `Disabled`     | `bool`    | `false` |

### RadioItem

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Value`    | `string` | -       |
| `Inset`    | `bool`   | `false` |
| `Disabled` | `bool`   | `false` |

### Sub, SubTrigger, SubContent

`menubar.Sub` renders no element. A submenu opens on hover, click, ArrowRight and Enter, and closes on ArrowLeft and Escape.

| Prop    | Type     | Default | Part         |
| ------- | -------- | ------- | ------------ |
| `ID`    | `string` | random  | `Sub`        |
| `Inset` | `bool`   | `false` | `SubTrigger` |
