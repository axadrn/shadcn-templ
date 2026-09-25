---
title: Collapsible
description: An interactive component which expands/collapses a panel.
---

<ComponentPreview name="collapsible-demo" align="start" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add collapsible
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="collapsible" title="components/collapsible/collapsible.templ" />

<ComponentSource name="collapsible" title="components/collapsible/collapsible.js" />

<ComponentSource name="collapsible" title="components/baseui/use_transition_status.js" />

<ComponentSource name="collapsible" title="components/baseui/lifecycle.js" />

<ComponentSource name="collapsible" title="components/baseui/use_collapsible_panel.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/collapsible"
```

```templ showLineNumbers
@collapsible.Collapsible() {
	@button.Button(button.Props{Attributes: collapsible.Trigger(ctx)}) {
		Can I use this in my project?
	}
	@collapsible.Content() {
		Yes. Free to use for personal and commercial projects. No attribution required.
	}
}
```

## Composition

Use the following composition to build a `Collapsible`:

```text
collapsible.Collapsible
├── collapsible.Trigger
└── collapsible.Content
```

## Open State

Use the `Open` prop to render the collapsible expanded initially.

```templ showLineNumbers
@collapsible.Collapsible(collapsible.Props{Open: true}) {
	@button.Button(button.Props{Attributes: collapsible.Trigger(ctx)}) {
		Toggle
	}
	@collapsible.Content() {
		Content
	}
}
```

## Basic

<ComponentPreview name="collapsible-basic" align="start" />

## Settings Panel

Use a trigger button to reveal additional settings.

<ComponentPreview name="collapsible-settings" />

## File Tree

Use nested collapsibles to build a file tree.

<ComponentPreview name="collapsible-file-tree" previewClassName="h-[36rem]" />

## API Reference

### Collapsible

The `Collapsible` component is the root that manages the open state and links trigger and content.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Open`  | `bool`   | `false` |
| `Class` | `string` | -       |

### Trigger

`collapsible.Trigger(ctx)` returns the attributes that turn any element into the trigger, usually spread onto a Button. The trigger carries `data-panel-open` while the panel is open.

| Prop  | Type              | Default |
| ----- | ----------------- | ------- |
| `ctx` | `context.Context` | -       |

### Content

The `collapsible.Content` component holds the content revealed by the trigger.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
