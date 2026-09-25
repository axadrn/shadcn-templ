---
title: Sidebar
description: A composable, themeable and customizable sidebar component.
---

<ComponentPreview name="sidebar-demo" type="block" caption="A sidebar that collapses to icons." />

Sidebars are one of the most complex components to build. They are central
to any application and often contain a lot of moving parts.

We now have a solid foundation to build on top of. Composable. Themeable.
Customizable.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add sidebar
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="sidebar" title="components/sidebar/sidebar.templ" />

<ComponentSource name="sidebar" title="components/sidebar/sidebar.js" />

Component scripts are loaded through the shared script bundle, see [JavaScript](/docs/installation#javascript).

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```templ showLineNumbers title="layout.templ"
import "github.com/axadrn/shadcn-templ/v2/components/sidebar"

templ Layout() {
	@sidebar.Provider() {
		@AppSidebar()
		<main>
			@sidebar.Trigger()
			{ children... }
		</main>
	}
}
```

```templ showLineNumbers title="app_sidebar.templ"
templ AppSidebar() {
	@sidebar.Sidebar() {
		@sidebar.Header()
		@sidebar.Content() {
			@sidebar.Group()
			@sidebar.Group()
		}
		@sidebar.Footer()
	}
}
```

## Composition

Use the following composition to build a `Sidebar` layout:

```text
sidebar.Provider
├── sidebar.Sidebar
│   ├── sidebar.Header
│   ├── sidebar.Content
│   │   ├── sidebar.Group
│   │   │   ├── sidebar.GroupLabel
│   │   │   ├── sidebar.GroupAction
│   │   │   ├── sidebar.GroupContent
│   │   │   └── sidebar.Menu
│   │   │       ├── sidebar.MenuItem
│   │   │       │   ├── sidebar.MenuButton
│   │   │       │   ├── sidebar.MenuAction
│   │   │       │   └── sidebar.MenuBadge
│   │   │       └── sidebar.MenuItem
│   │   │           ├── sidebar.MenuButton
│   │   │           └── sidebar.MenuSub
│   │   │               ├── sidebar.MenuSubItem
│   │   │               └── sidebar.MenuSubItem
│   │   └── sidebar.Group
│   │       └── sidebar.Menu
│   │           ├── sidebar.MenuItem
│   │           └── sidebar.MenuItem
│   ├── sidebar.Footer
│   └── sidebar.Rail
├── sidebar.Inset
└── sidebar.Trigger
```

## Structure

- **sidebar.Provider** — Handles collapsible state and provides the sidebar context to child components.
- **sidebar.Sidebar** — The main collapsible sidebar panel.
- **sidebar.Header** — Sticky at the top; use for branding, titles, or workspace switchers.
- **sidebar.Footer** — Sticky at the bottom; use for user menus, settings, or actions.
- **sidebar.Content** — Scrollable region between the header and footer.
- **sidebar.Group** — Groups related navigation with optional label, action, and content areas.
- **sidebar.Menu** / **sidebar.MenuItem** — Menu structure for links, badges, actions, and nested submenus.
- **sidebar.Rail** — Resize handle for adjusting sidebar width when applicable.
- **sidebar.Inset** — Wraps main content when using the `inset` variant.
- **sidebar.Trigger** — Control that toggles the sidebar open or collapsed.

<img src="/assets/img/docs-sidebar-structure.png" width="716" height="420" alt="Sidebar Structure" class="mt-6 w-full overflow-hidden rounded-2xl border dark:hidden"/>
<img src="/assets/img/docs-sidebar-structure-dark.png" width="716" height="420" alt="Sidebar Structure" class="mt-6 hidden w-full overflow-hidden rounded-2xl border dark:block"/>

## SidebarProvider

The `sidebar.Provider` component provides the sidebar context to the `sidebar.Sidebar` component. You should always wrap your application in a `sidebar.Provider` component.

### Props

| Name        | Type   | Description                             |
| ----------- | ------ | --------------------------------------- |
| `DisableDefaultOpen` | `bool` | Default collapsed state of the sidebar. |

### Width

If you have a single sidebar in your application, you can use the `sidebarWidth` and `sidebarWidthMobile` constants in `sidebar.templ` to set the width of the sidebar.

```go showLineNumbers title="components/sidebar/sidebar.templ"
sidebarWidth       = "16rem"
sidebarWidthMobile = "18rem"
```

For multiple sidebars in your application, you can use the `--sidebar-width` and `--sidebar-width-mobile` CSS variables in the `style` attribute.

```templ showLineNumbers
@sidebar.Provider(sidebar.ProviderProps{
	Attributes: templ.Attributes{
		"style": "--sidebar-width: 20rem; --sidebar-width-mobile: 20rem;",
	},
}) {
	@sidebar.Sidebar()
}
```

### Keyboard Shortcut

To trigger the sidebar, you use the `cmd+b` keyboard shortcut on Mac and `ctrl+b` on Windows.

```js showLineNumbers title="components/sidebar/sidebar.js"
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
```

## Sidebar

The main `sidebar.Sidebar` component used to render a collapsible sidebar.

### Props

| Property      | Type                                                         | Description                       |
| ------------- | ------------------------------------------------------------ | --------------------------------- |
| `Side`        | `SideLeft` or `SideRight`                                    | The side of the sidebar.          |
| `Variant`     | `VariantSidebar`, `VariantFloating`, or `VariantInset`       | The variant of the sidebar.       |
| `Collapsible` | `CollapsibleOffcanvas`, `CollapsibleIcon`, or `CollapsibleNone` | Collapsible state of the sidebar. |

| Collapsible | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `offcanvas` | A collapsible sidebar that slides in from the left or right. |
| `icon`      | A sidebar that collapses to icons.                           |
| `none`      | A non-collapsible sidebar.                                   |

<Callout>
**Note:** If you use the `inset` variant, remember to wrap your main content
in a `sidebar.Inset` component.
</Callout>

```templ showLineNumbers
@sidebar.Provider() {
	@sidebar.Sidebar(sidebar.Props{Variant: sidebar.VariantInset})
	@sidebar.Inset() {
		<main>{ children... }</main>
	}
}
```

## useSidebar

The `window.templ.sidebar` API is the `useSidebar` pendant and is used to control the sidebar.

```js showLineNumbers
const {
	state,
	open,
	setOpen,
	openMobile,
	setOpenMobile,
	isMobile,
	onMobileChange,
	toggleSidebar,
} = window.templ.sidebar
```

Where a shadcn block writes `side={isMobile ? "bottom" : "right"}`, the templ block keeps the same ternary in a module script:

```html showLineNumbers
<script type="module">
	const menu = document.getElementById("nav-user-menu");
	window.templ.sidebar.onMobileChange((isMobile) => {
		if (!menu?.isConnected) return false; // swapped out: unsubscribe
		menu.setAttribute("data-templ-side", isMobile ? "bottom" : "right");
	});
</script>
```

| Property        | Type                        | Description                                   |
| --------------- | --------------------------- | --------------------------------------------- |
| `state`         | `"expanded" \| "collapsed"` | The current state of the sidebar.             |
| `open`          | `() => boolean`             | Whether the sidebar is open.                  |
| `setOpen`       | `(open: boolean) => void`   | Sets the open state of the sidebar.           |
| `openMobile`    | `() => boolean`             | Whether the sidebar is open on mobile.        |
| `setOpenMobile` | `(open: boolean) => void`   | Sets the open state of the sidebar on mobile. |
| `isMobile`      | `() => boolean`             | Whether the sidebar is on mobile.             |
| `onMobileChange` | `(fn: (isMobile: boolean) => void \| false) => void` | Calls `fn` now and whenever `isMobile` changes, the pendant of re-rendering on `useSidebar().isMobile`. Return `false` from `fn` to unsubscribe, e.g. once its element left the page. |
| `toggleSidebar` | `() => void`                | Toggles the sidebar. Desktop and mobile.      |

For multiple sidebars, every function optionally takes the sidebar ID as its last argument, e.g. `toggleSidebar("left-nav")`. Without an ID the first sidebar on the page is addressed.

## SidebarHeader

Use the `sidebar.Header` component to add a sticky header to the sidebar.

```templ showLineNumbers title="app_sidebar.templ"
@sidebar.Sidebar() {
	@sidebar.Header() {
		@sidebar.Menu() {
			@sidebar.MenuItem() {
				@dropdownmenu.DropdownMenu() {
					@sidebar.MenuButton(sidebar.MenuButtonProps{
						Attributes: dropdownmenu.Trigger(ctx),
					}) {
						Select Workspace
						@icon.ChevronDown(icon.Props{Class: "ml-auto"})
					}
					@dropdownmenu.Content() {
						@dropdownmenu.Item() {
							<span>Acme Inc</span>
						}
					}
				}
			}
		}
	}
}
```

## SidebarFooter

Use the `sidebar.Footer` component to add a sticky footer to the sidebar.

```templ showLineNumbers
@sidebar.Sidebar() {
	@sidebar.Footer() {
		@sidebar.Menu() {
			@sidebar.MenuItem() {
				@sidebar.MenuButton() {
					@icon.User() Username
				}
			}
		}
	}
}
```

## SidebarContent

The `sidebar.Content` component is used to wrap the content of the sidebar. This is where you add your `sidebar.Group` components. It is scrollable.

```templ showLineNumbers
@sidebar.Sidebar() {
	@sidebar.Content() {
		@sidebar.Group()
		@sidebar.Group()
	}
}
```

## SidebarGroup

Use the `sidebar.Group` component to create a section within the sidebar.

A `sidebar.Group` has a `sidebar.GroupLabel`, a `sidebar.GroupContent` and an optional `sidebar.GroupAction`.

```templ showLineNumbers
@sidebar.Group() {
	@sidebar.GroupLabel() {
		Application
	}
	@sidebar.GroupAction() {
		@icon.Plus()
		<span class="sr-only">Add Project</span>
	}
	@sidebar.GroupContent()
}
```

To make a `sidebar.Group` collapsible, wrap it in a `Collapsible`.

```templ showLineNumbers
@collapsible.Collapsible(collapsible.Props{Open: true, Class: "group/collapsible"}) {
	@sidebar.Group() {
		@sidebar.GroupLabel(sidebar.GroupLabelProps{
			Attributes: collapsible.Trigger(ctx),
		}) {
			Help
			@icon.ChevronDown(icon.Props{Class: "ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180"})
		}
		@collapsible.Content() {
			@sidebar.GroupContent()
		}
	}
}
```

## SidebarMenu

The `sidebar.Menu` component is used for building a menu within a `sidebar.Group`.

<img src="/assets/img/docs-sidebar-menu.png" width="716" height="420" alt="Sidebar Menu" class="mt-6 w-full overflow-hidden rounded-2xl border dark:hidden"/>
<img src="/assets/img/docs-sidebar-menu-dark.png" width="716" height="420" alt="Sidebar Menu" class="mt-6 hidden w-full overflow-hidden rounded-2xl border dark:block"/>

```templ showLineNumbers
@sidebar.Menu() {
	for _, project := range projects {
		@sidebar.MenuItem() {
			@sidebar.MenuButton(sidebar.MenuButtonProps{Href: project.URL}) {
				@project.Icon()
				<span>{ project.Name }</span>
			}
		}
	}
}
```

## SidebarMenuButton

The `sidebar.MenuButton` component is used to render a menu button within a `sidebar.MenuItem`.

By default, the `sidebar.MenuButton` renders a button. Set the `Href` prop to render an `a` tag instead.

Use the `IsActive` prop to mark a menu item as active.

```templ showLineNumbers
@sidebar.MenuButton(sidebar.MenuButtonProps{Href: "#", IsActive: true}) {
	Home
}
```

## SidebarMenuAction

The `sidebar.MenuAction` component is used to render a menu action within a `sidebar.MenuItem`.

```templ showLineNumbers
@sidebar.MenuItem() {
	@sidebar.MenuButton(sidebar.MenuButtonProps{Href: "#"}) {
		@icon.House()
		<span>Home</span>
	}
	@sidebar.MenuAction() {
		@icon.Plus()
		<span class="sr-only">Add Project</span>
	}
}
```

## SidebarMenuSub

The `sidebar.MenuSub` component is used to render a submenu within a `sidebar.Menu`.

```templ showLineNumbers
@sidebar.MenuItem() {
	@sidebar.MenuButton()
	@sidebar.MenuSub() {
		@sidebar.MenuSubItem() {
			@sidebar.MenuSubButton()
		}
	}
}
```

## SidebarMenuBadge

The `sidebar.MenuBadge` component is used to render a badge within a `sidebar.MenuItem`.

```templ showLineNumbers
@sidebar.MenuItem() {
	@sidebar.MenuButton()
	@sidebar.MenuBadge() {
		24
	}
}
```

## SidebarMenuSkeleton

The `sidebar.MenuSkeleton` component is used to render a skeleton for a `sidebar.Menu`.

```templ showLineNumbers
@sidebar.Menu() {
	for range 5 {
		@sidebar.MenuItem() {
			@sidebar.MenuSkeleton()
		}
	}
}
```

## SidebarTrigger

Use the `sidebar.Trigger` component to render a button that toggles the sidebar.

```templ showLineNumbers
<button onclick="window.templ.sidebar.toggleSidebar()">Toggle Sidebar</button>
```

## SidebarRail

The `sidebar.Rail` component is used to render a rail within a `sidebar.Sidebar`. This rail can be used to toggle the sidebar.

```templ showLineNumbers
@sidebar.Sidebar() {
	@sidebar.Header()
	@sidebar.Content() {
		@sidebar.Group()
	}
	@sidebar.Footer()
	@sidebar.Rail()
}
```

## Controlled Sidebar

Use the `DisableDefaultOpen` prop on `sidebar.Provider` to render the sidebar collapsed on the server. The `sidebar_state` cookie carries the last state, so the server can render the sidebar the way the user left it.

```templ showLineNumbers
@sidebar.Provider(sidebar.ProviderProps{DisableDefaultOpen: collapsedFromCookie})
```

```go showLineNumbers
collapsed := false
if c, err := r.Cookie("sidebar_state"); err == nil {
	collapsed = c.Value == "false"
}
```

## Theming

We use the following CSS variables to theme the sidebar.

```css
:root {
	--sidebar: oklch(0.985 0 0);
	--sidebar-foreground: oklch(0% 0 0);
	--sidebar-primary: oklch(0.205 0 0);
	--sidebar-primary-foreground: oklch(0.985 0 0);
	--sidebar-accent: oklch(0.97 0 0);
	--sidebar-accent-foreground: oklch(0.205 0 0);
	--sidebar-border: oklch(0.922 0 0);
	--sidebar-ring: oklch(0.708 0 0);
}

.dark {
	--sidebar: oklch(0.205 0 0);
	--sidebar-foreground: oklch(0.985 0 0);
	--sidebar-primary: oklch(0.488 0.243 264.376);
	--sidebar-primary-foreground: oklch(0.985 0 0);
	--sidebar-accent: oklch(0.269 0 0);
	--sidebar-accent-foreground: oklch(0.985 0 0);
	--sidebar-border: oklch(1 0 0 / 10%);
	--sidebar-ring: oklch(0.439 0 0);
}
```

## Styling

Here are some tips for styling the sidebar based on different states.

```templ
@sidebar.Sidebar(sidebar.Props{Collapsible: sidebar.CollapsibleIcon}) {
	@sidebar.Content() {
		@sidebar.Group(sidebar.GroupProps{Class: "group-data-[collapsible=icon]:hidden"})
	}
}
```

```templ
@sidebar.MenuItem() {
	@sidebar.MenuButton()
	@sidebar.MenuAction(sidebar.MenuActionProps{Class: "peer-data-[active=true]/menu-button:opacity-100"})
}
```
