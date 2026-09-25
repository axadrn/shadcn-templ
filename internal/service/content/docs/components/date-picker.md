---
title: Date Picker
description: A date picker component with range and presets.
---

<ComponentPreview name="date-picker-demo" />

## Installation

The Date Picker is built using a composition of the `Popover` and the `Calendar` components.

See installation instructions for the [Popover](/docs/components/popover#installation) and the [Calendar](/docs/components/calendar#installation) components.

## Usage

```templ showLineNumbers title="components/example_date_picker.templ"
@popover.Popover(popover.Props{ID: "date-picker"}) {
	{{
		triggerAttrs := popover.Trigger(ctx)
		triggerAttrs["data-empty"] = "true"
		triggerAttrs["data-templ-datepicker-display"] = ""
	}}
	@button.Button(button.Props{
		Variant:    button.VariantOutline,
		Class:      "w-[212px] justify-between text-left font-normal data-[empty=true]:text-muted-foreground",
		Attributes: triggerAttrs,
	}) {
		<span>Pick a date</span>
		<span data-icon="inline-end" class="contents">
			@icon.ChevronDown()
		</span>
	}
	@popover.Content(popover.ContentProps{
		Class: "w-auto p-0",
		Side:  popover.SideBottom,
		Align: popover.AlignStart,
	}) {
		@calendar.Calendar()
	}
}
```

Listen for the calendar's `calendar-change` event to show the selected date in the trigger, see the demo above for the full wiring.

## Composition

A date picker is built from `Popover` and `Calendar` (there is no DatePicker root component):

```text
popover.Popover
├── popover.Trigger
└── popover.Content
    └── calendar.Calendar
```

## Basic

A basic date picker component.

<ComponentPreview name="date-picker-basic" />

## Range Picker

A date picker component for selecting a range of dates.

<ComponentPreview name="date-picker-range" />

## Date of Birth

A date picker component for selecting a date of birth. This component includes a dropdown caption layout for date and month selection.

<ComponentPreview name="date-picker-dob" />

## Input

A date picker component with an input field for selecting a date.

<ComponentPreview name="date-picker-input" />

## Time Picker

A date picker component with a time input field for selecting a time.

<ComponentPreview name="date-picker-time" />
