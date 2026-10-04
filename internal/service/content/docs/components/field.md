---
title: Field
description: Combine labels, controls, and help text to compose accessible form fields and grouped inputs.
---

<ComponentPreview name="field-demo" previewClassName="h-[800px] p-6 md:h-[850px]" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add field
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="field" title="components/field/field.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/field"
```

```templ showLineNumbers
@field.Set() {
	@field.Legend() {
		Profile
	}
	@field.Description() {
		This appears on invoices and emails.
	}
	@field.Group() {
		@field.Field() {
			@field.Label(field.LabelProps{For: "name"}) {
				Full name
			}
			@input.Input(input.Props{ID: "name", Placeholder: "Axel Adrian"})
			@field.Description() {
				This appears on invoices and emails.
			}
		}
		@field.Field() {
			@field.Label(field.LabelProps{For: "username"}) {
				Username
			}
			@input.Input(input.Props{ID: "username", Attributes: templ.Attributes{"aria-invalid": "true"}})
			@field.Error() {
				Choose another username.
			}
		}
		@field.Field(field.Props{Orientation: field.OrientationHorizontal}) {
			@switchcomp.Switch(switchcomp.Props{ID: "newsletter"})
			@field.Label(field.LabelProps{For: "newsletter"}) {
				Subscribe to the newsletter
			}
		}
	}
}
```

## Composition

### Field

A single control with label, helper text, and validation.

```text
field.Field
├── field.Label
├── input.Input / textarea.Textarea / switchcomp.Switch / select.Select
├── field.Description
└── field.Error
```

### FieldGroup

Related fields in one group. Use `field.Separator` between sections when needed.

```text
field.Group
├── field.Field
│   ├── field.Label
│   ├── input.Input / textarea.Textarea / switchcomp.Switch / select.Select
│   ├── field.Description
│   └── field.Error
├── field.Separator
└── field.Field
    ├── field.Label
    └── input.Input / textarea.Textarea / switchcomp.Switch / select.Select
```

### FieldSet

Semantic grouping with a legend and description, usually containing a `field.Group`.

```text
field.Set
├── field.Legend
├── field.Description
└── field.Group
    ├── field.Field
    │   ├── field.Label
    │   ├── input.Input / textarea.Textarea / switchcomp.Switch / select.Select
    │   ├── field.Description
    │   └── field.Error
    └── field.Field
        ├── field.Label
        └── input.Input / textarea.Textarea / switchcomp.Switch / select.Select
```

## Anatomy

The `Field` family is designed for composing accessible forms. A typical field is structured as follows:

```templ showLineNumbers
@field.Field() {
	@field.Label(field.LabelProps{For: "input-id"}) {
		Label
	}
	// Input, Select, Switch, etc.
	@field.Description() {
		Optional helper text.
	}
	@field.Error() {
		Validation message.
	}
}
```

- `Field` is the core wrapper for a single field.
- `field.Content` is a flex column that groups label and description. Not required if you have no description.
- Wrap related fields with `field.Group`, and use `field.Set` with `field.Legend` for semantic grouping.

## Form

Fields compose with plain HTML forms, the controls submit their native values.

## Input

<ComponentPreview name="field-input" />

## Textarea

<ComponentPreview name="field-textarea" />

## Select

<ComponentPreview name="field-select" />

## Slider

<ComponentPreview name="field-slider" />

## Fieldset

<ComponentPreview name="field-fieldset" />

## Checkbox

<ComponentPreview name="field-checkbox" previewClassName="h-[32rem]" />

## Radio

<ComponentPreview name="field-radio" />

## Switch

<ComponentPreview name="field-switch" />

## Choice Card

Wrap `field.Field` components inside `field.Label` to create selectable field groups. This works with `radio.Radio`, `checkbox.Checkbox` and `switchcomp.Switch` components.

<ComponentPreview name="field-choice-card" />

## Field Group

Stack `field.Field` components with `field.Group`. Add `field.Separator` to divide them.

<ComponentPreview name="field-group" previewClassName="h-96" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="field-rtl" direction="rtl" previewClassName="h-auto p-6" />

## Responsive Layout

- **Vertical fields:** Default orientation stacks label, control, and helper text—ideal for mobile-first layouts.
- **Horizontal fields:** Set `Orientation: field.OrientationHorizontal` on `field.Field` to align the label and control side-by-side. Pair with `field.Content` to keep descriptions aligned.
- **Responsive fields:** Set `Orientation: field.OrientationResponsive` for automatic column layouts inside container-aware parents. Apply `@container/field-group` classes on `field.Group` to switch orientations at specific breakpoints.

<ComponentPreview name="field-responsive" previewClassName="h-[650px] p-6 md:h-[500px] md:p-10" />

## Validation and Errors

- Add `data-invalid` to `field.Field` to switch the entire block into an error state.
- Add `aria-invalid` on the input itself for assistive technologies.
- Render `field.Error` immediately after the control or inside `field.Content` to keep error messages aligned with the field.

```templ showLineNumbers /data-invalid/
@field.Field(field.Props{Attributes: templ.Attributes{"data-invalid": "true"}}) {
	@field.Label(field.LabelProps{For: "email"}) {
		Email
	}
	@input.Input(input.Props{ID: "email", Type: "email", Attributes: templ.Attributes{"aria-invalid": "true"}})
	@field.Error() {
		Enter a valid email address.
	}
}
```

## Accessibility

- `field.Set` and `field.Legend` keep related controls grouped for keyboard and assistive tech users.
- `Field` outputs `role="group"` so nested controls inherit labeling from `field.Label` and `field.Legend` when combined.
- Apply `field.Separator` sparingly to ensure screen readers encounter clear section boundaries.

## API Reference

### FieldSet

Container that renders a semantic `fieldset` with spacing presets.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@field.Set() {
	@field.Legend() {
		Delivery
	}
	@field.Group() {
		// Fields
	}
}
```

