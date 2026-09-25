---
title: Context Menu
description: Displays a menu located at the pointer, triggered by a right click or a long press.
---

<ComponentPreview name="context-menu-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add context-menu
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="context-menu" title="components/contextmenu/contextmenu.templ" />

<ComponentSource name="context-menu" title="components/contextmenu/contextmenu.js" />

<ComponentSource name="context-menu" title="components/baseui/scroll_lock.js" />

<ComponentSource name="context-menu" title="components/floatingui/floating_ui_core.js" />

<ComponentSource name="context-menu" title="components/floatingui/floating_ui_dom.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/contextmenu"
```

```templ showLineNumbers
@contextmenu.ContextMenu() {
	@contextmenu.Trigger() {
		Right click here
	}
	@contextmenu.Content() {
		@contextmenu.Item() {
			Profile
		}
		@contextmenu.Item() {
			Billing
		}
		@contextmenu.Item() {
			Team
		}
		@contextmenu.Item() {
			Subscription
		}
	}
}
```

## Composition

Use the following composition to build a `ContextMenu`:

```text
contextmenu.ContextMenu
├── contextmenu.Trigger
└── contextmenu.Content
    ├── contextmenu.Group
    │   ├── contextmenu.Label
    │   ├── contextmenu.Item
    │   └── contextmenu.Item
    ├── contextmenu.Separator
    ├── contextmenu.Group
    │   ├── contextmenu.Label
    │   ├── contextmenu.CheckboxItem
    │   └── contextmenu.CheckboxItem
    ├── contextmenu.Separator
    ├── contextmenu.Group
    │   ├── contextmenu.Label
    │   └── contextmenu.RadioGroup
    │       ├── contextmenu.RadioItem
    │       └── contextmenu.RadioItem
    └── contextmenu.Sub
        ├── contextmenu.SubTrigger
        └── contextmenu.SubContent
            └── contextmenu.Group
                ├── contextmenu.Item
                └── contextmenu.Item
```

## Basic

A simple context menu with a few actions.

<ComponentPreview name="context-menu-basic" />

## Submenu

Use `contextmenu.Sub` to nest secondary actions.

<ComponentPreview name="context-menu-submenu" />

## Shortcuts

Add `contextmenu.Shortcut` to show keyboard hints.

<ComponentPreview name="context-menu-shortcuts" />

## Groups

Group related actions and separate them with dividers.

<ComponentPreview name="context-menu-groups" />

## Icons

Combine icons with labels for quick scanning.

<ComponentPreview name="context-menu-icons" />

## Checkboxes

Use `contextmenu.CheckboxItem` for toggles.

<ComponentPreview name="context-menu-checkboxes" />

## Radio

Use `contextmenu.RadioItem` for exclusive choices.

<ComponentPreview name="context-menu-radio" />

## Destructive

Use `Variant: contextmenu.ItemVariantDestructive` to style the menu item as destructive.

<ComponentPreview name="context-menu-destructive" />

## Sides

Control submenu placement with `Side` and `Align` props.

<ComponentPreview name="context-menu-sides" />

## API Reference

### Content

The `contextmenu.Content` component is the menu surface, positioned at the pointer and clamped to the viewport.

| Prop          | Type                                                    | Default     |
| ------------- | ------------------------------------------------------- | ----------- |
| `Side`        | `SideTop \| SideRight \| SideBottom \| SideLeft`   | `SideRight` |
| `SideOffset`  | `int`                                                   | `0`         |
| `AlignOffset` | `int`                                                   | `4`         |
| `Class`       | `string`                                                | -           |

### Item

The `contextmenu.Item` component is a selectable entry. It renders as a link when `Href` is set and closes the menu on click.

| Prop           | Type                                          | Default          |
| -------------- | --------------------------------------------- | ---------------- |
| `Variant`      | `ItemVariantDefault \| ItemVariantDestructive` | `ItemVariantDefault` |
| `Inset`        | `bool`                                        | `false`          |
| `Disabled`     | `bool`                                        | `false`          |
| `Href`         | `string`                                      | -                |
| `Target`       | `string`                                      | -                |
| `CloseOnClick`        | `*bool`                                       | `true`           |
| `Class`        | `string`                                      | -                |

### CheckboxItem

The `contextmenu.CheckboxItem` component is a toggleable item with a check indicator. It keeps the menu open on click.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Checked`  | `bool`   | `false` |
| `Disabled` | `bool`   | `false` |
| `Class`    | `string` | -       |

### RadioGroup

The `contextmenu.RadioGroup` component wraps radio items and enforces single selection among them.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### RadioItem

The `contextmenu.RadioItem` component is a single-select item with a dot indicator. It keeps the menu open on click.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Value`    | `string` | -       |
| `Checked`  | `bool`   | `false` |
| `Disabled` | `bool`   | `false` |
| `Class`    | `string` | -       |

### SubTrigger

The `contextmenu.SubTrigger` component opens a nested submenu on hover. Wrap it with `contextmenu.SubContent` in a `contextmenu.Sub`.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Inset` | `bool`   | `false` |
| `Class` | `string` | -       |
