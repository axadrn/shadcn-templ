---
title: Marker
description: Displays an inline status, system note, bordered row, or labeled separator in a conversation.
---

<ComponentPreview styleName="base-rhea" name="marker-demo" previewClassName="h-auto theme-blue" />

The `Marker` component displays inline conversation markers such as status updates, system notes, bordered rows, and labeled separators. Compose it with [`Message`](/docs/components/message) in a conversation thread.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add marker
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="marker" title="components/marker/marker.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/marker"
```

```templ showLineNumbers
@marker.Marker() {
	@marker.Icon() {
		@icon.Check()
	}
	@marker.Content() {
		Explored 4 files
	}
}
```

## Composition

Use the following composition to build a marker:

```text
marker.Marker
├── marker.Icon
└── marker.Content
```

## Features

- Inline marker, bordered row, and labeled separator variants
- Decorative icon slot that is hidden from assistive tech
- A link marker through `Href`, a button marker through `marker.Variants`
- Pairs with the `shimmer` utility for streaming status text
- Customizable styling through the `Class` prop on every part

## Variants

Use `Variant` to switch between an inline marker, bordered row, and labeled separator.

<ComponentPreview styleName="base-rhea" name="marker-variants" previewClassName="h-auto theme-blue" />

| Variant            | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `VariantDefault`   | An inline marker for status, notes, and actions.     |
| `VariantBorder`    | A default marker with a bottom border under the row. |
| `VariantSeparator` | A centered label with divider lines on each side.    |

## Status

Set `role="status"` and include a [`Spinner`](/docs/components/spinner) for streaming or in-progress markers so updates are announced.

<ComponentPreview styleName="base-rhea" name="marker-status" previewClassName="h-auto theme-blue" />

## Shimmer

Add the `shimmer` utility class to `marker.Content` for an animated streaming-text effect.

<ComponentPreview styleName="base-rhea" name="marker-shimmer" previewClassName="h-auto theme-blue" />

## Separator

Use the separator variant for labeled dividers, such as dates or section breaks, in a conversation.

<ComponentPreview styleName="base-rhea" name="marker-separator" previewClassName="h-auto theme-blue" />

## Border

Use the border variant for status rows that should keep the default marker alignment while separating the next row.

<ComponentPreview styleName="base-rhea" name="marker-border" previewClassName="h-auto theme-blue" />

## With Icon

Use `marker.Icon` to render an icon alongside the content. Use `flex-col` to stack the icon above the content.

<ComponentPreview styleName="base-rhea" name="marker-icon" previewClassName="h-auto theme-blue" />

## Links and Buttons

Turn a marker into a link with `Href`. For a button, render the element yourself with `marker.Variants` and the marker's `data-slot` and `data-variant`.

<ComponentPreview styleName="base-rhea" name="marker-link-button" previewClassName="h-auto theme-blue" />

```templ showLineNumbers
@marker.Marker(marker.Props{Href: "#"}) {
	@marker.Content() {
		View the pull request
	}
}
```

## Accessibility

`Marker` is presentational by default. The correct semantics depend on how you use it, so choose the role based on intent rather than relying on a single default.

### Status and Progress

For streaming or progress markers such as "Thinking..." or a running tool, set `role="status"` so assistive tech announces the update as it appears.

```templ showLineNumbers
@marker.Marker(marker.Props{Attributes: templ.Attributes{"role": "status"}}) {
	@marker.Icon() {
		@spinner.Spinner()
	}
	@marker.Content() {
		Compacting conversation
	}
}
```

### Labeled Separators

A separator that carries text, such as a date or a section label, needs no role. The divider lines are decorative CSS pseudo-elements, and the text is announced as ordinary content.

<Callout>
  **Note:** Do not add `role="separator"` to a labeled divider. A separator
  takes its accessible name from `aria-label`, not from its text, and its
  contents are treated as presentational, so the visible label would not be
  announced. Reserve `role="separator"` for a divider with no meaningful text.
</Callout>

### Decorative Icons

`marker.Icon` is decorative and hidden from assistive tech with `aria-hidden`, so the adjacent `marker.Content` carries the meaning. For an icon-only marker, provide an `aria-label` or visible text so it is not announced as empty.

### Interactive Markers

When a marker links or triggers an action, render it as a real `<a>` (`Href`) or `<button>` so it is focusable and exposes the correct role. The accessible name comes from the marker text.

## API Reference

### Marker

The root marker element. `marker.Variants` returns the marker classes for an element of your own.

| Prop         | Type                                                    | Default          |
| ------------ | ------------------------------------------------------- | ---------------- |
| `Variant`    | `VariantDefault \| VariantBorder \| VariantSeparator`   | `VariantDefault` |
| `Href`       | `string`                                                | -                |
| `Class`      | `string`                                                | -                |
| `Attributes` | `templ.Attributes`                                      | -                |

### Icon

A decorative icon slot. Hidden from assistive tech with `aria-hidden`.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Content

The marker text content.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
