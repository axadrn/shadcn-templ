// Port of @base-ui/react floating-ui-react/hooks/useDismiss.ts (1.6.0).
// Closes an open popup on Escape and on a press outside of it.
//
// useDismiss(options) runs while the popup is open, like the source's effect:
// call it on open and call the cleanup it returns on close.
//
//   floating           the popup element (required)
//   reference          the trigger element, or a list of them (the input for a combobox)
//   onOpenChange(open, reason, event)  requests the close, returns true when accepted
//   escapeKey          true, or a function read on every key press
//   outsidePress       true, false, or a function(event) that returns whether to dismiss
//   outsidePressEvent  "sloppy" (press), "intentional" (click), { mouse, touch }, or a function
//   referencePress     false, true, or a function: a press on the reference closes
//   bubbles            true, or { escapeKey, outsidePress }
//
// What differs from the source comes from having no React tree:
// - Base UI marks events inside its React tree, portals included. Here that tree
//   is the DOM plus the portal owners from portal.js, see withinTree.
// - The floating tree is every open useDismiss: a child is one whose popup lies
//   inside this popup's tree.
// - Options React re-reads on every render may be functions, read per event.
(function () {
  "use strict";

  const webkit = typeof CSS !== "undefined" && !!CSS.supports?.("-webkit-backdrop-filter:none");

  // Open instances, the FloatingTree pendant.
  const instances = new Set();

  // IME composition: Escape that settles a composition closes the compose
  // menu, not the popup. Safari fires compositionend before keydown.
  let isComposing = false;
  let compositionTimer = 0;
  document.addEventListener("compositionstart", () => {
    clearTimeout(compositionTimer);
    isComposing = true;
  });
  document.addEventListener("compositionend", () => {
    compositionTimer = setTimeout(() => {
      isComposing = false;
    }, webkit ? 5 : 0);
  });

  function getTarget(event) {
    return event.composedPath?.()[0] || event.target;
  }

  function contains(parent, child) {
    return !!parent && !!child && (parent === child || parent.contains(child));
  }

  // The React tree pendant: up through the DOM, and from a portaled element
  // on to the place it was declared.
  function withinTree(root, target) {
    for (let node = target; node; node = window.templ.portal.treeParent(node)) {
      if (node === root) return true;
    }
    return false;
  }

  function isLastTraversableNode(node) {
    return ["html", "body", "#document"].includes(node.nodeName.toLowerCase());
  }

  function normalizeBubbles(bubbles) {
    return {
      escapeKey: typeof bubbles === "boolean" ? bubbles : bubbles?.escapeKey ?? false,
      outsidePress: typeof bubbles === "boolean" ? bubbles : bubbles?.outsidePress ?? true,
    };
  }

  function useDismiss(options) {
    const {
      floating,
      onOpenChange,
      escapeKey = true,
      outsidePress = true,
      outsidePressEvent = "sloppy",
      referencePress = false,
    } = options;
    const { reference } = options;
    const references = (reference instanceof Element ? [reference] : [...(reference || [])]).filter(Boolean);
    const bubbles = normalizeBubbles(options.bubbles);
    const self = { floating, bubbles, active: true };

    let pressStartedInside = false;
    let pressStartPrevented = false;
    // Ignore only the very next outside click after dragging from inside to outside.
    let suppressNextOutsideClick = false;
    let currentPointerType = "";
    let touchState = null;
    let cancelDismissOnEndTimer = 0;
    let preventedPressSuppressionTimer = 0;

    const read = (value) => (typeof value === "function" ? value() : value);

    function hasBlockingChild(bubbleKey) {
      for (const other of instances) {
        if (other !== self && withinTree(floating, other.floating) && !other.bubbles[bubbleKey]) return true;
      }
      return false;
    }

    function isEventWithinOwnElements(event) {
      const target = getTarget(event);
      return contains(floating, target) || references.some((reference) => contains(reference, target));
    }

    function close(reason, event) {
      return self.active && onOpenChange(false, reason, event);
    }

    function closeOnEscapeKeyDown(event) {
      if (!self.active || !read(escapeKey) || event.key !== "Escape") return;
      if (isComposing) return;
      if (!bubbles.escapeKey && hasBlockingChild("escapeKey")) return;
      if (close("escape-key", event)) event.preventDefault();
      if (!bubbles.escapeKey) event.stopPropagation();
    }

    // The popup's own press handlers (the source's floating props).
    function markPressStartedInside(event) {
      if (event.button !== 0) return;
      // Only presses that start in the popup's DOM subtree count as inside,
      // so a nested portal does not suppress the parent's dismissal.
      if (!contains(floating, getTarget(event))) return;
      if (!pressStartedInside) {
        pressStartedInside = true;
        pressStartPrevented = false;
      }
    }

    function markInsidePressStartPrevented(event) {
      if (event.defaultPrevented && pressStartedInside) pressStartPrevented = true;
    }

    function getOutsidePressEvent() {
      const type = currentPointerType === "pen" || !currentPointerType ? "mouse" : currentPointerType;
      const value = read(outsidePressEvent);
      return typeof value === "string" ? value : value[type];
    }

    function shouldIgnoreEvent(event) {
      const mode = getOutsidePressEvent();
      return (mode === "intentional" && event.type !== "click") || (mode === "sloppy" && event.type === "click");
    }

    function suppressImmediateOutsideClickAfterPreventedStart() {
      suppressNextOutsideClick = true;
      clearTimeout(preventedPressSuppressionTimer);
      preventedPressSuppressionTimer = setTimeout(() => {
        suppressNextOutsideClick = false;
      }, 0);
    }

    function resetPressStartState() {
      pressStartedInside = false;
      pressStartPrevented = false;
    }

    function closeOnPressOutside(event) {
      if (!self.active) return;
      if (shouldIgnoreEvent(event)) {
        // A new press began outside the popup and its trigger. Clear any
        // leftover drag-out suppression so this press's click can dismiss.
        if (event.type !== "click" && !isEventWithinOwnElements(event)) {
          clearTimeout(preventedPressSuppressionTimer);
          suppressNextOutsideClick = false;
        }
        return;
      }
      const target = getTarget(event);
      // Inside the popup's tree, portaled children included.
      if (withinTree(floating, target)) return;
      // Another trigger of this popup was pressed.
      if (references.some((reference) => contains(reference, target))) return;

      // A press on a third party element injected after the popup opened:
      // its top level ancestor carries none of the data-base-ui-inert markers
      // markOthers set when it opened.
      const targetRoot = target instanceof Element ? target.getRootNode() : null;
      const isShadowRoot = typeof ShadowRoot !== "undefined" && targetRoot instanceof ShadowRoot;
      const markers = Array.from((isShadowRoot ? targetRoot : floating.ownerDocument).querySelectorAll("[data-base-ui-inert]"));
      let targetRootAncestor = target instanceof Element ? target : null;
      while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
        const nextParent = targetRootAncestor.assignedSlot || targetRootAncestor.parentNode ||
          (targetRootAncestor.parentNode instanceof ShadowRoot ? targetRootAncestor.parentNode.host : null);
        if (!nextParent || isLastTraversableNode(nextParent) || !(nextParent instanceof Element)) break;
        targetRootAncestor = nextParent;
      }
      if (markers.length && target instanceof Element && !target.matches("html,body") &&
        !contains(target, floating) && markers.every((marker) => !contains(targetRootAncestor, marker))) {
        return;
      }

      // A press on a scrollbar. Touch never hits a scrollbar.
      if (target instanceof HTMLElement && !("touches" in event)) {
        const lastTraversableNode = isLastTraversableNode(target);
        const style = getComputedStyle(target);
        const scrollRe = /auto|scroll/;
        const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
        const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);
        const canScrollX = isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
        const canScrollY = isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;
        const isRTL = style.direction === "rtl";
        const pressedVerticalScrollbar = canScrollY &&
          (isRTL ? event.offsetX <= target.offsetWidth - target.clientWidth : event.offsetX > target.clientWidth);
        const pressedHorizontalScrollbar = canScrollX && event.offsetY > target.clientHeight;
        if (pressedVerticalScrollbar || pressedHorizontalScrollbar) return;
      }

      // In intentional mode, a press that starts inside and ends outside gets
      // one suppressed outside click.
      if (getOutsidePressEvent() === "intentional" && suppressNextOutsideClick) {
        clearTimeout(preventedPressSuppressionTimer);
        suppressNextOutsideClick = false;
        return;
      }
      if (typeof outsidePress === "function" && !outsidePress(event)) return;
      if (hasBlockingChild("outsidePress")) return;
      close("outside-press", event);
    }

    function handlePointerDown(event) {
      if (getOutsidePressEvent() !== "sloppy" || event.pointerType === "touch" || isEventWithinOwnElements(event)) return;
      closeOnPressOutside(event);
    }

    function handleTouchStart(event) {
      if (getOutsidePressEvent() !== "sloppy" || isEventWithinOwnElements(event)) return;
      const touch = event.touches[0];
      if (!touch) return;
      touchState = {
        startX: touch.clientX,
        startY: touch.clientY,
        dismissOnTouchEnd: false,
        dismissOnMouseDown: true,
      };
      clearTimeout(cancelDismissOnEndTimer);
      cancelDismissOnEndTimer = setTimeout(() => {
        if (touchState) {
          touchState.dismissOnTouchEnd = false;
          touchState.dismissOnMouseDown = false;
        }
      }, 1000);
    }

    // Runs the listener after the target's own handlers, in the bubble phase
    // of the target, like the source.
    function addTargetEventListenerOnce(event, listener) {
      const target = getTarget(event);
      if (!target) return;
      const once = () => {
        target.removeEventListener(event.type, once);
        listener(event);
      };
      target.addEventListener(event.type, once);
    }

    function handleTouchStartCapture(event) {
      currentPointerType = "touch";
      addTargetEventListenerOnce(event, handleTouchStart);
    }

    function closeOnPressOutsideCapture(event) {
      clearTimeout(cancelDismissOnEndTimer);
      if (event.type === "pointerdown") currentPointerType = event.pointerType;
      if (event.type === "mousedown" && touchState && !touchState.dismissOnMouseDown) return;
      addTargetEventListenerOnce(event, (targetEvent) => {
        if (targetEvent.type === "pointerdown") handlePointerDown(targetEvent);
        else closeOnPressOutside(targetEvent);
      });
    }

    function handlePressEndCapture(event) {
      if (!pressStartedInside) return;
      const startPrevented = pressStartPrevented;
      resetPressStartState();
      if (getOutsidePressEvent() !== "intentional") return;
      if (event.type === "pointercancel") {
        if (startPrevented) suppressImmediateOutsideClickAfterPreventedStart();
        return;
      }
      if (withinTree(floating, getTarget(event))) return;
      if (startPrevented) {
        suppressImmediateOutsideClickAfterPreventedStart();
        return;
      }
      if (typeof outsidePress === "function" && !outsidePress(event)) return;
      clearTimeout(preventedPressSuppressionTimer);
      suppressNextOutsideClick = true;
    }

    function handleTouchMove(event) {
      if (getOutsidePressEvent() !== "sloppy" || !touchState || isEventWithinOwnElements(event)) return;
      const touch = event.touches[0];
      if (!touch) return;
      const distance = Math.hypot(touch.clientX - touchState.startX, touch.clientY - touchState.startY);
      if (distance > 5) touchState.dismissOnTouchEnd = true;
      if (distance > 10) {
        closeOnPressOutside(event);
        clearTimeout(cancelDismissOnEndTimer);
        touchState = null;
      }
    }

    function handleTouchEnd(event) {
      if (getOutsidePressEvent() !== "sloppy" || !touchState || isEventWithinOwnElements(event)) return;
      if (touchState.dismissOnTouchEnd) closeOnPressOutside(event);
      clearTimeout(cancelDismissOnEndTimer);
      touchState = null;
    }

    // The reference's onPointerDown and onClick.
    function closeOnReferencePress(event) {
      if (!read(referencePress)) return;
      close("trigger-press", event);
    }

    const listeners = [
      ...references.map((reference) => [reference, "pointerdown", closeOnReferencePress]),
      ...references.map((reference) => [reference, "click", closeOnReferencePress]),
      [document, "keydown", closeOnEscapeKeyDown],
      ...references.map((reference) => [reference, "keydown", closeOnEscapeKeyDown]),
      [floating, "keydown", closeOnEscapeKeyDown],
      [floating, "pointerdown", markPressStartedInside, true],
      [floating, "mousedown", markPressStartedInside, true],
      [floating, "pointerdown", markInsidePressStartPrevented],
      [floating, "mousedown", markInsidePressStartPrevented],
    ];
    if (outsidePress !== false) {
      listeners.push(
        [document, "click", closeOnPressOutsideCapture, true],
        [document, "pointerdown", closeOnPressOutsideCapture, true],
        [document, "pointerup", handlePressEndCapture, true],
        [document, "pointercancel", handlePressEndCapture, true],
        [document, "mousedown", closeOnPressOutsideCapture, true],
        [document, "mouseup", handlePressEndCapture, true],
        [document, "touchstart", handleTouchStartCapture, true],
        [document, "touchmove", (event) => addTargetEventListenerOnce(event, handleTouchMove), true],
        [document, "touchend", (event) => addTargetEventListenerOnce(event, handleTouchEnd), true],
      );
    }
    listeners.forEach(([target, type, listener, capture]) => target.addEventListener(type, listener, !!capture));
    instances.add(self);

    return function cleanup() {
      if (!self.active) return;
      self.active = false;
      instances.delete(self);
      listeners.forEach(([target, type, listener, capture]) => target.removeEventListener(type, listener, !!capture));
      clearTimeout(cancelDismissOnEndTimer);
      clearTimeout(preventedPressSuppressionTimer);
    };
  }

  window.templ = window.templ || {};
  window.templ.dismiss = { useDismiss };
})();
