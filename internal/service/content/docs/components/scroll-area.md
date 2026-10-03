---
title: Scroll Area
description: Augments native scroll functionality for custom, cross-browser styling.
---

<ComponentPreview name="scroll-area-demo" previewClassName="h-96" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add scroll-area
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="scroll-area" title="components/scrollarea/scrollarea.templ" />

<ComponentSource name="scroll-area" title="components/scrollarea/scrollarea.js" />

<ComponentSource name="scroll-area" title="components/baseui/lifecycle.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/scrollarea"
```

```templ showLineNumbers
@scrollarea.ScrollArea(scrollarea.Props{Class: "h-[200px] w-[350px] rounded-md border p-4"}) {
	Your scrollable content here.
}
```

## Composition

Use the following composition to build a `ScrollArea`:

```text
scrollarea.ScrollArea
└── scrollarea.ScrollBar
```

## Horizontal

Use `ScrollBar` with `Orientation: scrollarea.OrientationHorizontal` for horizontal scrolling.

<ComponentPreview name="scroll-area-horizontal-demo" />

## API Reference

### ScrollArea

The `ScrollArea` component wraps its children in a scrollable viewport with a vertical scrollbar.

| Prop         | Type               | Default |
| ------------ | ------------------ | ------- |
| `ID`         | `string`           | -       |
| `Class`      | `string`           | -       |
| `Attributes` | `templ.Attributes` | -       |

### ScrollBar

The `ScrollBar` component renders a scrollbar. Add a horizontal one as a child of `ScrollArea`.

| Prop          | Type                                              | Default               |
| ------------- | ------------------------------------------------- | --------------------- |
| `Orientation` | `OrientationVertical \| OrientationHorizontal`    | `OrientationVertical` |
| `Class`       | `string`                                          | -                     |
| `Attributes`  | `templ.Attributes`                                | -                     |

See the [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area#api-reference) documentation.
