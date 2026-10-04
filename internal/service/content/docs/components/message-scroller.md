---
title: Message Scroller
description: A chat scroll container that anchors turns, opens saved transcripts, follows streamed responses, loads history without jumping, and jumps to any message.
---

<ComponentPreview styleName="base-rhea" name="message-scroller-demo" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" />

## What Makes a Great Streaming Chat Experience

Building a chat interface used to be simple. You create an inverted list with
an input. Type a message, it appends at the bottom. When a reply comes in, the
list grows and scrolls. Done.

Streaming breaks that model. Messages arrive in chunks while you may still be
reading, scrolling, or looking somewhere else entirely.

Now the challenge is preserving the reader's place while the conversation keeps
changing. Get that wrong and the experience feels jumpy: people are pulled to
the bottom, lose context, and have to find their way back.

In practice, this comes down to scroll: when to follow, when to hold, and when
to let the reader decide. A great streaming chat should:

1. **Move only when the reader asked to move.** If someone is reading, don’t pull them somewhere else. Auto-scroll should never be the default.
2. **Follow only while they’re following.** If they’re at the live edge, keep the stream in view. If they scroll away, leave them there.
3. **Every interaction is a signal.** Scrolling is not the only one. Selecting text, using the keyboard, opening a link, or searching should all stop the interface from moving.
4. **Start a new turn near the top of the viewport.** This gives the new turn somewhere it can be read from the beginning.
5. **Then stream in the answer.** The answer should grow into the screen, not immediately push everything away.
6. **Keep part of the previous conversation in context.** The prompt and reply should stay visually connected, and enough of the previous turn should remain visible so the reader knows where they are.
7. **Let new content arrive offscreen.** The conversation can keep streaming without changing what the reader is looking at.
8. **Show what’s happening out of view.** Make it clear when a response is still streaming or when new messages have arrived.
9. **Make it easy to return to the latest reply.** A “Jump to latest” action should bring the reader back and resume following.
10. **Let people jump anywhere in the conversation.** Long threads need message links, search, unread markers, and direct navigation.
11. **Reopen where the reader left off.** A saved conversation should open at the last meaningful turn. Often this is the last user message. Not the absolute bottom.
12. **Keep the reader’s place when layout changes.** Images load. Markdown expands. Code blocks render. Older messages appear above. None of that should make the reader lose their place.
13. **Handle interruptions without stealing position.** Stopping, retrying, regenerating, branching, or errors should not unexpectedly move the conversation.
14. **Stay responsive in long threads.** Streaming text, markdown, code, images, and long history should still feel responsive.
15. **Be accessible without the noise.** Keep the transcript navigable, preserve keyboard focus, and announce important events at a comfortable pace.

**Never move the reader against their intent.**

## MessageScroller

MessageScroller is a chat transcript scroller built for these behaviors.
`messagescroller.Provider` owns the scroll state and transcript-row behavior:
opening position, streamed output, new-turn anchoring, prepended history,
visibility, and scroll controls. `messagescroller.MessageScroller` is the styled
frame that renders inside it.

MessageScroller is scoped to the scroll viewport. It does not own messages, AI state,
transport, persistence, branching, or model state. Your product code stays
focused on composing messages, markers, tools, attachments, and prompt inputs.

It gives you the scroll behavior that chat needs, without taking over the rest
of the chat UI. And it stays fast, even in long conversations with rich
markdown.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add message-scroller
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="message-scroller" title="components/messagescroller/messagescroller.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import (
	"github.com/axadrn/shadcn-templ/v2/components/message"
	"github.com/axadrn/shadcn-templ/v2/components/messagescroller"
)
```

```templ showLineNumbers
@messagescroller.Provider() {
	@messagescroller.MessageScroller() {
		@messagescroller.Viewport() {
			@messagescroller.Content() {
				for _, m := range messages {
					@messagescroller.Item(messagescroller.ItemProps{MessageID: m.ID, ScrollAnchor: m.Role == "user"}) {
						@message.Message()
					}
				}
			}
		}
		@messagescroller.Button()
	}
}
```

`messagescroller.MessageScroller` fills its parent, so place it inside a
height-constrained container.

```templ showLineNumbers
<div class="flex h-screen flex-col">
	@messagescroller.Provider() {
		@messagescroller.MessageScroller(messagescroller.Props{Class: "flex-1"}) {
			// transcript
		}
	}
