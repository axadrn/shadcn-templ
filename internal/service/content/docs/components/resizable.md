---
title: Resizable
description: Accessible resizable panel groups and layouts with keyboard support.
---

<ComponentPreview name="resizable-demo" previewClassName="h-80" />

## About

The `Resizable` component is a Templ pendant of [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels), the same primitive used by shadcn's Base UI variant. Its UI behavior targets `react-resizable-panels` `4.5.8`, the version currently resolved by shadcn/ui.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add resizable
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="resizable" title="components/resizable/resizable.templ" />

<ComponentSource name="resizable" title="components/resizable/resizable.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/resizable"
```

```templ showLineNumbers
@resizable.PanelGroup() {
  @resizable.Panel() {
    One
  }
  @resizable.Handle()
  @resizable.Panel() {
    Two
  }
}
```

## Composition

`Panel` and `Handle` components must be direct children of `PanelGroup`.

```text
PanelGroup
├── Panel
├── Handle
└── Panel
```

## Vertical

Use `Orientation: resizable.OrientationVertical` for vertical resizing.

<ComponentPreview name="resizable-vertical" />

## Handle

Use `WithHandle: true` to show a visible grip.

<ComponentPreview name="resizable-handle" />

## RTL

Resizable panel groups follow the document direction.

<ComponentPreview name="resizable-rtl" />

## Imperative API

The browser API mirrors the panel and group imperative handles used by shadcn's primitive.

```js
window.templ.resizable.resize("panel-id", "40%")
window.templ.resizable.collapse("panel-id")
window.templ.resizable.expand("panel-id")
window.templ.resizable.getSize("panel-id")
window.templ.resizable.getLayout("group-id")
window.templ.resizable.setLayout("group-id", {
  "left-panel": 40,
  "right-panel": 60,
})
```

`getSize` returns `{ asPercentage, inPixels }`. Group layouts are objects keyed by panel ID, matching `react-resizable-panels` v4. `PanelGroup` dispatches `resizable-layout-change` while resizing and `resizable-layout-changed` when the interaction is committed. Both events expose `{ layout }` in `event.detail`; the completed event also includes `isUserInteraction`.

## API Reference

### PanelGroup

| Prop                      | Type                                             | Default                 |
| ------------------------- | ------------------------------------------------ | ----------------------- |
| `Orientation`             | `OrientationHorizontal \| OrientationVertical` | `OrientationHorizontal` |
| `DefaultLayout`           | `map[string]float64`                             | -                       |
| `Disabled`                | `bool`                                           | `false`                 |
| `DisableCursor`           | `bool`                                           | `false`                 |
| `ResizeTargetMinimumSize` | `ResizeTargetMinimumSize`                        | `{Coarse: 20, Fine: 10}`|
| `ID`                      | `string`                                         | generated               |
| `Class`                   | `string`                                         | -                       |
| `Style`                   | `string`                                         | -                       |
| `Attributes`              | `templ.Attributes`                               | -                       |

### Panel

Sizes accept percentages, pixels, unitless percentage strings, and CSS length units. Numeric values passed to the JavaScript API are pixels, matching `react-resizable-panels` v4.

| Prop            | Type               | Default |
| --------------- | ------------------ | ------- |
| `DefaultSize`   | `string`           | auto    |
| `MinSize`       | `string`           | `0%`    |
| `MaxSize`       | `string`           | `100%`  |
| `Collapsible`   | `bool`             | `false` |
| `CollapsedSize` | `string`           | `0%`    |
| `Disabled`      | `bool`             | `false` |
| `GroupResizeBehavior` | `GroupResizeBehavior` | `PreserveRelativeSize` |
| `ID`            | `string`           | generated |
| `Class`         | `string`           | -       |
| `Style`         | `string`           | -       |
| `Attributes`    | `templ.Attributes` | -       |

### Handle

| Prop                 | Type               | Default |
| -------------------- | ------------------ | ------- |
| `WithHandle`         | `bool`             | `false` |
| `Disabled`           | `bool`             | `false` |
| `DisableDoubleClick` | `bool`             | `false` |
| `ID`                 | `string`           | generated |
| `Class`              | `string`           | -       |
| `Style`              | `string`           | -       |
| `Attributes`         | `templ.Attributes` | -       |

## Changelog

### `react-resizable-panels` 4.5.8

This pendant follows the concrete v4 version currently resolved by shadcn/ui rather than an unspecified moving `v4` target. Panel sizes use CSS-aware values such as `"50%"`, layouts are keyed by panel ID, `PanelGroup` maps to `Group`, and `Handle` maps to `Separator`.
