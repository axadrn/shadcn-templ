---
title: Kbd
description: Used to display textual user input from keyboard.
---

<ComponentPreview name="kbd-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add kbd
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="kbd" title="components/kbd/kbd.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/kbd"
```

```templ showLineNumbers
@kbd.Kbd() {
	Ctrl
}
```

## Composition

Use the following composition to build `Kbd` and `KbdGroup`:

```text
kbd.Kbd
kbd.Group
├── kbd.Kbd
└── kbd.Kbd
```

## Group

Use the `kbd.Group` component to group keyboard keys together.

<ComponentPreview name="kbd-group" />

## Button

Use the `Kbd` component inside a `Button` component to display a keyboard key inside a button.

<ComponentPreview name="kbd-button" />

## Tooltip

You can use the `Kbd` component inside a `Tooltip` component to display a tooltip with a keyboard key.

<ComponentPreview name="kbd-tooltip" />

## Input Group

You can use the `Kbd` component inside a `inputgroup.Addon` component to display a keyboard key inside an input group.

<ComponentPreview name="kbd-input-group" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="kbd-rtl" direction="rtl" />

## API Reference

### Kbd

Use the `Kbd` component to display a keyboard key.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@kbd.Kbd() {
	Ctrl
}
```

### KbdGroup

Use the `kbd.Group` component to group `Kbd` components together.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@kbd.Group() {
	@kbd.Kbd() {
		Ctrl
	}
	@kbd.Kbd() {
		B
	}
}
```