### FieldLegend

Legend element for a `field.Set`. Switch to the `label` variant to align with label sizing.

| Prop      | Type                                        | Default               |
| --------- | ------------------------------------------- | --------------------- |
| `Variant` | `LegendVariantLegend \| LegendVariantLabel` | `LegendVariantLegend` |
| `Class`   | `string`                                    | -                     |

```templ
@field.Legend(field.LegendProps{Variant: field.LegendVariantLabel}) {
	Notification Preferences
}
```

The `field.Legend` has two variants: `legend` and `label`. The `label` variant applies label sizing and alignment. Handy if you have nested `field.Set`.

### FieldGroup

Layout wrapper that stacks `field.Field` components and enables container queries for responsive orientations.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@field.Group(field.GroupProps{Class: "@container/field-group flex flex-col gap-6"}) {
	@field.Field() {
		// ...
	}
	@field.Field() {
		// ...
	}
}
```

### Field

The core wrapper for a single field. Provides orientation control and spacing; mark states with `data-invalid` / `data-disabled` attributes.

| Prop          | Type                                                                     | Default               |
| ------------- | ------------------------------------------------------------------------ | --------------------- |
| `Orientation` | `OrientationVertical \| OrientationHorizontal \| OrientationResponsive` | `OrientationVertical` |
| `Class`       | `string`                                                                 | -                     |

```templ
@field.Field(field.Props{Orientation: field.OrientationHorizontal}) {
	@field.Label(field.LabelProps{For: "remember"}) {
		Remember me
	}
	@switchcomp.Switch(switchcomp.Props{ID: "remember"})
}
```

### FieldContent

Flex column that groups control and descriptions when the label sits beside the control. Not required if you have no description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@field.Field() {
	@checkbox.Checkbox(checkbox.Props{ID: "notifications"})
	@field.Content() {
		@field.Label(field.LabelProps{For: "notifications"}) {
			Notifications
		}
		@field.Description() {
			Email, SMS, and push options.
		}
	}
}
```

### FieldLabel

Label styled for both direct inputs and nested `field.Field` children.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `For`   | `string` | -       |
| `Class` | `string` | -       |

```templ
@field.Label(field.LabelProps{For: "email"}) {
	Email
}
```

### FieldTitle

Renders a title with label styling inside `field.Content`.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@field.Content() {
	@field.Title() {
		Enable Touch ID
	}
	@field.Description() {
		Unlock your device faster.
	}
}
```

### FieldDescription

Helper text slot that automatically balances long lines in horizontal layouts.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@field.Description() {
	We never share your email with anyone.
}
```

### FieldSeparator

Visual divider to separate sections inside a `field.Group`. Accepts optional inline content.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@field.Separator() {
	Or continue with
}
```

### FieldError

Accessible error container for validation messages.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

```templ
@field.Error() {
	Choose another username.
}
```
