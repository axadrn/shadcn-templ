---
title: Command
description: Command menu for search and quick actions.
---

<ComponentPreview name="command-demo" align="start" previewClassName="h-[24.5rem]" />

## About

The `Command` component is a native templ and vanilla JavaScript port of the [`cmdk`](https://github.com/pacocoursey/cmdk) component, no external dependencies.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add command
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="command" title="components/command/command.templ" />

<ComponentSource name="command" title="components/command/command.js" />

<ComponentSource name="command" title="components/baseui/lifecycle.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/command"
```

```templ showLineNumbers
@command.Command(command.Props{Class: "max-w-sm rounded-lg border"}) {
	@command.Input(command.InputProps{Placeholder: "Type a command or search..."})
	@command.List() {
		@command.Empty() {
			No results found.
		}
		@command.Group(command.GroupProps{Heading: "Suggestions"}) {
			@command.Item() {
				Calendar
			}
			@command.Item() {
				Search Emoji
			}
			@command.Item() {
				Calculator
			}
		}
		@command.Separator()
		@command.Group(command.GroupProps{Heading: "Settings"}) {
			@command.Item() {
				Profile
			}
			@command.Item() {
				Billing
			}
			@command.Item() {
				Settings
			}
		}
	}
}
```

## Composition

Use the following composition to build a `Command`:

```text
command.Command
├── command.Input
└── command.List
    ├── command.Empty
    ├── command.Group
    │   ├── command.Item
    │   └── command.Item
    ├── command.Separator
    └── command.Group
        ├── command.Item
        └── command.Item
```

## Basic

A simple command menu in a dialog.

<ComponentPreview name="command-basic" />

## Shortcuts

<ComponentPreview name="command-shortcuts" />

## Groups

A command menu with groups, icons and separators.

<ComponentPreview name="command-groups" />

## Scrollable

Scrollable command menu with multiple items.

<ComponentPreview name="command-scrollable" />

## API Reference

### Command

The `Command` component is the root that manages filtering and selection.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `ID`    | `string` | -       |
| `Label` | `string` | -       |
| `Class` | `string` | -       |

### Dialog

The `command.Dialog` component renders the command menu in a dialog. Open it
from any element via `dialog.TriggerFor(id)`.

| Prop              | Type     | Default                            |
| ----------------- | -------- | ---------------------------------- |
| `ID`              | `string` | -                                  |
| `Title`           | `string` | `"Command Palette"`                |
| `Description`     | `string` | `"Search for a command to run..."` |
| `ShowCloseButton` | `bool`   | `false`                            |
| `Class`           | `string` | -                                  |

### Input

The `command.Input` component is the search input that filters the list.

| Prop          | Type     | Default |
| ------------- | -------- | ------- |
| `Placeholder` | `string` | -       |
| `Disabled`    | `bool`   | `false` |
| `Class`       | `string` | -       |

### List

The `command.List` component holds the filterable items.

| Prop    | Type     | Default         |
| ------- | -------- | --------------- |
| `Label` | `string` | `"Suggestions"` |
| `Class` | `string` | -               |

### Empty

The `command.Empty` component shows while no item matches the search.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Group

The `command.Group` component wraps related items.

| Prop      | Type     | Default |
| --------- | -------- | ------- |
| `Heading` | `string` | -       |
| `Class`   | `string` | -       |

### Item

The `command.Item` component is a selectable command.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Value`    | `string` | -       |
| `Disabled` | `bool`   | `false` |
| `Class`    | `string` | -       |

### Shortcut

The `command.Shortcut` component displays a keyboard shortcut on an item.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Separator

The `command.Separator` component divides groups. It hides while searching
unless `AlwaysRender` is set, exactly like cmdk.

| Prop           | Type     | Default |
| -------------- | -------- | ------- |
| `AlwaysRender` | `bool`   | `false` |
| `Class`        | `string` | -       |
