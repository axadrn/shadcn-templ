---
title: Navigation Menu
description: A collection of links for navigating websites.
---

<ComponentPreview name="navigation-menu-demo" previewClassName="h-96" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add navigation-menu
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="navigation-menu" title="components/navigationmenu/navigationmenu.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/navigationmenu"
```

```templ showLineNumbers
@navigationmenu.NavigationMenu() {
	@navigationmenu.List() {
		@navigationmenu.Item() {
			@navigationmenu.Trigger() {
				Item One
			}
			@navigationmenu.Content() {
				@navigationmenu.Link() {
					Link
				}
			}
		}
	}
}
```

## Composition

Use the following composition to build a `NavigationMenu`:

```text
navigationmenu.NavigationMenu
├── navigationmenu.List
│   ├── navigationmenu.Item
│   │   ├── navigationmenu.Trigger
│   │   └── navigationmenu.Content
│   │       ├── navigationmenu.Link
│   │       └── navigationmenu.Link
│   └── navigationmenu.Item
│       └── navigationmenu.Link
└── navigationmenu.Indicator
```

## Link Component

Set `Href` on `Link` to render it as a link. Use `navigationmenu.TriggerStyle()` to give a link in the list the look of a trigger.

```templ showLineNumbers
@navigationmenu.Item() {
	@navigationmenu.Link(navigationmenu.LinkProps{
		Href:  "/docs",
		Class: navigationmenu.TriggerStyle(),
	}) {
		Documentation
	}
}
```

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="navigation-menu-rtl" direction="rtl" previewClassName="h-96" />

## API Reference

See the [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu#api-reference) documentation for the behavior.

### NavigationMenu

| Prop         | Type     | Default   |
| ------------ | -------- | --------- |
| `Align`      | `Align`  | `"start"` |
| `Delay`      | `int`    | `50`      |
| `CloseDelay` | `int`    | `50`      |
| `ID`         | `string` | -         |
| `Class`      | `string` | -         |

### Positioner

Rendered by `NavigationMenu`.

| Prop          | Type    | Default    |
| ------------- | ------- | ---------- |
| `Side`        | `Side`  | `"bottom"` |
| `SideOffset`  | `*int`  | `8`        |
| `Align`       | `Align` | `"start"`  |
| `AlignOffset` | `int`   | `0`        |

### Link

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Href`  | `string` | -       |
| `Class` | `string` | -       |

`List`, `Item`, `Trigger`, `Content` and `Indicator` take `ID`, `Class` and `Attributes`.
