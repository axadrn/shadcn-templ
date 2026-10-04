---
title: Direction
description: A provider component that sets the text direction for your application.
---

The `DirectionProvider` component is used to set the text direction (`ltr` or `rtl`) for your application. This is essential for supporting right-to-left languages like Arabic, Hebrew, and Persian.

Here's a preview of the component in RTL mode. To see more examples, look for the RTL section on components pages.

<ComponentPreview name="card-rtl" previewClassName="h-auto" hideCode />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>

<TabsContent value="cli">

```bash
shadcn-templ add direction
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="direction" title="components/direction/direction.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/direction"
```

```templ showLineNumbers
<html dir="rtl">
	<body>
		@direction.DirectionProvider(direction.Props{Direction: direction.DirectionRTL}) {
			// Your app content
		}
	</body>
</html>
```

## Direction

`utils.Direction(ctx)` returns the current direction of the application, `ltr` without a provider. The component scripts read the same value through `window.templ.direction.useDirection(element)`.

```templ showLineNumbers
templ MyComponent() {
	<div>Current direction: { utils.Direction(ctx) }</div>
}
```
