---
title: Input OTP
description: Accessible one-time password component with copy paste functionality.
---

<ComponentPreview name="input-otp-demo" />

## About

The `InputOTP` component is a native templ and vanilla JavaScript implementation with no external dependencies.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add input-otp
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="input-otp" title="components/inputotp/inputotp.templ" />

<ComponentSource name="input-otp" title="components/inputotp/inputotp.js" />

<ComponentSource name="input-otp" title="components/baseui/lifecycle.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/inputotp"
```

```templ showLineNumbers
@inputotp.InputOTP() {
	@inputotp.Group() {
		@inputotp.Slot(inputotp.SlotProps{Index: 0})
		@inputotp.Slot(inputotp.SlotProps{Index: 1})
		@inputotp.Slot(inputotp.SlotProps{Index: 2})
	}
	@inputotp.Separator()
	@inputotp.Group() {
		@inputotp.Slot(inputotp.SlotProps{Index: 3})
		@inputotp.Slot(inputotp.SlotProps{Index: 4})
		@inputotp.Slot(inputotp.SlotProps{Index: 5})
	}
}
```

## Composition

Use the following composition to build an `InputOTP`:

```text
inputotp.InputOTP
├── inputotp.Group
│   ├── inputotp.Slot
│   ├── inputotp.Slot
│   └── inputotp.Slot
├── inputotp.Separator
├── inputotp.Group
│   ├── inputotp.Slot
│   ├── inputotp.Slot
│   └── inputotp.Slot
├── inputotp.Separator
└── inputotp.Group
    ├── inputotp.Slot
    └── inputotp.Slot
```

## Pattern

Use the `Pattern` prop to define a custom pattern for the OTP input.

```templ showLineNumbers {2}
@inputotp.InputOTP(inputotp.Props{
	Pattern: inputotp.RegexpOnlyDigitsAndChars,
}) {
	// ...
}
```

<ComponentPreview name="input-otp-pattern" />

## Separator

Use the `inputotp.Separator` component to add a separator between input groups.

<ComponentPreview name="input-otp-separator" />

## Disabled

Use the `Disabled` prop to disable the input.

<ComponentPreview name="input-otp-disabled" />

## Controlled

Use the `Value` prop and the hidden input's `change` event to control the input value.

<ComponentPreview name="input-otp-controlled" />

## Invalid

Use `aria-invalid` on the slots to show an error state.

<ComponentPreview name="input-otp-invalid" />

## Four Digits

A common pattern for PIN codes. This uses the `Pattern: inputotp.RegexpOnlyDigits` prop.

<ComponentPreview name="input-otp-four-digits" />

## Alphanumeric

Use `inputotp.RegexpOnlyDigitsAndChars` to accept both letters and numbers.

<ComponentPreview name="input-otp-alphanumeric" />

## Form

<ComponentPreview name="input-otp-form" previewClassName="h-[30rem]" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="input-otp-rtl" direction="rtl" />

## API Reference

### InputOTP

The `InputOTP` component is the root that manages the slots. The real input receives `ID`, `Class`, `Attributes` and the input props, so a form field name goes in `Attributes`, e.g. `Attributes: templ.Attributes{"name": "code"}`, and the server reads the combined value from it.

| Prop           | Type               | Default |
| -------------- | ------------------ | ------- |
| `ID`           | `string`           | -       |
| `Class`        | `string`           | -       |
| `Attributes`   | `templ.Attributes` | -       |
| `Value`        | `*string`          | -       |
| `DefaultValue` | `string`           | -       |
| `MaxLength`    | `int`              | -       |
| `Pattern`      | `string`           | -       |
| `Disabled`     | `bool`             | `false` |
| `Required`     | `bool`             | `false` |

### Group

The `inputotp.Group` component groups adjacent slots.

| Prop         | Type               | Default |
| ------------ | ------------------ | ------- |
| `ID`         | `string`           | -       |
| `Class`      | `string`           | -       |
| `Attributes` | `templ.Attributes` | -       |

### Slot

The `inputotp.Slot` component is a single character cell.

| Prop         | Type               | Default |
| ------------ | ------------------ | ------- |
| `Index`      | `int`              | -       |
| `ID`         | `string`           | -       |
| `Class`      | `string`           | -       |
| `Attributes` | `templ.Attributes` | -       |

### Separator

The `inputotp.Separator` component divides slot groups.

| Prop         | Type               | Default |
| ------------ | ------------------ | ------- |
| `ID`         | `string`           | -       |
| `Class`      | `string`           | -       |
| `Attributes` | `templ.Attributes` | -       |
