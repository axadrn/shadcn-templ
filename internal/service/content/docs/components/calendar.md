---
title: Calendar
description: A calendar component that allows users to select a date or a range of dates.
---

<ComponentPreview name="calendar-demo" previewClassName="h-96" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add calendar
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="calendar" title="components/calendar/calendar.templ" />

<ComponentSource name="calendar" title="components/calendar/calendar.js" />

<ComponentSource name="calendar" title="components/baseui/lifecycle.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import (
	"time"

	"github.com/axadrn/shadcn-templ/v2/components/calendar"
)
```

```templ showLineNumbers
@calendar.Calendar(calendar.Props{
	Mode:     calendar.ModeSingle,
	Selected: time.Now(),
	Class:    "rounded-lg border",
})
```

## About

The `Calendar` component is a native templ and vanilla JavaScript implementation with no external dependencies.

## Date Picker

You can use the `Calendar` component to build a date picker. See the [Date Picker](/docs/components/date-picker) page for more information.

## Basic

A basic calendar component. We used `Class: "rounded-lg border"` to style the calendar.

<ComponentPreview name="calendar-basic" previewClassName="h-96" />

## Range Calendar

Use the `Mode: calendar.ModeRange` prop to enable range selection.

<ComponentPreview name="calendar-range" previewClassName="h-[36rem] md:h-96" />

## Month and Year Selector

Use `CaptionLayout: calendar.CaptionLayoutDropdown` to show month and year dropdowns.

<ComponentPreview name="calendar-caption" previewClassName="h-96" />

## Presets

<ComponentPreview name="calendar-presets" previewClassName="h-[650px]" />

## Date and Time Picker

<ComponentPreview name="calendar-time" previewClassName="h-[600px]" />

## Booked dates

<ComponentPreview name="calendar-booked-dates" previewClassName="h-96" />

## Custom Cell Size

<ComponentPreview name="calendar-custom-days"  />

You can customize the size of calendar cells using the `--cell-size` CSS variable. You can also make it responsive by using breakpoint-specific values:

```templ showLineNumbers
@calendar.Calendar(calendar.Props{
	Class: "rounded-lg border [--cell-size:--spacing(11)] md:[--cell-size:--spacing(12)]",
})
```

Or use fixed values:

```templ showLineNumbers
@calendar.Calendar(calendar.Props{
	Class: "rounded-lg border [--cell-size:2.75rem] md:[--cell-size:3rem]",
})
```

## Week Numbers

Use `ShowWeekNumber` to show week numbers.

<ComponentPreview name="calendar-week-numbers" previewClassName="h-96" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="calendar-rtl" direction="rtl" previewClassName="h-96" />

When using RTL, pass both the `Locale` and `Dir` props to the Calendar component:

```templ showLineNumbers
@calendar.Calendar(calendar.Props{
	Mode:     calendar.ModeSingle,
	Selected: date,
	Locale:   "ar-SA",
	Dir:      "rtl",
})
```

## API Reference

### Calendar

The `Calendar` component displays a month grid for selecting a date or a range of dates.

| Prop                  | Type                                                                 | Default              |
| --------------------- | -------------------------------------------------------------------- | -------------------- |
| `Mode`                | `ModeSingle \| ModeMultiple \| ModeRange`                            | -                    |
| `Selected`            | `time.Time`, `[]time.Time` or `DateRange`                            | -                    |
| `DefaultMonth`        | `time.Time`                                                          | today                |
| `Month`               | `time.Time` (controlled, see `calendar-month-change`)                | -                    |
| `CaptionLayout`       | `CaptionLayoutLabel \| CaptionLayoutDropdown` and the `-months`/`-years` variants | `CaptionLayoutLabel` |
| `NumberOfMonths`      | `int`                                                                | `1`                  |
| `ShowOutsideDays`     | `*bool`                                                              | `true`               |
| `FixedWeeks`          | `bool`                                                               | `false`              |
| `ShowWeekNumber`      | `bool`                                                               | `false`              |
| `Disabled`            | a matcher or `[]any` of them: `time.Time`, `[]time.Time`, `DateRange`, `DateBefore`, `DateAfter`, `DateInterval`, `DayOfWeek` | - |
| `Modifiers`           | `map[string]any` of matchers                                         | -                    |
| `ModifiersClassNames` | `map[string]string`                                                  | -                    |
| `StartMonth`          | `time.Time`                                                          | -                    |
| `EndMonth`            | `time.Time`                                                          | -                    |
| `WeekStartsOn`        | `Day`                                                                | the locale's         |
| `Required`            | `*bool`                                                              | -                    |
| `Locale`              | `string` (BCP 47, e.g. "de-DE")                                      | en-US                |
| `Dir`                 | `string`                                                             | -                    |
| `ButtonVariant`       | `button.Variant`                                                     | `VariantGhost`       |
| `Class`               | `string`                                                             | -                    |

### Events and API

The calendar keeps its selection and dispatches `calendar-select` (`detail.selected`, `detail.triggerDate`), react-day-picker's `onSelect`. A navigation dispatches `calendar-month-change` (`detail.month`); with `Month` set the calendar moves only when the page calls `window.templ.calendar.setMonth(calendar, month)`. `window.templ.calendar.setSelected(calendar, selected)` sets the selection, `window.templ.calendar.update(calendar, { formatters, components })` takes react-day-picker's `formatMonthDropdown` formatter and a `DayButton(button, { day, modifiers })` component.