</div>
```

## Composition

```text
messagescroller.Provider
└── messagescroller.MessageScroller
    ├── messagescroller.Viewport
    │   └── messagescroller.Content
    │       ├── messagescroller.Item
    │       ├── messagescroller.Item
    │       └── messagescroller.Item
    └── messagescroller.Button
```

- **`messagescroller.Provider`** — the headless root. Owns scroll state and the
  behavior props for opening position, auto-scroll, anchoring, scroll commands,
  and visibility tracking. It renders no element.
- **`messagescroller.MessageScroller`** — the styled frame. Lays out the viewport,
  content, and controls inside the provider.
- **`messagescroller.Viewport`** — the scrollable element. Receives native scroll
  events and preserves the visible row when older messages are prepended.
- **`messagescroller.Content`** — the transcript container. Holds the rows and
  provides the live-region defaults for new messages.
- **`messagescroller.Item`** — the transcript row boundary. Wrap every direct
  child of the content so the scroller can measure, anchor, preserve position,
  track visibility, and jump to it. An item can be a message, marker, typing
  indicator, separator, join/leave event, or "load earlier" row.
- **`messagescroller.Button`** — the scroll control. Scrolls to the start or end
  of the transcript and is inert until there is content in its direction.

## Core Concepts

### Anchoring Turns

A turn is the part of the conversation that starts a new exchange. In a simple
AI chat, that is usually the user's message and the assistant reply that follows.

An anchor is the row the viewport should treat as the start of that turn. Mark
that row with `ScrollAnchor`. When a new anchor is appended, the viewport moves
it near the top and keeps a peek of the previous item above it, so the new turn
does not feel detached from its context.

```templ showLineNumbers
// This tells the scroller to anchor the user's message for the next turn.
@messagescroller.Item(messagescroller.ItemProps{MessageID: m.ID, ScrollAnchor: m.Role == "user"})
```

Scroll anchors are not tied to message role. You can turn any row into an anchor:
a user message, a system marker, a handoff event, or anything else that starts a
meaningful turn. `MessageScroller` only needs to know which row should anchor the
viewport.

In the following example, the user's message is anchored. When you send a new message, the viewport anchors it near the top and appends the assistant reply below it. Toggle the anchor to the assistant's message to see the difference.

<ComponentPreview styleName="base-rhea" name="message-scroller-anchoring" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" />

### Group Chat

In a group chat, the turn boundary is more specific than "the user message". It is often
the message that asks the model to respond, or a marker like "Marcus joined the
chat". Typing indicators and history controls usually should not anchor.

Because anchoring is role-independent, you can anchor a marker just as easily as
a message.

```templ showLineNumbers
@messagescroller.Item(messagescroller.ItemProps{MessageID: "marcus-joined", ScrollAnchor: true}) {
	@marker.Marker(marker.Props{Variant: marker.VariantSeparator}) {
		@marker.Content() {
			Marcus joined the chat
		}
	}
}
```

<ComponentPreview styleName="base-rhea" name="message-scroller-group-chat" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" />

### Keeping Context Visible

When a new turn starts, it should still feel like part of the same continuous
thread. `ScrollPreviousItemPeek` keeps a slice of the previous item visible
above the anchor, so the reader keeps their context instead of feeling like the
conversation restarted on a blank page.

```templ showLineNumbers
// Keep 64px of the previous turn visible above the newly anchored row.
{{ peek := 64 }}
@messagescroller.Provider(messagescroller.ProviderProps{ScrollPreviousItemPeek: &peek}) {
	@messagescroller.MessageScroller() {
		// anchored turns
	}
}
```

Adjust the peek amount in the example below to see how it affects the conversation.

<ComponentPreview styleName="base-rhea" name="message-scroller-previous-context" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" />

### Following the Live Edge

When the reader is at the live edge, either because they stayed there or
returned there, `AutoScroll` keeps streamed replies in view as they grow.
Scrolling away from the live edge releases the view, whether by wheel, touch,
keyboard scroll keys, or dragging the scrollbar. An explicit message jump
releases it too. New chunks can then arrive without moving the reader.

`AutoScroll` composes with turn anchoring. When a new turn anchors near the
top, the view stays put while the reply streams into the room below it. Once
the reply fills the viewport, the reader is back at the live edge and
follow-output takes over from the anchor.

```templ showLineNumbers
@messagescroller.Provider(messagescroller.ProviderProps{AutoScroll: true}) {
	@messagescroller.MessageScroller() {
		// streamed turns
	}
}
```

<ComponentPreview styleName="base-rhea" name="message-scroller-streaming" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" />

Calling `scrollToEnd`, or pressing `messagescroller.Button`, re-engages
follow-output when `AutoScroll` is enabled, so a reader who scrolled away can
return to the live edge and keep following. The root and viewport expose
`data-autoscrolling` while that programmatic scroll to the latest message runs,
so you can conditionally apply styles during the transition.

### Opening Saved Threads

It can seem reasonable to reopen a saved thread at the absolute end of the
transcript, but that often drops the reader into the conversation without enough
context. A better default is `DefaultScrollPositionLastAnchor`: show the last
meaningful turn, like the user's latest message, with the reply below it.

That gives the reader an immediate place in the thread. They can see what they
asked, where the answer starts, and continue from there without reconstructing
the conversation from the bottom edge.

```templ showLineNumbers
@messagescroller.Provider(messagescroller.ProviderProps{DefaultScrollPosition: messagescroller.DefaultScrollPositionLastAnchor}) {
	@messagescroller.MessageScroller() {
		// transcript
	}
}
```

<ComponentPreview styleName="base-rhea" name="message-scroller-opening-position" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" hideCode />

`DefaultScrollPositionLastAnchor` is keyed on `ScrollAnchor`, not message role.
If no anchor exists, or the last anchored turn already fits in the viewport, it
falls back to `DefaultScrollPositionEnd`.

Use `DefaultScrollPositionStart` when you want to resume at the beginning of a
conversation, or `DefaultScrollPositionEnd` when the absolute latest message is
the right place to land.

### Avoiding a Flash on Reload

A scroll container always opens at the top. HTML has no way to set `scrollTop`,
so a server-rendered transcript shows the oldest messages first. After
JavaScript runs, `DefaultScrollPosition` moves the view, and you see a jump.

When `DefaultScrollPosition` is `DefaultScrollPositionEnd` or
`DefaultScrollPositionLastAnchor`, the viewport has `data-pending-scroll` until
that position is applied. The styled viewport stays hidden while the attribute
is present, so you see the frame instead of the jump.
`DefaultScrollPositionStart` does not need this.

If you want the end visible on first paint, add an inline script right after the
viewport. Scroll the viewport to the bottom and remove `data-pending-scroll`.

```templ showLineNumbers
@messagescroller.MessageScroller() {
	@messagescroller.Viewport() {
		@messagescroller.Content() {
			// transcript
		}
	}
	<script nonce={ templ.GetNonce(ctx) }>
		(function () {
			var viewport = document.currentScript.previousElementSibling
			viewport.scrollTop = viewport.scrollHeight
			viewport.removeAttribute("data-pending-scroll")
		})()
	</script>
	@messagescroller.Button()
}
```

Put the script in your page, not in the scroller. It only works for
`DefaultScrollPositionEnd`, and only when the messages are already in the HTML.

Do not use this script with `DefaultScrollPositionLastAnchor`. Skip it when
messages load on the client.

### Loading Earlier Messages

Loading earlier messages should not move the conversation the reader is already
looking at. When older rows are prepended above the current transcript,
`messagescroller.Viewport` preserves the visible row so the reader stays in the
same place while history loads above them.

This is enabled by default through `PreserveScrollOnPrepend`.

<ComponentPreview styleName="base-rhea" name="message-scroller-load-history" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" />

Use stable `MessageID` values for message rows. That gives the scroller a
specific row to preserve instead of guessing from whichever pixel happens to sit
at the viewport edge.

### Animating New Messages

`messagescroller.Item` can be animated directly. Keep `MessageID` and
`ScrollAnchor` on the item, and use transform and opacity for the entrance, for
example with the Web Animations API when the row is appended.

A common chat pattern is to animate the user's message when it is sent, then let
the assistant reply stream into a regular row below it. Start the user row below
its final position so it feels like it rises from the live edge of the viewport.

```js showLineNumbers
row.animate(
  [{ opacity: 0, transform: "translateY(10px)" }, {}],
  { duration: 260, easing: "cubic-bezier(0.16,1,0.3,1)" }
)
```

<ComponentPreview styleName="base-rhea" name="message-scroller-animation" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" />

Avoid animating height, margin, or padding for row entrances; those changes can
fight the scroller's positioning work. If the reader prefers reduced motion,
skip the entrance animation and keep the scroll behavior the same.

### Jumping to Messages

Search results, permalinks, outline items, and toolbar buttons often need to
drive the transcript from outside the message list. Use the scroll commands on
`window.templ.messageScroller` for those controls. They take any element inside
the provider, including controls rendered outside the `MessageScroller` frame.

```js showLineNumbers
const { scrollToMessage, scrollToEnd, scrollToStart } = window.templ.messageScroller

