// Port of @shadcn/react's MessageScroller (packages/react/src/message-scroller:
// components.tsx, use-message-scroller-controller.ts,
// use-message-scroller-commands.ts, use-message-scroller-refs.ts, geometry.ts,
// stores.ts). One controller per [data-slot="message-scroller"] root holds the
// refs bag; the provider's props are the root's data-templ-* markers, read on
// every use like the refs mirror the latest props each render.
//
// The hooks are window.templ.messageScroller:
//   scrollToMessage(el, messageId, options) / scrollToStart(el, options) /
//   scrollToEnd(el, options)                         useMessageScroller()
//   scrollable(el), onScrollableChange(el, fn)       useMessageScrollerScrollable()
//   visibility(el), onVisibilityChange(el, fn)       useMessageScrollerVisibility()
// `el` is the root or any element inside it. The scrollable state is also
// dispatched as a bubbling "message-scroller-scrollable-change" event.
(function () {
  "use strict";

  const ROOT = '[data-slot="message-scroller"]';
  const DEFAULT_SCROLL_EDGE_THRESHOLD = 8;
  const DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK = 64;
  const DEFAULT_SCROLL_MARGIN = 0;
  const SCROLL_POSITION_EPSILON = 0.5;
  const AUTOSCROLLING_CLEAR_DELAY = 180;
  const USER_SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);
  const EMPTY_SCROLLABLE = { start: false, end: false };
  const EMPTY_VISIBILITY = { currentAnchorId: null, visibleMessageIds: [] };

  // ---- stores.ts ----------------------------------------------------------

  function createStore(initial, isEqual) {
    let snapshot = initial;
    const listeners = new Set();
    return {
      getSnapshot: () => snapshot,
      hasListeners: () => listeners.size > 0,
      setSnapshot(next) {
        if (isEqual(snapshot, next)) return;
        snapshot = next;
        listeners.forEach((l) => l(snapshot));
      },
      subscribe(listener, onFirst, onLast) {
        const wasEmpty = listeners.size === 0;
        listeners.add(listener);
        if (wasEmpty) onFirst?.();
        return () => {
          if (!listeners.delete(listener)) return;
          if (listeners.size === 0) onLast?.();
        };
      },
    };
  }

  const scrollStatesEqual = (a, b) => a.start === b.start && a.end === b.end;
  const visibilityStatesEqual = (a, b) =>
    a.currentAnchorId === b.currentAnchorId &&
    a.visibleMessageIds.length === b.visibleMessageIds.length &&
    a.visibleMessageIds.every((id, i) => id === b.visibleMessageIds[i]);

  // ---- geometry.ts --------------------------------------------------------

  function readCssPixel(value) {
    if (!value) return 0;
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  function getBlockPadding(element) {
    const style = window.getComputedStyle(element);
    return {
      end: readCssPixel(style.paddingBlockEnd || style.paddingBottom),
      start: readCssPixel(style.paddingBlockStart || style.paddingTop),
    };
  }

  function getContentBlockPadding(spacer) {
    const content = spacer?.parentElement;
    return content ? getBlockPadding(content) : { end: 0, start: 0 };
  }

  function getFlexGap(element) {
    if (!element) return 0;
    const style = window.getComputedStyle(element);
    return readCssPixel(style.rowGap === "normal" ? style.gap : style.rowGap);
  }

  function getItems(content, spacer) {
    return Array.from(content.children).filter((child) => child instanceof HTMLElement && child !== spacer);
  }

  const isAnchor = (item) => item?.dataset.scrollAnchor === "true";

  function getNewScrollAnchor(items, previousCount) {
    for (let i = previousCount; i < items.length; i++) if (isAnchor(items[i])) return items[i];
    return null;
  }

  function getUnanchoredScrollAnchor(items, handled) {
    for (const item of items) if (isAnchor(item) && !handled.has(item)) return item;
    return null;
  }

  function hasMultipleNewScrollAnchors(items, previousCount) {
    let count = 0;
    for (let i = previousCount; i < items.length; i++) {
      if (!isAnchor(items[i])) continue;
      count += 1;
      if (count > 1) return true;
    }
    return false;
  }

  function getLastScrollAnchor(items) {
    for (let i = items.length - 1; i >= 0; i--) if (isAnchor(items[i])) return items[i];
    return null;
  }

  function getElementTop(element, viewport) {
    return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
  }

  function getElementViewportTop(element, viewport) {
    return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
  }

  function getContentBottom(content, spacer, viewport) {
    const padding = getBlockPadding(content);
    const viewportRect = viewport.getBoundingClientRect();
    const scrollTop = viewport.scrollTop;
    let bottom = padding.start + padding.end;
    for (const item of getItems(content, spacer)) {
      const rect = item.getBoundingClientRect();
      bottom = Math.max(bottom, rect.bottom - viewportRect.top + scrollTop + padding.end);
    }
    return bottom;
  }

  function getScrollable(content, threshold, spacer, viewport) {
    if (!viewport || !content) return EMPTY_SCROLLABLE;
    const contentBottom = getContentBottom(content, spacer, viewport);
    return {
      start: viewport.scrollTop > threshold,
      end: contentBottom - viewport.scrollTop - viewport.clientHeight > threshold,
    };
  }

  function getVisibilityState(content, scrollMargin, peek, spacer, viewport, visibleIds) {
    if (!content || !viewport) return EMPTY_VISIBILITY;
    const viewportRect = viewport.getBoundingClientRect();
    const lineTop = viewportRect.top + scrollMargin + peek;
    const trackByLayout = typeof IntersectionObserver === "undefined";
    const visible = [];
    let currentAnchorId = null;
    for (const item of getItems(content, spacer)) {
      const messageId = item.dataset.messageId;
      if (!messageId) continue;
      const anchor = isAnchor(item);
      const rect = anchor || trackByLayout ? item.getBoundingClientRect() : null;
      const isVisible = trackByLayout && rect ? rect.bottom > lineTop && rect.top < viewportRect.bottom : visibleIds.has(messageId);
      if (isVisible) visible.push(messageId);
      if (anchor && rect && rect.top <= lineTop + SCROLL_POSITION_EPSILON) currentAnchorId = messageId;
    }
    if (visible.length === 0 && currentAnchorId === null) return EMPTY_VISIBILITY;
    return { currentAnchorId, visibleMessageIds: visible };
  }

  function getFirstVisibleItem(content, spacer, viewport) {
    const viewportRect = viewport.getBoundingClientRect();
    for (const item of getItems(content, spacer)) {
      if (!item.dataset.messageId) continue;
      const rect = item.getBoundingClientRect();
      if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) return item;
    }
    return null;
  }

  function getElementScrollTop(align, element, scrollMargin, spacer, viewport) {
    const elementTop = getElementTop(element, viewport);
    const elementHeight = element.getBoundingClientRect().height;
    const padding = getContentBlockPadding(spacer);
    if (align === "center") {
      const insetHeight = Math.max(0, viewport.clientHeight - padding.start - padding.end);
      return elementTop - padding.start - (insetHeight - elementHeight) / 2 - scrollMargin;
    }
    if (align === "end") return elementTop - viewport.clientHeight + elementHeight + padding.end + scrollMargin;
    if (align === "nearest") {
      const elementBottom = elementTop + elementHeight;
      const viewportTop = viewport.scrollTop + padding.start;
      const viewportBottom = viewport.scrollTop + viewport.clientHeight - padding.end;
      if (elementTop >= viewportTop && elementBottom <= viewportBottom) return viewport.scrollTop;
      if (elementTop < viewportTop) return elementTop - padding.start - scrollMargin;
      return elementBottom - viewport.clientHeight + padding.end + scrollMargin;
    }
    return elementTop - padding.start - scrollMargin;
  }

  const getMaxScrollTop = (viewport) => Math.max(0, viewport.scrollHeight - viewport.clientHeight);

  // ---- controller ---------------------------------------------------------

  const own = (root, el) => el.closest(ROOT) === root;
  const part = (root, slot) => [...root.querySelectorAll(`[data-slot="${slot}"]`)].find((el) => own(root, el)) || null;
  const numberAttr = (el, name, fallback) => {
    const value = el.getAttribute(name);
    if (value === null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  function createController(root) {
    // Latest provider props (useMessageScrollerRefs mirrors them per render).
    const props = {
      get autoScroll() {
        return root.hasAttribute("data-templ-auto-scroll");
      },
      get defaultScrollPosition() {
        return root.getAttribute("data-templ-default-scroll-position") || "end";
      },
      get scrollEdgeThreshold() {
        return numberAttr(root, "data-templ-scroll-edge-threshold", DEFAULT_SCROLL_EDGE_THRESHOLD);
      },
      get scrollPreviousItemPeek() {
        return numberAttr(root, "data-templ-scroll-previous-item-peek", DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK);
      },
      get scrollMargin() {
        return numberAttr(root, "data-templ-scroll-margin", DEFAULT_SCROLL_MARGIN);
      },
    };

    const r = {
      viewport: part(root, "message-scroller-viewport"),
      content: part(root, "message-scroller-content"),
      spacer: null,
      autoscrolling: false,
      autoscrollingTimeout: null,
      streamingTurn: null,
      defaultScrollPositionApplied: false,
      firstItem: null,
      itemCount: 0,
      lastScrollTop: 0,
      messageElements: new Map(),
      mode: props.autoScroll ? "following-bottom" : "free-scrolling",
      pendingScrollFrame: null,
      pendingScrollToMessage: null,
      prependRestore: null,
      spacerGap: 0,
      spacerHeight: 0,
      stateFrame: null,
      visibilityFrame: null,
      visibilityObserver: null,
      visibleMessageIds: new Set(),
      handledScrollAnchors: new WeakSet(),
      cleanup: [],
    };

    // MessageScrollerContent renders the spacer as its last child.
    const last = r.content?.lastElementChild;
    if (last && last.hasAttribute("data-message-scroller-spacer")) {
      r.spacer = last;
      r.spacerGap = getFlexGap(r.content);
    }

    const preserveScrollOnPrepend = () => r.viewport?.getAttribute("data-templ-preserve-scroll-on-prepend") !== "false";

    const pendingDefaultScrollStore = createStore(root.hasAttribute("data-pending-scroll"), (a, b) => a === b);
    const stateStore = createStore(EMPTY_SCROLLABLE, scrollStatesEqual);
    const visibilityStore = createStore(EMPTY_VISIBILITY, visibilityStatesEqual);

    // MessageScroller / MessageScrollerViewport render data-pending-scroll.
    pendingDefaultScrollStore.subscribe((pending) => {
      root.toggleAttribute("data-pending-scroll", pending);
      r.viewport?.toggleAttribute("data-pending-scroll", pending);
    });

    // MessageScrollerButton: active while there is content toward its edge.
    function writeButtons(state) {
      for (const button of root.querySelectorAll('[data-slot="message-scroller-button"]')) {
        if (!own(root, button)) continue;
        const active = button.getAttribute("data-direction") === "start" ? state.start : state.end;
        button.setAttribute("data-active", active ? "true" : "false");
        button.inert = !active;
        button.tabIndex = active ? 0 : -1;
      }
    }

    stateStore.subscribe((state) => {
      writeButtons(state);
      root.dispatchEvent(new CustomEvent("message-scroller-scrollable-change", { bubbles: true, detail: { ...state } }));
    });

    const clearPendingDefaultScroll = () => pendingDefaultScrollStore.setSnapshot(false);
    const markDefaultScrollPositionApplied = () => {
      r.defaultScrollPositionApplied = true;
      clearPendingDefaultScroll();
    };

    function writeStateAttributes(state) {
      const scrollable = [state.start && "start", state.end && "end"].filter(Boolean).join(" ");
      for (const element of [root, r.viewport]) {
        if (!element) continue;
        if (scrollable) element.setAttribute("data-scrollable", scrollable);
        else element.removeAttribute("data-scrollable");
        element.toggleAttribute("data-autoscrolling", r.autoscrolling);
      }
    }

    function reconcileFollowMode(scrollable) {
      const scrollTop = r.viewport?.scrollTop ?? 0;
      const scrolledUp = scrollTop < r.lastScrollTop - SCROLL_POSITION_EPSILON;
      r.lastScrollTop = scrollTop;
      if (props.autoScroll && !scrollable.end && r.mode !== "settling-jump" && r.mode !== "anchored-to-message") {
        r.mode = "following-bottom";
      } else if (r.mode === "following-bottom" && scrollable.end && scrolledUp && !r.autoscrolling) {
        r.mode = "free-scrolling";
      }
    }

    function commitScrollState() {
      const next = getScrollable(r.content, props.scrollEdgeThreshold, r.spacer, r.viewport);
      reconcileFollowMode(next);
      const published = r.mode === "following-bottom" ? { ...next, end: false } : next;
      writeStateAttributes(published);
      stateStore.setSnapshot(published);
    }

    function scheduleStateCommit() {
      if (r.stateFrame !== null) return;
      r.stateFrame = requestAnimationFrame(() => {
        r.stateFrame = null;
        commitScrollState();
      });
    }

    function scheduleVisibilitySync() {
      if (!visibilityStore.hasListeners() || r.visibilityFrame !== null) return;
      r.visibilityFrame = requestAnimationFrame(() => {
        r.visibilityFrame = null;
        if (!visibilityStore.hasListeners()) return;
        visibilityStore.setSnapshot(
          getVisibilityState(r.content, props.scrollMargin, props.scrollPreviousItemPeek, r.spacer, r.viewport, r.visibleMessageIds),
        );
      });
    }

    // ---- use-message-scroller-commands.ts ----

    function setAutoScrolling(autoscrolling) {
      if (r.autoscrollingTimeout !== null) {
        clearTimeout(r.autoscrollingTimeout);
        r.autoscrollingTimeout = null;
      }
      if (r.autoscrolling !== autoscrolling) {
        r.autoscrolling = autoscrolling;
        commitScrollState();
      }
      if (autoscrolling) {
        r.autoscrollingTimeout = setTimeout(() => {
          r.autoscrollingTimeout = null;
          r.autoscrolling = false;
          commitScrollState();
        }, AUTOSCROLLING_CLEAR_DELAY);
      }
    }

    function setTailSpacerHeight(height) {
      const spacer = r.spacer;
      if (!spacer) return;
      const next = Math.max(0, Math.ceil(height));
      if (r.spacerHeight === next) return;
      r.spacerHeight = next;
      spacer.hidden = next === 0;
      spacer.style.height = `${next}px`;
      spacer.style.marginTop = next > 0 ? `${-r.spacerGap}px` : "";
    }

    function scrollToPosition(scrollTop, { behavior = "auto", autoscrolling = false } = {}) {
      const viewport = r.viewport;
      if (!viewport) return;
      const next = Math.max(0, scrollTop);
      if (Math.abs(viewport.scrollTop - next) <= SCROLL_POSITION_EPSILON) {
        viewport.scrollTop = next;
        commitScrollState();
        return;
      }
      if (autoscrolling) setAutoScrolling(true);
      viewport.scrollTo({ top: next, behavior });
      scheduleStateCommit();
    }

    function scrollToStart({ behavior = "auto" } = {}) {
      if (!r.viewport) return false;
      setTailSpacerHeight(0);
      r.streamingTurn = null;
      r.mode = "free-scrolling";
      scrollToPosition(0, { behavior });
      scheduleVisibilitySync();
      return true;
    }

    function scrollToEnd({ behavior = "auto" } = {}) {
      const viewport = r.viewport;
      if (!viewport) return false;
      setTailSpacerHeight(0);
      r.streamingTurn = null;
      r.mode = props.autoScroll ? "following-bottom" : "free-scrolling";
      scrollToPosition(getMaxScrollTop(viewport), { autoscrolling: true, behavior });
      scheduleVisibilitySync();
      return true;
    }

    function scrollToElement(element, { align = "start", behavior = "auto", scrollMargin = props.scrollMargin } = {}, { keepPreviousPeek = false } = {}) {
      const { content, viewport } = r;
      if (!content || !viewport || !content.contains(element)) return false;
      const scrollTop = getElementScrollTop(
        align,
        element,
        keepPreviousPeek ? scrollMargin + props.scrollPreviousItemPeek : scrollMargin,
        r.spacer,
        viewport,
      );
      setTailSpacerHeight(scrollTop + viewport.clientHeight - getContentBottom(content, r.spacer, viewport));
      r.prependRestore = { element, viewportTop: getElementViewportTop(element, viewport) };
      r.mode = keepPreviousPeek ? "anchored-to-message" : "settling-jump";
      r.streamingTurn = keepPreviousPeek ? element : null;
      scrollToPosition(scrollTop, { behavior });
      scheduleVisibilitySync();
      return true;
    }

    function reanchorToAnchoredMessage() {
      const element = r.streamingTurn;
      if (!element || !element.isConnected || r.mode !== "anchored-to-message") return false;
      return scrollToElement(element, { align: "start" }, { keepPreviousPeek: true });
    }

    function scrollToMessage(messageId, options) {
      const element = r.messageElements.get(messageId);
      if (!element) {
        if (r.itemCount === 0) {
          r.pendingScrollToMessage = { messageId, options };
          markDefaultScrollPositionApplied();
          return true;
        }
        return false;
      }
      markDefaultScrollPositionApplied();
      if (scrollToElement(element, options)) {
        r.pendingScrollToMessage = null;
        return true;
      }
      r.pendingScrollToMessage = { messageId, options };
      return true;
    }

    function flushPendingScrollToMessage() {
      const pending = r.pendingScrollToMessage;
      if (!pending) return false;
      const element = r.messageElements.get(pending.messageId);
      if (!element) return false;
      if (!scrollToElement(element, pending.options)) return false;
      r.pendingScrollToMessage = null;
      markDefaultScrollPositionApplied();
      return true;
    }

    // ---- use-message-scroller-controller.ts ----

    function restorePrependedAnchor() {
      const anchor = r.prependRestore;
      const viewport = r.viewport;
      if (!anchor || !viewport || !anchor.element.isConnected) return false;
      const delta = getElementViewportTop(anchor.element, viewport) - anchor.viewportTop;
      if (Math.abs(delta) <= SCROLL_POSITION_EPSILON) return false;
      viewport.scrollTop += delta;
      anchor.viewportTop = getElementViewportTop(anchor.element, viewport);
      scheduleStateCommit();
      scheduleVisibilitySync();
      return true;
    }

    function capturePrependAnchor() {
      const { content, viewport } = r;
      if (!content || !viewport) {
        r.prependRestore = null;
        return;
      }
      const anchor = getFirstVisibleItem(content, r.spacer, viewport);
      r.prependRestore = anchor ? { element: anchor, viewportTop: getElementViewportTop(anchor, viewport) } : null;
    }

    function schedulePendingScrollToMessageFlush() {
      if (r.pendingScrollFrame !== null) return;
      r.pendingScrollFrame = requestAnimationFrame(() => {
        r.pendingScrollFrame = null;
        if (flushPendingScrollToMessage()) capturePrependAnchor();
      });
    }

    function applyDefaultScrollPosition() {
      const position = props.defaultScrollPosition;
      if (!position || r.defaultScrollPositionApplied || r.itemCount === 0) return false;
      let handled = false;
      if (position === "last-anchor") {
        const { content, viewport } = r;
        const anchor = content && viewport ? getLastScrollAnchor(getItems(content, r.spacer)) : null;
        if (!content || !viewport || !anchor) {
          handled = scrollToEnd({ behavior: "auto" });
        } else {
          const lastTurnFits = getContentBottom(content, r.spacer, viewport) - getElementTop(anchor, viewport) <= viewport.clientHeight;
          handled = lastTurnFits ? scrollToEnd({ behavior: "auto" }) : scrollToElement(anchor, { align: "start" }, { keepPreviousPeek: true });
        }
      } else {
        handled = position === "end" ? scrollToEnd({ behavior: "auto" }) : scrollToStart({ behavior: "auto" });
      }
      if (!handled) return false;
      markDefaultScrollPositionApplied();
      return true;
    }

    // MessageScrollerItem's ref callback: register rows by data-message-id.
    function registerMessage(messageId, element, removedElement) {
      if (element) {
        r.messageElements.set(messageId, element);
        r.visibilityObserver?.observe(element);
        scheduleVisibilitySync();
        if (r.pendingScrollToMessage?.messageId === messageId) schedulePendingScrollToMessageFlush();
        return;
      }
      if (removedElement && r.messageElements.get(messageId) === removedElement) {
        r.messageElements.delete(messageId);
        r.visibleMessageIds.delete(messageId);
        r.visibilityObserver?.unobserve(removedElement);
        scheduleVisibilitySync();
      }
    }

    function syncRegisteredItems() {
      const current = new Set();
      for (const item of root.querySelectorAll('[data-slot="message-scroller-item"][data-message-id]')) {
        if (!own(root, item)) continue;
        current.add(item);
        if (r.messageElements.get(item.dataset.messageId) !== item) registerMessage(item.dataset.messageId, item);
      }
      for (const [messageId, element] of [...r.messageElements]) {
        if (!current.has(element)) registerMessage(messageId, null, element);
      }
    }

    function handleContentChange() {
      const content = r.content;
      if (!content) return;
      // The spacer stays the last child as rows come and go.
      if (r.spacer && r.spacer.nextElementSibling) content.append(r.spacer);
      syncRegisteredItems();
      const items = getItems(content, r.spacer);
      const previousItemCount = r.itemCount;
      const previousFirstItem = r.firstItem;
      r.itemCount = items.length;
      r.firstItem = items[0] ?? null;

      const reconcile = () => {
        if (flushPendingScrollToMessage()) return;
        if (previousItemCount === 0) {
          if (applyDefaultScrollPosition()) return;
          if (items.length > 0 && props.autoScroll && scrollToEnd({ behavior: "auto" })) return;
          commitScrollState();
          scheduleVisibilitySync();
          return;
        }
        const previousFirstIndex = previousFirstItem ? items.indexOf(previousFirstItem) : -1;
        if (preserveScrollOnPrepend() && previousFirstIndex > 0) {
          restorePrependedAnchor();
          return;
        }
        if (items.length > previousItemCount) {
          const anchor = getNewScrollAnchor(items, previousItemCount);
          if (anchor) {
            if (props.autoScroll && r.mode === "following-bottom" && hasMultipleNewScrollAnchors(items, previousItemCount)) {
              scrollToEnd({ behavior: "auto" });
              return;
            }
            scrollToElement(anchor, { align: "start" }, { keepPreviousPeek: true });
            r.handledScrollAnchors.add(anchor);
            return;
          }
        }
        if (items.length === previousItemCount) {
          const anchor = getUnanchoredScrollAnchor(items, r.handledScrollAnchors);
          if (anchor) {
            scrollToElement(anchor, { align: "start" }, { keepPreviousPeek: true });
            r.handledScrollAnchors.add(anchor);
            return;
          }
        }
        if (r.mode === "following-bottom" && props.autoScroll) {
          scrollToEnd({ behavior: "auto" });
        } else {
          commitScrollState();
          scheduleVisibilitySync();
        }
      };

      reconcile();
      capturePrependAnchor();
    }

    function handleResize() {
      if (r.mode === "following-bottom" && props.autoScroll) {
        scrollToEnd({ behavior: "auto" });
        return;
      }
      const previousSpacerHeight = r.spacerHeight;
      if (reanchorToAnchoredMessage()) {
        if (props.autoScroll && previousSpacerHeight > 0 && r.spacerHeight === 0) scrollToEnd({ behavior: "auto" });
        return;
      }
      scheduleStateCommit();
      scheduleVisibilitySync();
    }

    function observeVisibility() {
      const viewport = r.viewport;
      if (!viewport || !visibilityStore.hasListeners()) return;
      if (typeof IntersectionObserver === "undefined") {
        scheduleVisibilitySync();
        return;
      }
      if (!r.visibilityObserver) {
        r.visibilityObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const messageId = entry.target.dataset.messageId;
              if (!messageId) continue;
              if (entry.isIntersecting) r.visibleMessageIds.add(messageId);
              else r.visibleMessageIds.delete(messageId);
            }
            scheduleVisibilitySync();
          },
          {
            root: viewport,
            rootMargin: `${-(props.scrollMargin + props.scrollPreviousItemPeek)}px 0px 0px 0px`,
            threshold: [0, 0.01, 0.5, 1],
          },
        );
      }
      r.messageElements.forEach((element) => r.visibilityObserver?.observe(element));
      scheduleVisibilitySync();
    }

    function unobserveVisibility() {
      if (r.visibilityFrame !== null) {
        cancelAnimationFrame(r.visibilityFrame);
        r.visibilityFrame = null;
      }
      r.visibilityObserver?.disconnect();
      r.visibilityObserver = null;
      r.visibleMessageIds.clear();
      visibilityStore.setSnapshot(EMPTY_VISIBILITY);
    }

    function userScrollIntent() {
      if (r.mode === "following-bottom" || r.mode === "anchored-to-message" || r.mode === "settling-jump") {
        r.streamingTurn = null;
        r.mode = "free-scrolling";
      }
    }

    function syncAfterScroll() {
      commitScrollState();
      scheduleVisibilitySync();
      capturePrependAnchor();
    }

    const on = (el, type, fn, opts) => {
      if (!el) return;
      el.addEventListener(type, fn, opts);
      r.cleanup.push(() => el.removeEventListener(type, fn, opts));
    };

    // Ref callbacks mirror the current state onto root and viewport.
    writeStateAttributes(stateStore.getSnapshot());

    // MessageScrollerViewport handlers.
    on(r.viewport, "scroll", syncAfterScroll);
    on(r.viewport, "wheel", userScrollIntent);
    on(r.viewport, "touchmove", userScrollIntent);
    on(r.viewport, "keydown", (event) => {
      if (USER_SCROLL_KEYS.has(event.key)) userScrollIntent();
    });

    // MessageScrollerButton click.
    on(root, "click", (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-slot="message-scroller-button"]') : null;
      if (!button || !own(root, button) || button.getAttribute("data-active") !== "true") return;
      if (event.defaultPrevented) return;
      button.blur();
      const behavior = button.getAttribute("data-templ-behavior") || "smooth";
      if (button.getAttribute("data-direction") === "start") scrollToStart({ behavior });
      else scrollToEnd({ behavior });
    });

    // MessageScrollerContent layout effect: the first content pass, then
    // every childList change.
    if (r.content) {
      handleContentChange();
      const mutations = new MutationObserver(handleContentChange);
      mutations.observe(r.content, { childList: true });
      r.cleanup.push(() => mutations.disconnect());
    }

    // Provider layout effects: opening position, then the autoScroll pass.
    if (!applyDefaultScrollPosition() && r.itemCount === 0) clearPendingDefaultScroll();
    if (props.autoScroll && r.mode === "following-bottom" && r.itemCount > 0) scrollToEnd({ behavior: "auto" });
    else commitScrollState();

    // Viewport and content resize, coalesced onto a frame.
    for (const target of [r.viewport, r.content]) {
      if (!target) continue;
      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(handleResize);
      });
      observer.observe(target);
      r.cleanup.push(() => {
        cancelAnimationFrame(frame);
        observer.disconnect();
      });
    }

    function destroy() {
      r.cleanup.forEach((fn) => fn());
      if (r.stateFrame !== null) cancelAnimationFrame(r.stateFrame);
      if (r.visibilityFrame !== null) cancelAnimationFrame(r.visibilityFrame);
      if (r.pendingScrollFrame !== null) cancelAnimationFrame(r.pendingScrollFrame);
      if (r.autoscrollingTimeout !== null) clearTimeout(r.autoscrollingTimeout);
      r.visibilityObserver?.disconnect();
    }

    return {
      scrollToMessage,
      scrollToStart,
      scrollToEnd,
      scrollable: () => stateStore.getSnapshot(),
      onScrollableChange: (fn) => stateStore.subscribe(fn),
      visibility: () => visibilityStore.getSnapshot(),
      onVisibilityChange: (fn) => visibilityStore.subscribe(fn, observeVisibility, unobserveVisibility),
      destroy,
    };
  }

  function controllerOf(el) {
    const root = typeof el === "string" ? document.getElementById(el) : el?.closest?.(ROOT) || el?.querySelector?.(ROOT);
    if (!root || !root.matches(ROOT)) return null;
    if (!root._templMessageScroller) root._templMessageScroller = createController(root);
    return root._templMessageScroller;
  }

  window.templ.messageScroller = {
    scrollToMessage: (el, messageId, options) => controllerOf(el)?.scrollToMessage(messageId, options) ?? false,
    scrollToStart: (el, options) => controllerOf(el)?.scrollToStart(options) ?? false,
    scrollToEnd: (el, options) => controllerOf(el)?.scrollToEnd(options) ?? false,
    scrollable: (el) => controllerOf(el)?.scrollable() ?? EMPTY_SCROLLABLE,
    onScrollableChange: (el, fn) => controllerOf(el)?.onScrollableChange(fn) ?? (() => {}),
    visibility: (el) => controllerOf(el)?.visibility() ?? EMPTY_VISIBILITY,
    onVisibilityChange: (el, fn) => controllerOf(el)?.onVisibilityChange(fn) ?? (() => {}),
  };

  window.templ.lifecycle.register(ROOT, {
    init: (root) => controllerOf(root),
    destroy: (root) => {
      root._templMessageScroller?.destroy();
      delete root._templMessageScroller;
    },
  });
})();
