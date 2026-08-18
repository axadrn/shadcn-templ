---
title: Tabs
description: A set of layered sections of content—known as tab panels—that are displayed one at a time.
---

<ComponentPreview name="tabs-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add tabs
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="tabs" title="components/tabs/tabs.templ" />

<ComponentSource name="tabs" title="components/tabs/tabs.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/tabs"
```

```templ showLineNumbers
@tabs.Tabs(tabs.Props{DefaultValue: "account"}) {
	@tabs.List() {
		@tabs.Trigger(tabs.TriggerProps{Value: "account"}) {
			Account
		}
		@tabs.Trigger(tabs.TriggerProps{Value: "password"}) {
			Password
		}
	}
	@tabs.Content(tabs.ContentProps{Value: "account"}) {
		Account content.
	}
	@tabs.Content(tabs.ContentProps{Value: "password"}) {
		Password content.
	}
}
```

## Composition

Use the following composition to build `Tabs`:

```text
tabs.Tabs
├── tabs.List
│   ├── tabs.Trigger
│   └── tabs.Trigger
├── tabs.Content
└── tabs.Content
```

## Line

Use the `Variant: tabs.VariantLine` prop on `tabs.List` for a line style.

<ComponentPreview name="tabs-line" />

## Vertical

Use `Orientation: tabs.OrientationVertical` for vertical tabs.

<ComponentPreview name="tabs-vertical" />

## Disabled

<ComponentPreview name="tabs-disabled" />

## Icons

<ComponentPreview name="tabs-icons" />

## Accessibility

The list is a single tab stop. Once a tab has focus the left and right arrow
keys walk the list — up and down when `Orientation` is vertical — `Home` and
`End` jump to its ends, disabled tabs are skipped and the movement wraps.

Moving focus does not change the active tab; `Enter` or `Space` does. Set
`ActivateOnFocus` on the list to select as the arrows move instead:

```templ
@tabs.List(tabs.ListProps{ActivateOnFocus: true}) {
	...
}
```

Leave it off when a panel loads its content on activation, or every arrow
press costs a request.

## API Reference

### Tabs

The `tabs.Tabs` component is the root, it shares the tabs id with list, triggers and contents.

| Prop           | Type                                           | Default      |
| -------------- | ---------------------------------------------- | ------------ |
| `DefaultValue` | `string`                                       | -            |
| `Orientation`  | `OrientationHorizontal \| OrientationVertical` | `horizontal` |
| `Class`        | `string`                                       | -            |

### TabsList

The `tabs.List` component wraps the triggers.

| Prop              | Type                            | Default   |
| ----------------- | ------------------------------- | --------- |
| `Variant`         | `VariantDefault \| VariantLine` | `default` |
| `ActivateOnFocus` | `bool`                          | `false`   |
| `Class`           | `string`                        | -         |

### TabsTrigger

The `tabs.Trigger` component activates its tab panel.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Value`    | `string` | -       |
| `Disabled` | `bool`   | `false` |
| `Class`    | `string` | -       |

### TabsContent

The `tabs.Content` component is the tab panel.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Value` | `string` | -       |
| `Class` | `string` | -       |
