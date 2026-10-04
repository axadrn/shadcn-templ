// Port of @base-ui/react scroll-area 1.6.0 (Root, Viewport, Scrollbar,
// Thumb, Corner): the viewport scrolls natively without its scrollbar, the
// parts render the overflow state, the thumbs follow the scroll position and
// drag it.
(function () {
  "use strict";

  const ROOT = '[data-slot="scroll-area"]';
  const SCROLL_TIMEOUT = 500;
  const MIN_THUMB_SIZE = 16;

  // styleDisableScrollbar: React hoists Base UI's style element to <head>.
  function insertStyles() {
    if (document.querySelector('style[data-href="base-ui-disable-scrollbar"]')) return;
    const style = document.createElement("style");
    style.setAttribute("data-precedence", "base-ui:low");
    style.setAttribute("data-href", "base-ui-disable-scrollbar");
    style.textContent = ".base-ui-disable-scrollbar{scrollbar-width:none}.base-ui-disable-scrollbar::-webkit-scrollbar{display:none}";
    document.head.appendChild(style);
  }

  // removeCSSVariableInheritance, skipped in WebKit like Base UI.
  let overflowVarsRegistered = false;
  function removeCSSVariableInheritance() {
    if (overflowVarsRegistered || /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent)) return;
    if (typeof CSS !== "undefined" && "registerProperty" in CSS) {
      ["--scroll-area-overflow-x-start", "--scroll-area-overflow-x-end", "--scroll-area-overflow-y-start", "--scroll-area-overflow-y-end"].forEach((name) => {
        try {
          CSS.registerProperty({ name, syntax: "<length>", inherits: false, initialValue: "0px" });
        } catch {
          /* ignore already-registered */
        }
      });
    }
    overflowVarsRegistered = true;
  }

  function getOffset(element, prop, axis) {
    if (!element) return 0;
    const styles = getComputedStyle(element);
    const propAxis = axis === "x" ? "Inline" : "Block";
    // Safari misreports marginInlineEnd in RTL.
    if (axis === "x" && prop === "margin") return parseFloat(styles[`${prop}InlineStart`]) * 2;
    return parseFloat(styles[`${prop}${propAxis}Start`]) + parseFloat(styles[`${prop}${propAxis}End`]);
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  // normalizeScrollOffset: within 1px of an edge the offset snaps to it.
  const SCROLL_EDGE_TOLERANCE_PX = 1;
  function normalizeScrollOffset(value, max) {
    if (max <= 0) return 0;
    const clamped = clamp(value, 0, max);
    const startDistance = clamped;
    const endDistance = max - clamped;
    const withinStartTolerance = startDistance <= SCROLL_EDGE_TOLERANCE_PX;
    const withinEndTolerance = endDistance <= SCROLL_EDGE_TOLERANCE_PX;
    if (withinStartTolerance && withinEndTolerance) return startDistance <= endDistance ? 0 : max;
    if (withinStartTolerance) return 0;
    if (withinEndTolerance) return max;
    return clamped;
  }

  function createTimeout() {
    let id = 0;
    return {
      start(delay, fn) {
        clearTimeout(id);
        id = setTimeout(fn, delay);
      },
      clear() {
        clearTimeout(id);
      },
    };
  }

  function setAttr(el, name, on) {
    if (el) el.toggleAttribute(name, !!on);
  }

  // A part Base UI unmounts: it leaves a placeholder and comes back to it.
  function mountable(el) {
    const placeholder = document.createComment("");
    el.replaceWith(placeholder);
    el.hidden = false;
    return {
      el,
      set(mounted) {
        if (mounted && !el.isConnected) placeholder.replaceWith(el);
        else if (!mounted && el.isConnected) el.replaceWith(placeholder);
      },
    };
  }

  function init(root) {
    insertStyles();
    const viewport = root.querySelector(':scope > [data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    removeCSSVariableInheritance();
    const scrollbars = [...root.querySelectorAll('[data-slot="scroll-area-scrollbar"]')].filter((s) => s.closest(ROOT) === root).map(mountable);
    const cornerEl = [...root.children].find((c) => c.tagName === "DIV" && !c.hasAttribute("data-slot"));
    const corner = cornerEl && mountable(cornerEl);
    const barOf = (orientation) => scrollbars.find((s) => s.el.getAttribute("data-orientation") === orientation);
    const thumbOf = (bar) => bar?.el.querySelector('[data-slot="scroll-area-thumb"]');
    const direction = () => window.templ.direction.useDirection(viewport);

    const s = {
      hovering: false,
      scrollingX: false,
      scrollingY: false,
      touchModality: false,
      hasMeasured: false,
      cornerSize: { width: 0, height: 0 },
      thumbSize: { width: 0, height: 0 },
      overflowEdges: { xStart: false, xEnd: false, yStart: false, yEnd: false },
      hidden: { x: true, y: true, corner: true },
      programmatic: true,
      lastMetrics: [NaN, NaN, NaN, NaN],
      scrollPosition: { x: 0, y: 0 },
      dragging: false,
      start: { x: 0, y: 0, top: 0, left: 0 },
      orientation: "vertical",
    };
    const scrollYTimeout = createTimeout();
    const scrollXTimeout = createTimeout();
    const scrollEndTimeout = createTimeout();

    // The state attributes every part renders.
    function render() {
      const overflow = (el) => {
        setAttr(el, "data-has-overflow-x", !s.hidden.x);
        setAttr(el, "data-has-overflow-y", !s.hidden.y);
        setAttr(el, "data-overflow-x-start", s.overflowEdges.xStart);
        setAttr(el, "data-overflow-x-end", s.overflowEdges.xEnd);
        setAttr(el, "data-overflow-y-start", s.overflowEdges.yStart);
        setAttr(el, "data-overflow-y-end", s.overflowEdges.yEnd);
      };
      [root, viewport].forEach((el) => {
        overflow(el);
        setAttr(el, "data-scrolling", s.scrollingX || s.scrollingY);
      });
      root.style.setProperty("--scroll-area-corner-height", `${s.cornerSize.height}px`);
      root.style.setProperty("--scroll-area-corner-width", `${s.cornerSize.width}px`);
      // Keep non-scrollable viewports out of tab order.
      viewport.setAttribute("tabindex", s.hidden.x && s.hidden.y ? "-1" : "0");
      scrollbars.forEach((bar) => {
        const vertical = bar.el.getAttribute("data-orientation") === "vertical";
        bar.set(!(vertical ? s.hidden.y : s.hidden.x));
        overflow(bar.el);
        setAttr(bar.el, "data-hovering", s.hovering);
        setAttr(bar.el, "data-scrolling", vertical ? s.scrollingY : s.scrollingX);
        bar.el.style.visibility = s.hasMeasured ? "" : "hidden";
        if (vertical) bar.el.style.setProperty("--scroll-area-thumb-height", `${s.thumbSize.height}px`);
        else bar.el.style.setProperty("--scroll-area-thumb-width", `${s.thumbSize.width}px`);
        const thumb = thumbOf(bar);
        if (thumb) {
          setAttr(thumb, "data-scrolling", vertical ? s.scrollingY : s.scrollingX);
          thumb.style.visibility = s.hasMeasured ? "" : "hidden";
        }
      });
      if (corner) {
        corner.set(!s.hidden.corner);
        corner.el.style.width = `${s.cornerSize.width}px`;
        corner.el.style.height = `${s.cornerSize.height}px`;
      }
    }

    // ScrollAreaViewport's computeThumbPosition.
    function computeThumbPosition() {
      const barY = barOf("vertical");
      const barX = barOf("horizontal");
      const scrollbarYEl = barY?.el.isConnected ? barY.el : null;
      const scrollbarXEl = barX?.el.isConnected ? barX.el : null;
      const thumbYEl = scrollbarYEl && thumbOf(barY);
      const thumbXEl = scrollbarXEl && thumbOf(barX);
      const scrollableContentHeight = viewport.scrollHeight;
      const scrollableContentWidth = viewport.scrollWidth;
      const viewportHeight = viewport.clientHeight;
      const viewportWidth = viewport.clientWidth;
      const scrollTop = viewport.scrollTop;
      const scrollLeft = viewport.scrollLeft;
      const firstMeasurement = Number.isNaN(s.lastMetrics[0]);
      s.lastMetrics = [viewportHeight, scrollableContentHeight, viewportWidth, scrollableContentWidth];
      if (firstMeasurement) s.hasMeasured = true;
      if (scrollableContentHeight === 0 || scrollableContentWidth === 0) return render();

      const y = viewportHeight >= scrollableContentHeight;
      const x = viewportWidth >= scrollableContentWidth;
      const nextHidden = { y, x, corner: y || x };
      const ratioX = viewportWidth / scrollableContentWidth;
      const ratioY = viewportHeight / scrollableContentHeight;
      const maxScrollLeft = Math.max(0, scrollableContentWidth - viewportWidth);
      const maxScrollTop = Math.max(0, scrollableContentHeight - viewportHeight);
      let scrollLeftFromStart = 0;
      let scrollLeftFromEnd = 0;
      if (!x) {
        const raw = direction() === "rtl" ? clamp(-scrollLeft, 0, maxScrollLeft) : clamp(scrollLeft, 0, maxScrollLeft);
        scrollLeftFromStart = normalizeScrollOffset(raw, maxScrollLeft);
        scrollLeftFromEnd = maxScrollLeft - scrollLeftFromStart;
      }
      const scrollTopFromStart = !y ? normalizeScrollOffset(clamp(scrollTop, 0, maxScrollTop), maxScrollTop) : 0;
      const scrollTopFromEnd = !y ? maxScrollTop - scrollTopFromStart : 0;
      const nextWidth = x ? 0 : viewportWidth;
      const nextHeight = y ? 0 : viewportHeight;
      let nextCornerWidth = 0;
      let nextCornerHeight = 0;
      if (!x && !y) {
        nextCornerWidth = scrollbarYEl?.offsetWidth || 0;
        nextCornerHeight = scrollbarXEl?.offsetHeight || 0;
      }
      // Only subtract the corner size while the corner is not sized yet.
      const cornerNotYetSized = s.cornerSize.width === 0 && s.cornerSize.height === 0;
      const cornerWidthOffset = cornerNotYetSized ? nextCornerWidth : 0;
      const cornerHeightOffset = cornerNotYetSized ? nextCornerHeight : 0;
      const scrollbarXOffset = getOffset(scrollbarXEl, "padding", "x");
      const scrollbarYOffset = getOffset(scrollbarYEl, "padding", "y");
      const thumbXOffset = getOffset(thumbXEl, "margin", "x");
      const thumbYOffset = getOffset(thumbYEl, "margin", "y");
      const idealNextWidth = nextWidth - scrollbarXOffset - thumbXOffset;
      const idealNextHeight = nextHeight - scrollbarYOffset - thumbYOffset;
      const maxNextWidth = scrollbarXEl ? Math.min(scrollbarXEl.offsetWidth - cornerWidthOffset, idealNextWidth) : idealNextWidth;
      const maxNextHeight = scrollbarYEl ? Math.min(scrollbarYEl.offsetHeight - cornerHeightOffset, idealNextHeight) : idealNextHeight;
      const clampedNextWidth = Math.max(MIN_THUMB_SIZE, maxNextWidth * ratioX);
      const clampedNextHeight = Math.max(MIN_THUMB_SIZE, maxNextHeight * ratioY);
      s.thumbSize = { width: clampedNextWidth, height: clampedNextHeight };

      if (scrollbarYEl && thumbYEl) {
        const maxThumbOffsetY = scrollbarYEl.offsetHeight - clampedNextHeight - scrollbarYOffset - thumbYOffset;
        const scrollRangeY = scrollableContentHeight - viewportHeight;
        const scrollRatioY = scrollRangeY === 0 ? 0 : scrollTop / scrollRangeY;
        // In Safari, scrollTop considers the rubber band effect.
        const thumbOffsetY = Math.min(maxThumbOffsetY, Math.max(0, scrollRatioY * maxThumbOffsetY));
        thumbYEl.style.transform = `translate3d(0,${thumbOffsetY}px,0)`;
      }
      if (scrollbarXEl && thumbXEl) {
        const maxThumbOffsetX = scrollbarXEl.offsetWidth - clampedNextWidth - scrollbarXOffset - thumbXOffset;
        const scrollRangeX = scrollableContentWidth - viewportWidth;
        const scrollRatioX = scrollRangeX === 0 ? 0 : scrollLeft / scrollRangeX;
        const thumbOffsetX =
          direction() === "rtl" ? clamp(scrollRatioX * maxThumbOffsetX, -maxThumbOffsetX, 0) : clamp(scrollRatioX * maxThumbOffsetX, 0, maxThumbOffsetX);
        thumbXEl.style.transform = `translate3d(${thumbOffsetX}px,0,0)`;
      }
      viewport.style.setProperty("--scroll-area-overflow-x-start", `${scrollLeftFromStart}px`);
      viewport.style.setProperty("--scroll-area-overflow-x-end", `${scrollLeftFromEnd}px`);
      viewport.style.setProperty("--scroll-area-overflow-y-start", `${scrollTopFromStart}px`);
      viewport.style.setProperty("--scroll-area-overflow-y-end", `${scrollTopFromEnd}px`);
      if (corner) s.cornerSize = x || y ? { width: 0, height: 0 } : { width: nextCornerWidth, height: nextCornerHeight };
      const hiddenChanged = s.hidden.x !== x || s.hidden.y !== y;
      s.hidden = nextHidden;
      s.overflowEdges = {
        xStart: !x && scrollLeftFromStart > 0,
        xEnd: !x && scrollLeftFromEnd > 0,
        yStart: !y && scrollTopFromStart > 0,
        yEnd: !y && scrollTopFromEnd > 0,
      };
      render();
      // The scrollbars mounted or unmounted: measure with them again.
      if (hiddenChanged) queueMicrotask(computeThumbPosition);
    }

    // ScrollAreaRoot's handleScroll.
    function handleScroll(position) {
      const offsetX = position.x - s.scrollPosition.x;
      const offsetY = position.y - s.scrollPosition.y;
      s.scrollPosition = position;
      if (offsetY !== 0) {
        s.scrollingY = true;
        scrollYTimeout.start(SCROLL_TIMEOUT, () => {
          s.scrollingY = false;
          render();
        });
      }
      if (offsetX !== 0) {
        s.scrollingX = true;
        scrollXTimeout.start(SCROLL_TIMEOUT, () => {
          s.scrollingX = false;
          render();
        });
      }
      render();
    }

    // Root: hovering and the touch modality.
    const handlePointerEnterOrMove = (event) => {
      s.touchModality = event.pointerType === "touch";
      if (event.pointerType !== "touch") s.hovering = root.contains(event.target);
      render();
    };
    root.addEventListener("pointerenter", handlePointerEnterOrMove);
    root.addEventListener("pointermove", handlePointerEnterOrMove);
    root.addEventListener("pointerdown", (event) => (s.touchModality = event.pointerType === "touch"));
    root.addEventListener("pointerleave", () => {
      s.hovering = false;
      render();
    });

    // Viewport
    viewport.addEventListener("scroll", () => {
      computeThumbPosition();
      if (!s.programmatic) handleScroll({ x: viewport.scrollLeft, y: viewport.scrollTop });
      // Momentum scrolling counts as user driven until it rests.
      scrollEndTimeout.start(100, () => (s.programmatic = true));
    });
    const userInteraction = () => (s.programmatic = false);
    ["wheel", "touchmove", "pointermove", "pointerenter", "keydown"].forEach((type) => viewport.addEventListener(type, userInteraction));

    // Scrollbar and thumb: the track press, the wheel and the thumb drag.
    scrollbars.forEach((bar) => {
      const el = bar.el;
      const orientation = el.getAttribute("data-orientation");
      const thumb = thumbOf(bar);
      el.addEventListener(
        "wheel",
        (event) => {
          if (event.ctrlKey) return;
          const horizontal = orientation === "horizontal";
          const scrollProperty = horizontal ? "scrollLeft" : "scrollTop";
          const delta = horizontal ? event.deltaX : event.deltaY;
          if (delta === 0) return;
          const maxScroll = horizontal ? viewport.scrollWidth - viewport.clientWidth : viewport.scrollHeight - viewport.clientHeight;
          const rtl = horizontal && direction() === "rtl";
          const minScroll = rtl ? -maxScroll : 0;
          const maxScrollValue = rtl ? 0 : maxScroll;
          const scrollValue = viewport[scrollProperty];
          // At an edge the wheel chains to the page.
          if ((scrollValue <= minScroll && delta < 0) || (scrollValue >= maxScrollValue && delta > 0)) return;
          event.preventDefault();
          viewport[scrollProperty] = Math.min(maxScrollValue, Math.max(minScroll, scrollValue + delta));
          handleScroll({ x: viewport.scrollLeft, y: viewport.scrollTop });
        },
        { passive: false },
      );
      el.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        if (thumb && thumb.contains(event.target)) return;
        const thumbOffset = getOffset(thumb, "margin", orientation === "vertical" ? "y" : "x");
        const barOffset = getOffset(el, "padding", orientation === "vertical" ? "y" : "x");
        const rect = el.getBoundingClientRect();
        if (orientation === "vertical") {
          const thumbHeight = thumb.offsetHeight;
          const clickY = event.clientY - rect.top - thumbHeight / 2 - barOffset + thumbOffset / 2;
          const maxThumbOffsetY = el.offsetHeight - thumbHeight - barOffset - thumbOffset;
          viewport.scrollTop = (clickY / maxThumbOffsetY) * (viewport.scrollHeight - viewport.clientHeight);
        } else {
          const thumbWidth = thumb.offsetWidth;
          const clickX = event.clientX - rect.left - thumbWidth / 2 - barOffset + thumbOffset / 2;
          const maxThumbOffsetX = el.offsetWidth - thumbWidth - barOffset - thumbOffset;
          const ratio = clickX / maxThumbOffsetX;
          let left;
          if (direction() === "rtl") {
            left = (1 - ratio) * (viewport.scrollWidth - viewport.clientWidth);
            if (viewport.scrollLeft <= 0) left = -left;
          } else {
            left = ratio * (viewport.scrollWidth - viewport.clientWidth);
          }
          viewport.scrollLeft = left;
        }
        handleScroll({ x: viewport.scrollLeft, y: viewport.scrollTop });
        handlePointerDown(event, orientation, thumb);
      });
      el.addEventListener("pointerup", handlePointerUp);
      el.addEventListener("pointercancel", handlePointerUp);
      if (!thumb) return;
      thumb.addEventListener("pointerdown", (event) => handlePointerDown(event, orientation, thumb));
      thumb.addEventListener("pointermove", (event) => handlePointerMove(event, thumb));
      const endDrag = (event) => {
        if (orientation === "vertical") s.scrollingY = false;
        else s.scrollingX = false;
        handlePointerUp(event);
        render();
      };
      thumb.addEventListener("pointerup", endDrag);
      thumb.addEventListener("pointercancel", endDrag);
    });

    function handlePointerDown(event, orientation, thumb) {
      if (event.button !== 0) return;
      s.dragging = true;
      s.start = { x: event.clientX, y: event.clientY, top: viewport.scrollTop, left: viewport.scrollLeft };
      s.orientation = orientation;
      s.dragThumb = thumb;
      thumb?.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event, thumb) {
      if (!s.dragging) return;
      const bar = thumb.parentElement;
      if (s.orientation === "vertical") {
        const maxThumbOffsetY = bar.offsetHeight - thumb.offsetHeight - getOffset(bar, "padding", "y") - getOffset(thumb, "margin", "y");
        viewport.scrollTop = s.start.top + ((event.clientY - s.start.y) / maxThumbOffsetY) * (viewport.scrollHeight - viewport.clientHeight);
        event.preventDefault();
        s.scrollingY = true;
        scrollYTimeout.start(SCROLL_TIMEOUT, () => {
          s.scrollingY = false;
          render();
        });
      } else {
        const maxThumbOffsetX = bar.offsetWidth - thumb.offsetWidth - getOffset(bar, "padding", "x") - getOffset(thumb, "margin", "x");
        viewport.scrollLeft = s.start.left + ((event.clientX - s.start.x) / maxThumbOffsetX) * (viewport.scrollWidth - viewport.clientWidth);
        event.preventDefault();
        s.scrollingX = true;
        scrollXTimeout.start(SCROLL_TIMEOUT, () => {
          s.scrollingX = false;
          render();
        });
      }
      render();
    }

    function handlePointerUp(event) {
      s.dragging = false;
      // pointercancel releases capture implicitly.
      if (s.dragThumb?.hasPointerCapture(event.pointerId)) s.dragThumb.releasePointerCapture(event.pointerId);
    }

    // The viewport resizes and the content changes.
    let initialized = false;
    const resizeObserver = new ResizeObserver(() => {
      if (!initialized) {
        initialized = true;
        const m = s.lastMetrics;
        if (m[0] === viewport.clientHeight && m[1] === viewport.scrollHeight && m[2] === viewport.clientWidth && m[3] === viewport.scrollWidth) return;
      }
      computeThumbPosition();
    });
    resizeObserver.observe(viewport);
    root._templScrollArea = { resizeObserver };
    // onMouseEnter does not fire upon load.
    if (viewport.matches(":hover")) s.hovering = true;
    queueMicrotask(computeThumbPosition);
  }

  window.templ.lifecycle.register(ROOT, {
    init,
    destroy(root) {
      root._templScrollArea?.resizeObserver.disconnect();
    },
  });
})();
