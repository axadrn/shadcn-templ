---
title: Carousel
description: A carousel with motion and swipe built using vanilla JavaScript.
---

<ComponentPreview name="carousel-demo" previewClassName="h-80 sm:h-[32rem]" />

## About

The carousel component is built using native templ and vanilla JavaScript, no external dependencies.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add carousel
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="carousel" title="components/carousel/carousel.templ" />

<ComponentSource name="carousel" title="components/carousel/carousel.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/carousel"
```

```templ showLineNumbers
@carousel.Carousel() {
	@carousel.Content() {
		@carousel.Item() {
			...
		}
		@carousel.Item() {
			...
		}
		@carousel.Item() {
			...
		}
	}
	@carousel.Previous()
	@carousel.Next()
}
```

## Composition

Use the following composition to build a `Carousel`:

```text
carousel.Carousel
├── carousel.Content
│   ├── carousel.Item
│   └── carousel.Item
├── carousel.Previous
└── carousel.Next
```

## Sizes

To set the size of the items, you can use the `basis` utility class on the `carousel.Item`.

<ComponentPreview name="carousel-size" />

```templ showLineNumbers {4-6}
// 33% of the carousel width.
@carousel.Carousel() {
	@carousel.Content() {
		@carousel.Item(carousel.ItemProps{Class: "basis-1/3"}) { ... }
		@carousel.Item(carousel.ItemProps{Class: "basis-1/3"}) { ... }
		@carousel.Item(carousel.ItemProps{Class: "basis-1/3"}) { ... }
	}
}
```

```templ showLineNumbers {4-6}
// 50% on small screens and 33% on larger screens.
@carousel.Carousel() {
	@carousel.Content() {
		@carousel.Item(carousel.ItemProps{Class: "md:basis-1/2 lg:basis-1/3"}) { ... }
		@carousel.Item(carousel.ItemProps{Class: "md:basis-1/2 lg:basis-1/3"}) { ... }
		@carousel.Item(carousel.ItemProps{Class: "md:basis-1/2 lg:basis-1/3"}) { ... }
	}
}
```

## Spacing

To set the spacing between the items, we use a `pl-[VALUE]` utility on the `carousel.Item` and a negative `-ml-[VALUE]` on the `carousel.Content`.

<ComponentPreview name="carousel-spacing" />

```templ showLineNumbers /-ml-4/ /pl-4/
@carousel.Carousel() {
	@carousel.Content(carousel.ContentProps{Class: "-ml-4"}) {
		@carousel.Item(carousel.ItemProps{Class: "pl-4"}) { ... }
		@carousel.Item(carousel.ItemProps{Class: "pl-4"}) { ... }
		@carousel.Item(carousel.ItemProps{Class: "pl-4"}) { ... }
	}
}
```

```templ showLineNumbers /-ml-2/ /pl-2/ /md:-ml-4/ /md:pl-4/
@carousel.Carousel() {
	@carousel.Content(carousel.ContentProps{Class: "-ml-2 md:-ml-4"}) {
		@carousel.Item(carousel.ItemProps{Class: "pl-2 md:pl-4"}) { ... }
		@carousel.Item(carousel.ItemProps{Class: "pl-2 md:pl-4"}) { ... }
		@carousel.Item(carousel.ItemProps{Class: "pl-2 md:pl-4"}) { ... }
	}
}
```

## Orientation

Use the `Orientation` prop to set the orientation of the carousel.

<ComponentPreview name="carousel-orientation" previewClassName="h-[32rem]" />

```templ showLineNumbers /OrientationVertical/
@carousel.Carousel(carousel.Props{Orientation: carousel.OrientationVertical}) {
	@carousel.Content() {
		@carousel.Item() { ... }
		@carousel.Item() { ... }
		@carousel.Item() { ... }
	}
}
```

## Options

You can configure the carousel using the `Align`, `Loop`, `Autoplay` and `Interval` props.

```templ showLineNumbers {2-3}
@carousel.Carousel(carousel.Props{
	Align: carousel.AlignStart,
	Loop:  true,
}) {
	@carousel.Content() {
		@carousel.Item() { ... }
		@carousel.Item() { ... }
		@carousel.Item() { ... }
	}
}
```

## API

The carousel reports its selection through the bubbling `carousel-select` event, whose detail carries `selected` (starting at 1) and `count`.

<ComponentPreview name="carousel-api" previewClassName="sm:h-[32rem]" />

```html showLineNumbers {2,5-6}
<script>
	const carousel = document.getElementById("my-carousel");
	carousel.addEventListener("carousel-select", (e) => {
		const current = e.detail.selected;
		const count = e.detail.count;
	});
</script>
```

## Events

You can listen to events using the bubbling `carousel-select` event.

```html showLineNumbers
<script>
	document.addEventListener("carousel-select", (e) => {
		// Do something on select.
		console.log("Slide " + e.detail.selected + " of " + e.detail.count);
	});
</script>
```

## Plugins

Use the `Autoplay` prop with an optional `Interval` to advance the slides automatically. Autoplay pauses while hovered.

```templ showLineNumbers {2-3}
@carousel.Carousel(carousel.Props{
	Autoplay: true,
	Interval: 2000,
}) {
	// ...
}
```

<ComponentPreview name="carousel-plugin" previewClassName="sm:h-[32rem]" />

## API Reference

### Carousel

The `Carousel` component is the root container that manages scrolling, keyboard navigation and autoplay.

| Prop          | Type                                                | Default                 |
| ------------- | --------------------------------------------------- | ----------------------- |
| `Orientation` | `OrientationHorizontal \| OrientationVertical`   | `OrientationHorizontal` |
| `Align`       | `AlignStart \| AlignCenter \| AlignEnd`          | `AlignCenter`           |
| `Loop`        | `bool`                                              | `false`                 |
| `Autoplay`    | `bool`                                              | `false`                 |
| `Interval`    | `int`                                               | `5000`                  |
| `Class`       | `string`                                            | -                       |

### Content

The `carousel.Content` component is the sliding track that holds the items.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Item

The `carousel.Item` component is a single slide.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Previous

The `carousel.Previous` component scrolls to the previous slide.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Next

The `carousel.Next` component scrolls to the next slide.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
