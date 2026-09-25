---
title: Progress
description: Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.
---

<ComponentPreview name="progress-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add progress
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="progress" title="components/progress/progress.templ" />

<ComponentSource name="progress" title="components/progress/progress.js" />

<ComponentSource name="progress" title="components/baseui/lifecycle.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/progress"
```

```templ showLineNumbers
@progress.Progress(progress.Props{Value: 33})
```

## Composition

### With label and value

Use `progress.Label` and `progress.Value` to add a label and value display.

```templ showLineNumbers
@progress.Progress(progress.Props{Value: 56, Class: "w-full max-w-sm"}) {
	@progress.Label() {
		Upload progress
	}
	@progress.Value()
}
```

```text
progress.Progress
├── progress.Label
├── progress.Value
└── ProgressTrack
    └── ProgressIndicator
```

## Label

Use `progress.Label` and `progress.Value` to add a label and value display.

<ComponentPreview name="progress-label" />

## Controlled

A progress bar that can be controlled by a slider.

<ComponentPreview name="progress-controlled" />

## API Reference

### Progress

The `Progress` component renders the bar and exposes its state on `aria-valuenow`, updating the attribute moves the indicator.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Value` | `int`    | `0`     |
| `Max`   | `int`    | `100`   |
| `Class` | `string` | -       |

### ProgressLabel

The `progress.Label` component displays a label above the bar.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### ProgressValue

The `progress.Value` component displays the current value as a percentage.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