scrollToMessage(element, "msg-3", { align: "start", behavior: "smooth" })
```

<ComponentPreview styleName="base-rhea" name="message-scroller-commands" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" hideCode />

`scrollToMessage` targets the `MessageID` on `messagescroller.Item`, so rows that
need to be addressable should have stable ids. `scrollToMessage` returns `false`
when the target is not mounted and cannot be queued.

`scrollToMessage` can queue a target before items exist, which covers
client-resolved permalinks while the transcript mounts. After rows have mounted,
a missing id returns `false` instead of starting a guessed retry loop. A `true`
result means the scroll ran or was queued, not that the row is already in view.

### Tracking the Reader's Position

Use `visibility` and `onVisibilityChange` to track the reader's position in the
conversation. A common example is a table-of-contents or a jump menu that
highlights the current anchored turn.

```js showLineNumbers
const { visibility, onVisibilityChange } = window.templ.messageScroller

const { currentAnchorId, visibleMessageIds } = visibility(element)
const unsubscribe = onVisibilityChange(element, ({ currentAnchorId }) => {
  // mark the current turn
})
```

<ComponentPreview styleName="base-rhea" name="message-scroller-visibility" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" hideCode />

`currentAnchorId` answers "where am I" by reporting the current anchored turn,
and it stays set after that anchor scrolls above the viewport. `visibleMessageIds`
answers "what is on screen", in document order.

Visibility is pay-for-what-you-use. Tracking only runs while something
subscribes with `onVisibilityChange`, and rows need a `MessageID` to
participate.

### Reading Scroll State

Use `scrollable` and `onScrollableChange` when you need scroll state in
JavaScript, such as a status indicator or a custom "jump to latest" control. It
reports which edges the viewport can still scroll toward; "at the start/end" is
the negation (`!start` / `!end`), and "scrollable at all" is `start || end`. For
styling the scroller itself, prefer the `data-scrollable` attribute.

```js showLineNumbers
const { scrollable, onScrollableChange } = window.templ.messageScroller

