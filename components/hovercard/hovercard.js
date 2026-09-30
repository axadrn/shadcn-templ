(function () {
  const CONTENT = '[data-slot="hover-card-content"]';
  // Base UI links PreviewCard.Trigger to its card through context only; the
  // port marker carries the card id.
  const TRIGGER = "[data-templ-hover-card-trigger]";

  function contentFor(trigger) {
    return document.getElementById(trigger.getAttribute("data-templ-hover-card-trigger"));
  }

  function triggerFor(content) {
    return document.querySelector(
      '[data-templ-hover-card-trigger="' + content.id + '"]',
    );
  }

  // Base UI's PreviewCardPositioner, the popup's parent: it is portaled and
  // positioned and renders the open state.
  function positionerOf(content) {
    return content.parentElement;
  }

  function statusOf(content) {
    return { positioner: positionerOf(content), parts: [content] };
  }

  // The positioner's parent is the portal node, which moves to <body>
  // (shadcn portals it the same way).
  function portalNodeOf(content) {
    return positionerOf(content).parentElement;
  }

  function portal(content) {
    window.templ.portal.render(portalNodeOf(content));
  }

  // ----- inline triggers (utils/popups/inlineRect.ts) ------------------------
  // A trigger that wraps over several lines anchors the card to the line the
  // pointer is on, like Floating UI's inline() with Base UI's line grouping.

  function createRect(left, top, right, bottom) {
    return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top };
  }

  function getLineRects(rects) {
    const lines = [];
    let previousRect;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const rect of Array.from(rects).sort((a, b) => a.top - b.top)) {
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
      if (!previousRect || rect.top - previousRect.top > previousRect.height / 2) {
        lines.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      } else {
        const line = lines[lines.length - 1];
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
        line.bottom = Math.max(line.bottom, rect.bottom);
        line.width = line.right - line.left;
        line.height = line.bottom - line.top;
      }
      previousRect = rect;
    }
    return { lines, fallback: createRect(left, top, right, bottom) };
  }

  function findLineIndex(lines, x, y) {
    return lines.findIndex((line) => x > line.left - 2 && x < line.right + 2 && y > line.top - 2 && y < line.bottom + 2);
  }

  function updateInlineRectCoords(content, element, clientX, clientY) {
    const { lines } = getLineRects(element.getClientRects());
    if (lines.length < 2) {
      content._templInlineCoords = undefined;
      return;
    }
    const lineIndex = findLineIndex(lines, clientX, clientY);
    content._templInlineCoords = { x: clientX, y: clientY, lineIndex: lineIndex === -1 ? undefined : lineIndex, element };
  }

  function getInlineReferenceRect(reference, placement, coords) {
    const { lines, fallback } = getLineRects(reference.getClientRects());
    if (lines.length < 2) return null;
    const x = coords?.x;
    const y = coords?.y;
    const side = placement[0];
    if (coords?.lineIndex != null && lines[coords.lineIndex]) {
      const line = lines[coords.lineIndex];
      return createRect(line.left, line.top, line.right, line.bottom);
    }
    if (x != null && y != null) {
      const lineIndex = findLineIndex(lines, x, y);
      if (lineIndex !== -1) {
        const line = lines[lineIndex];
        return createRect(line.left, line.top, line.right, line.bottom);
      }
    }
    if (lines.length === 2 && lines[0].left > lines[1].right && x != null && y != null) return fallback;
    if (side === "t" || side === "b") {
      const firstRect = lines[0];
      const lastRect = lines[lines.length - 1];
      const targetRect = side === "t" ? firstRect : lastRect;
      return createRect(targetRect.left, firstRect.top, targetRect.right, lastRect.bottom);
    }
    const isLeft = side === "l";
    let left = lines[0].left;
    let right = lines[0].right;
    let edge = isLeft ? Infinity : -Infinity;
    let targetFirstRect = lines[0];
    let targetLastRect = lines[0];
    for (const rect of lines) {
      left = Math.min(left, rect.left);
      right = Math.max(right, rect.right);
      const nextEdge = isLeft ? rect.left : rect.right;
      if ((isLeft && nextEdge < edge) || (!isLeft && nextEdge > edge)) {
        edge = nextEdge;
        targetFirstRect = rect;
        targetLastRect = rect;
      } else if (nextEdge === edge) {
        targetLastRect = rect;
      }
    }
    return createRect(left, targetFirstRect.top, right, targetLastRect.bottom);
  }

  function inlineMiddleware(content) {
    return {
      name: "inline",
      async fn(state) {
        const reference = state.elements.reference;
        if (typeof reference?.getClientRects !== "function") return {};
        const coords = content._templInlineCoords;
        const rect = getInlineReferenceRect(reference, state.placement, coords?.element === reference ? coords : undefined);
        if (!rect) return {};
        const resetRects = await state.platform.getElementRects({
          reference: { contextElement: reference, getBoundingClientRect: () => rect },
          floating: state.elements.floating,
          strategy: state.strategy,
        });
        const r = state.rects.reference;
        const n = resetRects.reference;
        if (r.x === n.x && r.y === n.y && r.width === n.width && r.height === n.height) return {};
        return { reset: { rects: resetRects } };
      },
    };
  }

  // PreviewCardPositioner: useAnchorPositioning with the popup collision
  // avoidance and the inline middleware, while the card is mounted.
  function startAutoPositioning(content, trigger) {
    stopAutoPositioning(content);
    const positioner = positionerOf(content);
    const positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor: trigger,
      positioner,
      parts: [positioner, content],
      side: positioner.getAttribute("data-templ-side") || "bottom",
      align: positioner.getAttribute("data-templ-align") || "center",
      sideOffset: parseFloat(positioner.getAttribute("data-templ-side-offset")) || 0,
      alignOffset: parseFloat(positioner.getAttribute("data-templ-align-offset")) || 0,
      inline: inlineMiddleware(content),
    });
    content._templPositionCleanup = positioning.cleanup;
    return positioning.positioned;
  }

  function stopAutoPositioning(content) {
    if (!content._templPositionCleanup) return;
    content._templPositionCleanup();
    content._templPositionCleanup = null;
  }

  // details { reason, event } of the change, for the hover interaction.
  function open(content, trigger, details = {}) {
    content._templOpen = true;
    content._templOpenEventType = details.event?.type ?? null;
    portal(content);
    positionerOf(content).hidden = false;
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: positionerOf(content),
      reference: trigger,
      onOpenChange: (open, reason, event) => requestOpenChange(content, open, { reason, event }),
    });
    emitOpenChange(content, true, details.reason);

    // Positioned first, then the enter animation plays in place.
    startAutoPositioning(content, trigger).then(() => {
      if (positionerOf(content).hidden) return; // closed meanwhile
      window.templ.transition.open(statusOf(content));
      trigger.setAttribute("data-popup-open", "");
    });
  }

  function close(content, details = {}) {
    if (positionerOf(content).hidden) return;
    content._templOpen = false;
    content._templOpenEventType = null;
    emitOpenChange(content, false, details.reason);
    triggerFor(content)?.removeAttribute("data-popup-open");
    content._templDismiss?.();
    content._templDismiss = null;
    // Positioned until it unmounts, like Base UI.
    window.templ.transition.close(statusOf(content), content, () => {
      stopAutoPositioning(content);
      positionerOf(content).hidden = true;
      content._templInlineCoords = undefined;
    });
  }

  function requestOpenChange(content, nextOpen, details) {
    if (!!content._templOpen === nextOpen) return false;
    const trigger = triggerFor(content);
    const change = new CustomEvent("hovercard-open-change", {
      bubbles: true,
      cancelable: true,
      detail: { open: nextOpen },
    });
    const accepted = (trigger || content).dispatchEvent(change);
    if (!accepted || content.hasAttribute("data-templ-open")) return false;
    if (nextOpen && trigger) open(content, trigger, details);
    else if (!nextOpen) close(content, details);
    return true;
  }

  // PreviewCardTrigger's useHoverReferenceInteraction and PreviewCardPopup's
  // useHoverFloatingInteraction, with the trigger's delay and closeDelay.
  function startHover(content, trigger) {
    const hover = window.templ.hover;
    const positioner = positionerOf(content);
    const delay = () => ({
      open: parseInt(trigger.getAttribute("data-templ-delay"), 10) || 600,
      close: parseInt(trigger.getAttribute("data-templ-close-delay"), 10) || 300,
    });
    content._templHover = hover.createHoverInteraction({
      isOpen: () => !!content._templOpen,
      onOpenChange: (open, reason, event) => requestOpenChange(content, open, { reason, event }),
      openEventType: () => content._templOpenEventType ?? null,
      domReference: () => trigger,
      floating: () => (positioner.hidden ? null : positioner),
      placement: () => positioner.getAttribute("data-side") || "bottom",
      triggers: () => [trigger],
      parentFloating: () => null,
    });
    content._templHoverCleanups = [
      hover.useHoverReferenceInteraction(trigger, content._templHover, {
        mouseOnly: true,
        move: false,
        handleClose: hover.safePolygon(),
        delay,
        isClosing: () => window.templ.transition.isEnding(content),
      }),
      hover.useHoverFloatingInteraction(content._templHover, { closeDelay: () => delay().close }),
    ];
    // PreviewCardTrigger's useFocus with the trigger's open delay.
    content._templFocusOpen = window.templ.focus.useFocus(trigger, content._templHover.context, {
      delay: () => delay().open,
    });
  }

  // The store's openchange event, for the trigger's interactions.
  function emitOpenChange(content, open, reason) {
    content._templHover?.openChange(open, reason);
    content._templFocusOpen?.openChange(open, reason);
  }

  function stopHover(content) {
    content._templFocusOpen?.cleanup();
    content._templFocusOpen = null;
    content._templHoverCleanups?.forEach((cleanup) => cleanup());
    content._templHoverCleanups = null;
    content._templHover?.dispose();
    content._templHover = null;
  }

  // PreviewCardTrigger's inline rect props: the line of a wrapped link the
  // pointer is on anchors the card.
  document.addEventListener("mouseover", (e) => {
    const trigger = e.target instanceof Element && e.target.closest(TRIGGER);
    const content = trigger && contentFor(trigger);
    if (content && !content.hasAttribute("data-open")) updateInlineRectCoords(content, trigger, e.clientX, e.clientY);
  });

  document.addEventListener("mousemove", (e) => {
    const trigger = e.target instanceof Element && e.target.closest(TRIGGER);
    const content = trigger && contentFor(trigger);
    if (content && !content.hasAttribute("data-open")) updateInlineRectCoords(content, trigger, e.clientX, e.clientY);
  });

  document.addEventListener("focusin", (e) => {
    const trigger = e.target instanceof Element && e.target.closest(TRIGGER);
    const content = trigger && contentFor(trigger);
    if (content) content._templInlineCoords = undefined;
  });

  // Content stays in its hidden portal node until it opens. It unmounts with
  // its portal owner: a portaled one is removed from <body> then.
  window.templ.lifecycle.register(CONTENT, {
    init(content) {
      const trigger = triggerFor(content);
      if (!trigger) return;
      startHover(content, trigger);
      // Server-side open state (Base UI open or defaultOpen).
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        open(content, trigger);
      }
    },
    destroy(content) {
      stopHover(content);
      stopAutoPositioning(content);
      content._templDismiss?.();
      window.templ.portal.remove(portalNodeOf(content));
    },
  });
})();
