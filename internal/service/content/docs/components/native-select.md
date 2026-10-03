---
title: Native Select
description: A styled native HTML select element with consistent design system integration.
---

<ComponentPreview name="native-select-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add native-select
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="native-select" title="components/nativeselect/nativeselect.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/nativeselect"
```

```templ showLineNumbers
@nativeselect.NativeSelect() {
	@nativeselect.Option(nativeselect.OptionProps{Value: ""}) {
		Select a fruit
	}
	@nativeselect.Option(nativeselect.OptionProps{Value: "apple"}) {
		Apple
	}
	@nativeselect.Option(nativeselect.OptionProps{Value: "banana"}) {
		Banana
	}
}
```

## Composition

### Simple

Options placed directly under `NativeSelect` (no `OptGroup`).

```text
nativeselect.NativeSelect
├── nativeselect.Option
├── nativeselect.Option
└── nativeselect.Option
```

### With groups

Use `OptGroup` to organize options into categories.

```text
nativeselect.NativeSelect
├── nativeselect.OptGroup
│   ├── nativeselect.Option
│   └── nativeselect.Option
└── nativeselect.OptGroup
    ├── nativeselect.Option
    └── nativeselect.Option
```

## Groups

Use `OptGroup` to organize options into categories.

<ComponentPreview name="native-select-groups" />

## Disabled

Set `Disabled` on `NativeSelect` to disable the select.

<ComponentPreview name="native-select-disabled" />

## Invalid

Use `aria-invalid` to show validation errors and the `data-invalid` attribute on the `Field` component for styling.

<ComponentPreview name="native-select-invalid" />

## Native Select vs Select

- Use `NativeSelect` for native browser behavior, better performance, or mobile-optimized dropdowns.
- Use `Select` for custom styling, animations, or complex interactions.

## API Reference

### NativeSelect

The main select component that wraps the native HTML select element. `Class` styles the wrapper, `ID` and `Attributes` land on the select.

| Prop         | Type                     | Default       |
| ------------ | ------------------------ | ------------- |
| `Size`       | `SizeSm \| SizeDefault`  | `SizeDefault` |
| `Name`       | `string`                 | -             |
| `Disabled`   | `bool`                   | `false`       |
| `Required`   | `bool`                   | `false`       |
| `ID`         | `string`                 | -             |
| `Class`      | `string`                 | -             |
| `Attributes` | `templ.Attributes`       | -             |

### Option

Represents an individual option within the select.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Value`    | `string` | -       |
| `Disabled` | `bool`   | `false` |
| `Selected` | `bool`   | `false` |

### OptGroup

Groups related options together for better organization.

| Prop       | Type     | Default |
| ---------- | -------- | ------- |
| `Label`    | `string` | -       |
| `Disabled` | `bool`   | `false` |