const { start, end } = scrollable(element)
```

<ComponentPreview styleName="base-rhea" name="message-scroller-scrollable" className="rounded-[34px] sm:rounded-4xl" previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16" />

## Performance

`MessageScroller` is benchmarked against large transcripts with markdown and
composed message rows.

Our performance goal for `MessageScroller` is to keep the scroll hot path cheap:
no rerendering of transcript rows, no forced layout on every scroll, and as
little off-screen paint work as the browser can avoid.

Scroll position, anchoring, and follow-output are tracked imperatively and mirrored onto the root and viewport through `data-*` attributes, so scrolling and streaming do not touch transcript rows.

The styled `messagescroller.Item` also ships with `content-visibility: auto` and
`contain-intrinsic-size`. Rows stay in the DOM for selection, copy,
find-in-page, server rendering, and assistive tech, but the browser can skip
rendering work for rows far outside the viewport.

Visibility tracking is pay-for-what-you-use. A jump menu or active
turn indicator costs nothing until something subscribes with
`onVisibilityChange`.

This is comfortable for the expected range of a chat transcript: hundreds to low
thousands of turns, including messages with markdown and composed components.

## Virtualization

Virtualization is intentionally left outside the primitive. `MessageScroller`
renders real DOM rows and stays fast well into the thousands of turns (see
[Performance](#performance)), so most transcripts never need it.

When a transcript is large enough to need virtualization, use
`messagescroller.Viewport` as the scroll element and let the virtualizer own the
rows inside `messagescroller.Content`.

## Accessibility

`MessageScroller` keeps the scroll container keyboard reachable and the
transcript announceable without forcing a specific message UI.

`messagescroller.Viewport` is a labelled, keyboard-focusable scroll region by
default. It uses `role="region"`, `aria-label="Messages"`, and `tabindex="0"`,
so keyboard users can focus the transcript and scroll it directly.

`messagescroller.Content` marks the transcript as a live region with
`role="log"` and `aria-relevant="additions"`. New rows can be announced, but
streamed text mutations do not have to be announced token by token.

```templ showLineNumbers
@messagescroller.Content(messagescroller.ContentProps{Attributes: templ.Attributes{"aria-busy": "true"}}) {
	// messages
}
```

Set `aria-busy` while a turn streams if announcements should wait for the
completed message row.

`messagescroller.Button` renders a real button. When there is nothing to scroll
toward, it sets `inert`, uses `tabindex="-1"`, and exposes `data-active="false"`
so inactive scroll controls do not create extra focus stops.

## API Reference

### Provider

Owns the scroll state. Renders no element.

| Prop                     | Type                    | Default |
| ------------------------ | ----------------------- | ------- |
| `AutoScroll`             | `bool`                  | `false` |
| `DefaultScrollPosition`  | `DefaultScrollPosition` | `DefaultScrollPositionEnd` |
| `ScrollEdgeThreshold`    | `*int`                  | `8`     |
| `ScrollPreviousItemPeek` | `*int`                  | `64`    |
| `ScrollMargin`           | `int`                   | `0`     |

### MessageScroller

The styled frame.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |

### Viewport

The scrollable element.

| Prop                      | Type     | Default |
| ------------------------- | -------- | ------- |
| `PreserveScrollOnPrepend` | `*bool`  | `true`  |
| `Class`                   | `string` | -       |

### Content

The transcript container.

| Prop          | Type     | Default |
| ------------- | -------- | ------- |
| `SpacerClass` | `string` | -       |
| `Class`       | `string` | -       |

### Item

A transcript row.

| Prop           | Type     | Default |
| -------------- | -------- | ------- |
| `MessageID`    | `string` | -       |
| `ScrollAnchor` | `bool`   | `false` |
| `Class`        | `string` | -       |

### Button

Scrolls to an edge of the transcript.

| Prop        | Type                          | Default         |
| ----------- | ----------------------------- | --------------- |
| `Direction` | `DirectionStart \| DirectionEnd` | `DirectionEnd`  |
| `Behavior`  | `string`                      | `"smooth"`      |
| `Variant`   | `button.Variant`              | `VariantSecondary` |
| `Size`      | `button.Size`                 | `SizeIconSm`    |
| `Class`     | `string`                      | -               |

### Scroll commands

`window.templ.messageScroller` takes any element inside a provider.

| Function             | Returns |
| -------------------- | ------- |
| `scrollToMessage(el, messageId, options)` | `boolean` |
| `scrollToStart(el, options)` | `boolean` |
| `scrollToEnd(el, options)` | `boolean` |
| `scrollable(el)` | `{ start, end }` |
| `onScrollableChange(el, fn)` | unsubscribe function |
| `visibility(el)` | `{ currentAnchorId, visibleMessageIds }` |
| `onVisibilityChange(el, fn)` | unsubscribe function |
