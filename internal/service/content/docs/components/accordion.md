---
title: Accordion
description: A vertically stacked set of interactive headings that each reveal a section of content.
---

<ComponentPreview name="accordion-demo" align="start" previewClassName="*:data-[slot=accordion]:max-w-sm h-[300px]" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add accordion
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="accordion" title="components/accordion/accordion.templ" />

<ComponentSource name="accordion" title="components/accordion/accordion.js" />

<ComponentSource name="accordion" title="components/baseui/use_transition_status.js" />

<ComponentSource name="accordion" title="components/baseui/lifecycle.js" />

<ComponentSource name="accordion" title="components/baseui/use_collapsible_panel.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/accordion"
```

```templ showLineNumbers
@accordion.Accordion() {
	@accordion.Item(accordion.ItemProps{Open: true}) {
		@accordion.Trigger() {
			Is it accessible?
		}
		@accordion.Content() {
			Yes. It adheres to the WAI-ARIA design pattern.
		}
	}
}
```

## Composition

Use the following composition to build an `Accordion`:

```text
accordion.Accordion
├── accordion.Item
│   ├── accordion.Trigger
│   └── accordion.Content
└── accordion.Item
    ├── accordion.Trigger
    └── accordion.Content
```

## Basic

A basic accordion that shows one item at a time. The first item is open by default.

<ComponentPreview name="accordion-basic" align="start" previewClassName="*:data-[slot=accordion]:max-w-sm h-[300px]" />

## DisableOpenMultiple

Use the `DisableOpenMultiple` prop to allow multiple items to be open at the same time.

<ComponentPreview name="accordion-multiple" align="start" previewClassName="*:data-[slot=accordion]:max-w-sm h-[450px]" />

## Disabled

Use the `Disabled` prop on `accordion.Item` to disable individual items.

<ComponentPreview name="accordion-disabled" align="start" previewClassName="*:data-[slot=accordion]:max-w-sm h-[300px]" />

## Borders

Add `border` to the `Accordion` and `border-b last:border-b-0` to the `accordion.Item` to add borders to the items.

<ComponentPreview name="accordion-borders" align="start" previewClassName="*:data-[slot=accordion]:max-w-sm h-[300px]" />

## Card

Wrap the `Accordion` in a `Card` component.

<ComponentPreview name="accordion-card" align="start" previewClassName="*:data-[slot=accordion]:max-w-sm h-[435px]" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="accordion-rtl" align="start" direction="rtl" />

## API Reference

### Accordion

The `Accordion` component is the root container that manages which items are open.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `DisableOpenMultiple` | `bool`   | `false` |
| `Class`    | `string` | -       |

### Item

The `accordion.Item` component wraps a single trigger and content pair.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Open`     | `bool`   | `false` |
| `Disabled` | `bool`   | `false` |
| `Class`    | `string` | -       |

### Trigger

The `accordion.Trigger` component toggles its item open and closed.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Content

The `accordion.Content` component holds the content revealed by the trigger.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
