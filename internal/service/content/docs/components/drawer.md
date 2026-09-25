---
title: Drawer
description: A panel that slides in from the edge of the screen and can be swiped away.
---

<ComponentPreview styleName="base-rhea" name="drawer-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add drawer
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="drawer" title="components/drawer/drawer.templ" />

<ComponentSource name="drawer" title="components/drawer/drawer.js" />

<ComponentSource name="drawer" title="components/baseui/scroll_lock.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/drawer"
```

```templ showLineNumbers
@drawer.Drawer() {
	@button.Button(button.Props{Variant: button.VariantOutline, Attributes: drawer.Trigger(ctx)}) {
		Open
	}
	@drawer.Content() {
		@drawer.Header() {
			@drawer.Title() {
				Are you absolutely sure?
			}
			@drawer.Description() {
				This action cannot be undone.
			}
		}
		<div class="p-4">
			<!-- Content here -->
		</div>
		@drawer.Footer() {
			@button.Button() {
				Submit
			}
			@button.Button(button.Props{Variant: button.VariantOutline, Attributes: drawer.Close(ctx)}) {
				Cancel
			}
		}
	}
}
```

## Composition

Use the following composition to build a `Drawer`:

```text
drawer.Drawer
├── drawer.Trigger
└── drawer.Content
    ├── drawer.Header
    │   ├── drawer.Title
    │   └── drawer.Description
    └── drawer.Footer
```

`drawer.Content` composes the portal, overlay, viewport, and popup: the script portals the panel to `body`, the native dialog plays the viewport role, and a dedicated overlay element renders behind the panel. For lower-level control, `drawer.SwipeHandle` is also exported.

## Custom Sizes

A vertical drawer sizes itself to its content and is capped at `calc(100dvh - 6rem)` by default. A side drawer spans `75%` of the viewport width, or `24rem` on larger screens.

To customize the height of a vertical drawer, use the `h-*` and `max-h-*` utilities via `Class` on `drawer.Content`.

```templ
@drawer.Content(drawer.ContentProps{Class: "h-[50vh]"})
```

To customize the width of a side drawer, use the `w-*` and `max-w-*` utilities via `Class` on `drawer.Content`.

```templ
@drawer.Content(drawer.ContentProps{Class: "w-96"})
```

When the same component renders in multiple directions, scope an override to one axis using the `data-[swipe-axis=*]` variants.

```templ
@drawer.Content(drawer.ContentProps{Class: "data-[swipe-axis=y]:max-h-[50vh] data-[swipe-axis=x]:w-96"})
```

To make a region of the drawer scrollable, make the scroll container a flex item. Avoid `h-full`, which does not resolve inside a content-sized drawer.

```templ
@drawer.Content() {
	@drawer.Header() {
		...
	}
	<div class="flex-1 overflow-y-auto p-4">
		<!-- Scrollable content -->
	</div>
	@drawer.Footer() {
		...
	}
}
```

## Styling

The drawer exposes CSS variables for style-level customization. Set the sizing variables via `Class` on `drawer.Content`. Set the overlay variable on `[data-slot=drawer-overlay]` in your CSS.

| Variable                       | Default                | Description                                                             |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------- |
| `--drawer-inset`               | `0px`                  | Floats the drawer from the viewport edges.                              |
| `--drawer-bleed-background`    | `var(--color-popover)` | Fills the gap behind the drawer on swipe overshoot.                     |
| `--drawer-overlay-min-opacity` | `0`                    | Minimum overlay opacity. Defaults to `0.5` when snap points are active. |

The drawer also sets data attributes you can target with variants such as `data-[swipe-direction=down]:` on `drawer.Content`, or `group-data-[swipe-axis=y]/drawer-popup:` on its descendants.

| Attribute                 | Values                        | Set when                              |
| ------------------------- | ----------------------------- | ------------------------------------- |
| `data-swipe-direction`    | `up`, `right`, `down`, `left` | Always.                               |
| `data-swipe-axis`         | `x`, `y`                      | Always.                               |
| `data-snap-points`        | Present                       | The drawer has snap points.           |
| `data-expanded`           | Present                       | The drawer is at the full snap point. |
| `data-swiping`            | Present                       | A swipe is in progress.               |
| `data-nested-drawer-open` | Present                       | A nested drawer is open on top.       |

## Position

Use the `SwipeDirection` prop on `drawer.Drawer` to set the side of the drawer.

Available options are `SwipeDirectionUp`, `SwipeDirectionRight`, `SwipeDirectionDown`, and `SwipeDirectionLeft`. The default is `SwipeDirectionDown`.

<ComponentPreview styleName="base-rhea" name="drawer-sides" />

## Swipe Handle

Use `ShowSwipeHandle` on `drawer.Drawer` to render a swipe handle.

<ComponentPreview styleName="base-rhea" name="drawer-swipe-handle" />

## Nested

Open drawers from inside another drawer. Parent drawers stay mounted and stack behind the frontmost drawer.

<ComponentPreview styleName="base-rhea" name="drawer-nested" />

## Non Modal

Set `Modal: utils.Ptr(false)` to allow interaction with the rest of the page while the drawer is open. Combine with `DisablePointerDismissal` to prevent the drawer from closing on outside presses.

<ComponentPreview styleName="base-rhea" name="drawer-non-modal" />

## Snap Points

Use `SnapPoints` to snap a drawer to preset heights. Numbers between `0` and `1` represent fractions of the viewport. Numbers greater than `1` are treated as pixel values. String values support `px` and `rem` units. Snap points apply to vertical drawers.

Track and control the active snap point with `window.templ.drawer.getSnapPoint(id)` and `window.templ.drawer.setSnapPoint(id, value)`. At the full snap point, the drawer gets a `data-expanded` attribute you can style with the `data-expanded:` variant.

<ComponentPreview styleName="base-rhea" name="drawer-snap-points" />

## Responsive

You can combine the `Dialog` and `Drawer` components to create a responsive dialog. This renders a `Dialog` component on desktop and a `Drawer` on mobile.

<ComponentPreview styleName="base-rhea" name="drawer-dialog" />

## API Reference

### Drawer

The `drawer.Drawer` component is the root, it carries the id and options that link trigger and content.

| Prop                     | Type                                                     | Default         |
| ------------------------ | -------------------------------------------------------- | --------------- |
| `Open`                   | `bool`                                                   | `false`         |
| `DisablePointerDismissal`  | `bool`                                                   | `false`         |
| `Modal`                    | `*bool`                                                  | `true`          |
| `SwipeDirection`              | `SwipeDirectionDown \| SwipeDirectionUp \| SwipeDirectionLeft \| SwipeDirectionRight` | `SwipeDirectionDown` |
| `ShowSwipeHandle`        | `bool`                                                   | `false`         |
| `SnapPoints`             | `[]any`                                                  | -               |
| `SnapToSequentialPoints` | `bool`                                                   | `false`         |

### DrawerTrigger

`drawer.Trigger(ctx)` returns the attributes that turn any element into the drawer trigger, `drawer.TriggerFor(id)` targets a drawer outside the current root. `drawer.Close(ctx)` and `drawer.CloseFor(id)` close it.

### DrawerContent

The `drawer.Content` component is the sliding panel.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### DrawerSwipeHandle

The `drawer.SwipeHandle` component is the drag handle bar. `drawer.Content` renders it automatically when `ShowSwipeHandle` is set on the root.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### DrawerHeader

The `drawer.Header` component wraps the title and description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### DrawerFooter

The `drawer.Footer` component holds actions at the bottom.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### DrawerTitle

The `drawer.Title` component renders the accessible drawer title.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### DrawerDescription

The `drawer.Description` component renders the accessible drawer description.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
