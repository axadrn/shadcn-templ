// Port of @base-ui/react floating-ui-react hooks/useHoverReferenceInteraction.ts,
// hooks/useHoverFloatingInteraction.ts, hooks/useHoverInteractionSharedState.ts,
// hooks/useHoverShared.ts and safePolygon.ts (1.6.0). Opens a popup while
// the pointer rests on its trigger and closes it when the pointer leaves
// both, through the safe triangle toward the popup.
//
//   const hover = window.templ.hover.createHoverInteraction(context)
//   const cleanup = window.templ.hover.useHoverReferenceInteraction(trigger, hover, options)
//   const cleanup = window.templ.hover.useHoverFloatingInteraction(hover, options)
//   hover.openChange(open, reason)   after every open change, the store's openchange
//   hover.dispose()                  when the component unmounts
//
// context is the floating root context, as functions:
//   isOpen()                      open
//   onOpenChange(open, reason, event)   store.setOpen
//   openEventType()               the type of the event that opened it, or null
//   domReference()                the active trigger
//   floating()                    the positioner while mounted, else null
//   placement()                   the rendered side, like "right"
//   triggers()                    every trigger element
//   parentFloating()              the floating element of the parent node, or null
//
// Reference options: enabled(), delay (number, { open, close } or fn),
// handleClose (safePolygon()), mouseOnly, restMs (number or fn), move,
// isClosing(), shouldOpen().
// Floating options: enabled(), closeDelay (number or fn).
//
// The floating tree is every open hover context: a child is one whose
// floating element lies inside this one's tree, see use_dismiss.js.
(function () {
  "use strict";

  const t = () => window.templ.tabbable;
  const TYPEABLE_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";

  // @base-ui/utils/useTimeout's Timeout.
  class Timeout {
    constructor() {
      this.id = 0;
    }
    start(delay, fn) {
      this.clear();
      this.id = setTimeout(() => {
        this.id = 0;
        fn();
      }, delay);
    }
    isStarted() {
      return this.id !== 0;
    }
    clear() {
      clearTimeout(this.id);
      this.id = 0;
    }
  }

  // The React tree pendant: up through the DOM, and from a portaled node to
  // where it was declared.
  function withinTree(root, target) {
    for (let node = target; node; node = window.templ.portal.treeParent(node)) {
      if (node === root) return true;
    }
    return false;
  }

  // ----- the floating tree ---------------------------------------------------

  const contexts = new Set();
  const closedListeners = new Set();

  // getNodeChildren: the open descendants of a floating element.
  function openChildrenOf(floating) {
    if (!floating) return [];
    return [...contexts].filter((other) => {
      const otherFloating = other.floating();
      return otherFloating && otherFloating !== floating && other.isOpen() && withinTree(floating, otherFloating);
    });
  }

  function emitClosed(event) {
    [...closedListeners].forEach((listener) => listener(event));
  }

  // ----- useHoverShared.ts ---------------------------------------------------

  const isMouseLikePointerType = (pointerType) => ["mouse", "pen", "", undefined].includes(pointerType);

  function resolveValue(value, pointerType) {
    if (pointerType != null && !isMouseLikePointerType(pointerType)) return 0;
    return typeof value === "function" ? value() : value;
  }

  function getDelay(value, prop, pointerType) {
    const result = resolveValue(value, pointerType);
    return typeof result === "number" ? result : result?.[prop];
  }

  function getRestMs(value) {
    return typeof value === "function" ? value() : value;
  }

  function isClickLikeOpenEvent(openEventType, interactedInside) {
    return interactedInside || openEventType === "click" || openEventType === "mousedown";
  }

  function isHoverOpenEvent(openEventType) {
    return !!openEventType?.includes("mouse") && openEventType !== "mousedown";
  }

  function isInsideEnabledTrigger(target, triggers) {
    if (!(target instanceof Element)) return false;
    const trigger = triggers.find((element) => t().contains(element, target));
    return !!trigger && !trigger.hasAttribute("data-trigger-disabled");
  }

  function isInteractiveElement(element) {
    return element?.closest?.(`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${TYPEABLE_SELECTOR}`) != null;
  }

  // ----- useHoverInteractionSharedState.ts -----------------------------------

  const pointerEventsMutationOwnerByScopeElement = new WeakMap();

  function clearSafePolygonPointerEventsMutation(instance) {
    if (!instance.performedPointerEventsMutation) return;
    const scopeElement = instance.pointerEventsScopeElement;
    if (scopeElement && pointerEventsMutationOwnerByScopeElement.get(scopeElement) === instance) {
      instance.pointerEventsScopeElement?.style.removeProperty("pointer-events");
      instance.pointerEventsReferenceElement?.style.removeProperty("pointer-events");
      instance.pointerEventsFloatingElement?.style.removeProperty("pointer-events");
      pointerEventsMutationOwnerByScopeElement.delete(scopeElement);
    }
    instance.performedPointerEventsMutation = false;
    instance.pointerEventsScopeElement = null;
    instance.pointerEventsReferenceElement = null;
    instance.pointerEventsFloatingElement = null;
  }

  function applySafePolygonPointerEventsMutation(instance, { scopeElement, referenceElement, floatingElement }) {
    const existingOwner = pointerEventsMutationOwnerByScopeElement.get(scopeElement);
    if (existingOwner && existingOwner !== instance) clearSafePolygonPointerEventsMutation(existingOwner);
    clearSafePolygonPointerEventsMutation(instance);
    instance.performedPointerEventsMutation = true;
    instance.pointerEventsScopeElement = scopeElement;
    instance.pointerEventsReferenceElement = referenceElement;
    instance.pointerEventsFloatingElement = floatingElement;
    pointerEventsMutationOwnerByScopeElement.set(scopeElement, instance);
    scopeElement.style.pointerEvents = "none";
    referenceElement.style.pointerEvents = "auto";
    floatingElement.style.pointerEvents = "auto";
  }

  // The HoverInteraction instance, shared by the reference and the floating
  // interaction of one popup, with the context it belongs to.
  function createHoverInteraction(context) {
    const openChangeListeners = new Set();
    const instance = {
      context,
      pointerType: undefined,
      interactedInside: false,
      handler: undefined,
      blockMouseMove: true,
      performedPointerEventsMutation: false,
      pointerEventsScopeElement: null,
      pointerEventsReferenceElement: null,
      pointerEventsFloatingElement: null,
      restTimeoutPending: false,
      openChangeTimeout: new Timeout(),
      restTimeout: new Timeout(),
      handleCloseOptions: undefined,
      onOpenChangeLocal: openChangeListeners,
      openChange(open, reason) {
        [...openChangeListeners].forEach((listener) => listener(open, reason));
      },
      dispose() {
        instance.openChangeTimeout.clear();
        instance.restTimeout.clear();
        contexts.delete(context);
      },
    };
    contexts.add(context);
    return instance;
  }

  // ----- useHoverReferenceInteraction.ts --------------------------------------

  function useHoverReferenceInteraction(trigger, instance, options = {}) {
    const {
      enabled = () => true,
      delay = 0,
      handleClose = null,
      mouseOnly = false,
      restMs = 0,
      move = true,
      isClosing,
      shouldOpen: shouldOpenProp,
    } = options;
    const context = instance.context;
    const doc = trigger.ownerDocument;
    let isHoverCloseActive = false;
    const cleanups = [];
    const on = (target, type, listener, opts) => {
      target.addEventListener(type, listener, opts);
      cleanups.push(() => target.removeEventListener(type, listener, opts));
    };

    const clickLike = () => isClickLikeOpenEvent(context.openEventType(), instance.interactedInside);
    const checkShouldOpen = () => shouldOpenProp?.() !== false;
    const isActiveTrigger = () => context.domReference() === trigger;

    function isOverInactiveTrigger(currentDomReference, currentTarget, target) {
      const allTriggers = context.triggers();
      if (allTriggers.includes(currentTarget)) {
        return !currentDomReference || !t().contains(currentDomReference, currentTarget);
      }
      if (!(target instanceof Element)) return false;
      return allTriggers.some((element) => t().contains(element, target)) &&
        (!currentDomReference || !t().contains(currentDomReference, target));
    }

    function cleanupMouseMoveHandler() {
      if (!instance.handler) return;
      doc.removeEventListener("mousemove", instance.handler);
      instance.handler = undefined;
    }

    const clearPointerEvents = () => clearSafePolygonPointerEventsMutation(instance);

    instance.handleCloseOptions = handleClose?.__options;

    // When closing before opening, clear the delay timeouts to cancel it
    // from showing.
    function onOpenChangeLocal(open, reason) {
      if (!open) {
        isHoverCloseActive = reason === "trigger-hover";
        cleanupMouseMoveHandler();
        instance.openChangeTimeout.clear();
        instance.restTimeout.clear();
        instance.blockMouseMove = true;
        instance.restTimeoutPending = false;
      } else {
        isHoverCloseActive = false;
      }
    }
    instance.onOpenChangeLocal.add(onOpenChangeLocal);
    cleanups.push(() => instance.onOpenChangeLocal.delete(onOpenChangeLocal));

    function setOpen(open, event) {
      context.onOpenChange(open, "trigger-hover", event);
    }

    function closeWithDelay(event, runElseBranch = true) {
      const closeDelay = getDelay(delay, "close", instance.pointerType);
      if (closeDelay) {
        instance.openChangeTimeout.start(closeDelay, () => {
          setOpen(false, event);
          emitClosed(event);
        });
      } else if (runElseBranch) {
        instance.openChangeTimeout.clear();
        setOpen(false, event);
        emitClosed(event);
      }
    }

    function onMouseEnter(event) {
      if (!enabled()) return;
      instance.openChangeTimeout.clear();
      instance.blockMouseMove = false;
      if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) return;
      // Only a rest delay is set, with no fallback delay: onMouseMove opens.
      const restMsValue = getRestMs(restMs);
      const openDelay = getDelay(delay, "open", instance.pointerType);
      const currentDomReference = context.domReference();
      const triggerNode = trigger;
      const isOverInactive = isOverInactiveTrigger(currentDomReference, triggerNode, event.target);
      const isOpen = context.isOpen();
      const isInClosingTransition = isClosing?.() ?? false;
      const isHoverCloseTransition = !isOpen && isInClosingTransition && isHoverCloseActive;
      const isReenteringSameTriggerDuringCloseTransition = !isOverInactive && currentDomReference instanceof Element &&
        t().contains(currentDomReference, triggerNode) && isHoverCloseTransition;
      const isRestOnlyDelay = restMsValue > 0 && !openDelay;
      const shouldOpenImmediately = (isOverInactive && (isOpen || isHoverCloseTransition)) || isReenteringSameTriggerDuringCloseTransition;
      const shouldOpen = !isOpen || isOverInactive;
      // Moving between triggers while open, or back during a hover close,
      // opens at once.
      if (shouldOpenImmediately) {
        if (checkShouldOpen()) setOpen(true, event);
        return;
      }
      if (isRestOnlyDelay) return;
      if (openDelay) {
        instance.openChangeTimeout.start(openDelay, () => {
          if (shouldOpen && checkShouldOpen()) setOpen(true, event);
        });
      } else if (shouldOpen && checkShouldOpen()) {
        setOpen(true, event);
      }
    }

    function onMouseLeave(event) {
      if (!enabled()) return;
      if (clickLike()) {
        clearPointerEvents();
        return;
      }
      cleanupMouseMoveHandler();
      instance.restTimeout.clear();
      instance.restTimeoutPending = false;
      if (isInsideEnabledTrigger(event.relatedTarget, context.triggers())) return;
      if (handleClose) {
        if (!context.isOpen()) instance.openChangeTimeout.clear();
        const currentTrigger = trigger;
        instance.handler = handleClose({
          x: event.clientX,
          y: event.clientY,
          placement: context.placement(),
          elements: { domReference: context.domReference(), floating: context.floating() },
          hasOpenChild: () => openChildrenOf(context.floating()).length > 0,
          onClose() {
            clearPointerEvents();
            cleanupMouseMoveHandler();
            if (enabled() && !clickLike() && currentTrigger === context.domReference()) closeWithDelay(event, true);
          },
        });
        doc.addEventListener("mousemove", instance.handler);
        instance.handler(event);
        return;
      }
      const shouldClose = instance.pointerType === "touch" ? !t().contains(context.floating(), event.relatedTarget) : true;
      if (shouldClose) closeWithDelay(event);
    }

    // The trigger's props.
    function setPointerRef(event) {
      instance.pointerType = event.pointerType;
    }

    function onMouseMove(event) {
      if (!enabled()) return;
      const currentDomReference = context.domReference();
      const currentOpen = context.isOpen();
      const isOverInactive = isOverInactiveTrigger(currentDomReference, trigger, event.target);
      if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) return;
      if (currentOpen && isOverInactive && instance.handleCloseOptions?.blockPointerEvents) {
        const floatingElement = context.floating();
        if (floatingElement) {
          applySafePolygonPointerEventsMutation(instance, {
            scopeElement: instance.handleCloseOptions?.getScope?.() ?? doc.body,
            referenceElement: trigger,
            floatingElement,
          });
        }
      }
      const restMsValue = getRestMs(restMs);
      if ((currentOpen && !isOverInactive) || restMsValue === 0) return;
      if (!isOverInactive && instance.restTimeoutPending && event.movementX ** 2 + event.movementY ** 2 < 2) return;
      instance.restTimeout.clear();
      function handleMouseMove() {
        instance.restTimeoutPending = false;
        // A delayed hover open does not override a click like open that
        // happened while the delay was pending.
        if (clickLike()) return;
        const latestOpen = context.isOpen();
        if (!instance.blockMouseMove && (!latestOpen || isOverInactive) && checkShouldOpen()) setOpen(true, event);
      }
      if (instance.pointerType === "touch" || (isOverInactive && currentOpen)) {
        handleMouseMove();
      } else {
        instance.restTimeoutPending = true;
        instance.restTimeout.start(restMsValue, handleMouseMove);
      }
    }

    on(trigger, "pointerdown", setPointerRef);
    on(trigger, "pointerenter", setPointerRef);
    on(trigger, "mousemove", onMouseMove);
    if (move) on(trigger, "mousemove", onMouseEnter, { once: true });
    on(trigger, "mouseenter", onMouseEnter);
    on(trigger, "mouseleave", onMouseLeave);
    return () => {
      cleanupMouseMoveHandler();
      cleanups.splice(0).forEach((cleanup) => cleanup());
      if (isActiveTrigger()) instance.handleCloseOptions = undefined;
    };
  }

  // ----- useHoverFloatingInteraction.ts ---------------------------------------

  function useHoverFloatingInteraction(instance, options = {}) {
    const { enabled = () => true, closeDelay = 0 } = options;
    const context = instance.context;
    const childClosedTimeout = new Timeout();
    const cleanups = [];
    let listening = null;

    const clickLike = () => isClickLikeOpenEvent(context.openEventType(), instance.interactedInside);
    const isHoverOpen = () => isHoverOpenEvent(context.openEventType());
    const clearPointerEvents = () => clearSafePolygonPointerEventsMutation(instance);

    // The source's layout effects on open.
    function onOpenChangeLocal(open) {
      if (!open) {
        instance.pointerType = undefined;
        instance.restTimeoutPending = false;
        instance.interactedInside = false;
        clearPointerEvents();
        return;
      }
      const reference = context.domReference();
      const floating = context.floating();
      if (!enabled() || !instance.handleCloseOptions?.blockPointerEvents || !isHoverOpen() || !(reference instanceof Element) || !floating) return;
      const parentFloating = context.parentFloating();
      if (parentFloating) parentFloating.style.pointerEvents = "";
      // A cached scope or parent that is the floating element itself would
      // not shield the sibling items in the parent menu.
      const cachedScopeElement = instance.pointerEventsScopeElement !== floating ? instance.pointerEventsScopeElement : null;
      const parentScopeElement = parentFloating !== floating ? parentFloating : null;
      const scopeElement = instance.handleCloseOptions?.getScope?.() ?? cachedScopeElement ?? parentScopeElement ??
        reference.closest("[data-rootownerid]") ?? floating.ownerDocument.body;
      applySafePolygonPointerEventsMutation(instance, { scopeElement, referenceElement: reference, floatingElement: floating });
    }
    instance.onOpenChangeLocal.add(onOpenChangeLocal);
    cleanups.push(() => instance.onOpenChangeLocal.delete(onOpenChangeLocal));

    function hasParentChildren() {
      return openChildrenOf(context.parentFloating()).length > 0;
    }

    function setClosed(event) {
      context.onOpenChange(false, "trigger-hover", event);
      emitClosed(event);
    }

    function closeWithDelay(event) {
      const delay = getDelay(closeDelay, "close", instance.pointerType);
      if (delay) {
        instance.openChangeTimeout.start(delay, () => setClosed(event));
      } else {
        instance.openChangeTimeout.clear();
        setClosed(event);
      }
    }

    function handleInteractInside(event) {
      if (!enabled()) return;
      const target = event.target;
      if (!isInteractiveElement(target)) {
        instance.interactedInside = false;
        return;
      }
      instance.interactedInside = target?.closest("[aria-haspopup]") != null;
    }

    function stopListening() {
      if (listening) closedListeners.delete(listening);
      listening = null;
    }

    // A child closed, maybe because the pointer moved into this parent: the
    // mouseenter gets a chance to fire first.
    function onNodeClosed(event) {
      if (!context.parentFloating() || hasParentChildren()) return;
      childClosedTimeout.start(0, () => {
        stopListening();
        setClosed(event);
      });
    }

    function onFloatingMouseEnter() {
      if (!enabled()) return;
      instance.openChangeTimeout.clear();
      childClosedTimeout.clear();
      stopListening();
      clearPointerEvents();
    }

    function onFloatingMouseLeave(event) {
      if (!enabled()) return;
      if (hasParentChildren()) {
        stopListening();
        listening = onNodeClosed;
        closedListeners.add(listening);
        return;
      }
      // Leaving toward another trigger moves the popup instead.
      if (isInsideEnabledTrigger(event.relatedTarget, context.triggers())) return;
      const relatedTarget = event.relatedTarget;
      const isMovingIntoDescendantFloating = relatedTarget instanceof Element &&
        openChildrenOf(context.floating()).some((child) => t().contains(child.floating(), relatedTarget));
      if (isMovingIntoDescendantFloating) return;
      // An active safePolygon handler decides the close.
      if (instance.handler) {
        instance.handler(event);
        return;
      }
      clearPointerEvents();
      if (isHoverOpen() && !clickLike()) closeWithDelay(event);
    }

    // The floating element mounts on open, so the listeners follow it.
    let floating = null;
    function attach() {
      const next = context.floating();
      if (next === floating) return;
      detach();
      floating = next;
      if (!floating) return;
      floating.addEventListener("mouseenter", onFloatingMouseEnter);
      floating.addEventListener("mouseleave", onFloatingMouseLeave);
      floating.addEventListener("pointerdown", handleInteractInside, true);
    }
    function detach() {
      if (!floating) return;
      floating.removeEventListener("mouseenter", onFloatingMouseEnter);
      floating.removeEventListener("mouseleave", onFloatingMouseLeave);
      floating.removeEventListener("pointerdown", handleInteractInside, true);
      floating = null;
    }
    const onOpenAttach = (open) => {
      if (open) attach();
    };
    instance.onOpenChangeLocal.add(onOpenAttach);
    cleanups.push(() => instance.onOpenChangeLocal.delete(onOpenAttach));
    attach();

    return () => {
      detach();
      stopListening();
      childClosedTimeout.clear();
      clearPointerEvents();
      cleanups.splice(0).forEach((cleanup) => cleanup());
    };
  }

  // ----- safePolygon.ts ------------------------------------------------------

  const CURSOR_SPEED_THRESHOLD = 0.1;
  const CURSOR_SPEED_THRESHOLD_SQUARED = CURSOR_SPEED_THRESHOLD * CURSOR_SPEED_THRESHOLD;
  const POLYGON_BUFFER = 0.5;

  function hasIntersectingEdge(pointX, pointY, xi, yi, xj, yj) {
    return yi >= pointY !== yj >= pointY && pointX <= ((xj - xi) * (pointY - yi)) / (yj - yi) + xi;
  }

  function isPointInQuadrilateral(pointX, pointY, x1, y1, x2, y2, x3, y3, x4, y4) {
    let isInsideValue = false;
    if (hasIntersectingEdge(pointX, pointY, x1, y1, x2, y2)) isInsideValue = !isInsideValue;
    if (hasIntersectingEdge(pointX, pointY, x2, y2, x3, y3)) isInsideValue = !isInsideValue;
    if (hasIntersectingEdge(pointX, pointY, x3, y3, x4, y4)) isInsideValue = !isInsideValue;
    if (hasIntersectingEdge(pointX, pointY, x4, y4, x1, y1)) isInsideValue = !isInsideValue;
    return isInsideValue;
  }

  function isInsideRect(pointX, pointY, rect) {
    return pointX >= rect.x && pointX <= rect.x + rect.width && pointY >= rect.y && pointY <= rect.y + rect.height;
  }

  function isInsideAxisAlignedRect(pointX, pointY, x1, y1, x2, y2) {
    return pointX >= Math.min(x1, x2) && pointX <= Math.max(x1, x2) && pointY >= Math.min(y1, y2) && pointY <= Math.max(y1, y2);
  }

  // A safe area the pointer can cross from the trigger to the popup without
  // closing it.
  function safePolygon(options = {}) {
    const { blockPointerEvents = false } = options;
    const timeout = new Timeout();
    const fn = ({ x, y, placement, elements, onClose, hasOpenChild }) => {
      const side = placement?.split("-")[0];
      let hasLanded = false;
      let lastX = null;
      let lastY = null;
      let lastCursorTime = performance.now();

      function isCursorMovingSlowly(nextX, nextY) {
        const currentTime = performance.now();
        const elapsedTime = currentTime - lastCursorTime;
        if (lastX === null || lastY === null || elapsedTime === 0) {
          lastX = nextX;
          lastY = nextY;
          lastCursorTime = currentTime;
          return false;
        }
        const deltaX = nextX - lastX;
        const deltaY = nextY - lastY;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        const thresholdSquared = elapsedTime * elapsedTime * CURSOR_SPEED_THRESHOLD_SQUARED;
        lastX = nextX;
        lastY = nextY;
        lastCursorTime = currentTime;
        return distanceSquared < thresholdSquared;
      }

      function close() {
        timeout.clear();
        onClose();
      }

      return function onMouseMove(event) {
        timeout.clear();
        const domReference = elements.domReference;
        const floating = elements.floating;
        if (!domReference || !floating || side == null || x == null || y == null) return;
        const { clientX, clientY } = event;
        const target = event.target;
        const isLeave = event.type === "mouseleave";
        const isOverFloatingEl = t().contains(floating, target);
        const isOverReferenceEl = t().contains(domReference, target);
        if (isOverFloatingEl) {
          hasLanded = true;
          if (!isLeave) return;
        }
        if (isOverReferenceEl) {
          hasLanded = false;
          if (!isLeave) {
            hasLanded = true;
            return;
          }
        }
        // An overlapping popup would get stuck in an open close loop
        // (floating-ui/floating-ui#1910).
        if (isLeave && event.relatedTarget instanceof Element && t().contains(floating, event.relatedTarget)) return;
        const closeIfNoOpenChild = () => {
          if (!hasOpenChild()) close();
        };
        // A nested child is open: abort.
        if (hasOpenChild()) return;
        const refRect = domReference.getBoundingClientRect();
        const rect = floating.getBoundingClientRect();
        const cursorLeaveFromRight = x > rect.right - rect.width / 2;
        const cursorLeaveFromBottom = y > rect.bottom - rect.height / 2;
        const isFloatingWider = rect.width > refRect.width;
        const isFloatingTaller = rect.height > refRect.height;
        const left = (isFloatingWider ? refRect : rect).left;
        const right = (isFloatingWider ? refRect : rect).right;
        const top = (isFloatingTaller ? refRect : rect).top;
        const bottom = (isFloatingTaller ? refRect : rect).bottom;
        // Leaving from the opposite side closes. 1 absorbs rounding errors.
        if ((side === "top" && y >= refRect.bottom - 1) || (side === "bottom" && y <= refRect.top + 1) ||
          (side === "left" && x >= refRect.right - 1) || (side === "right" && x <= refRect.left + 1)) {
          closeIfNoOpenChild();
          return;
        }
        // The rectangular trough between the two elements always stays open.
        let isInsideTroughRect = false;
        switch (side) {
          case "top":
            isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, left, refRect.top + 1, right, rect.bottom - 1);
            break;
          case "bottom":
            isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, left, rect.top + 1, right, refRect.bottom - 1);
            break;
          case "left":
            isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, rect.right - 1, bottom, refRect.left + 1, top);
            break;
          case "right":
            isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, refRect.right - 1, bottom, rect.left + 1, top);
            break;
          default:
        }
        if (isInsideTroughRect) return;
        if (hasLanded && !isInsideRect(clientX, clientY, refRect)) {
          closeIfNoOpenChild();
          return;
        }
        if (!isLeave && isCursorMovingSlowly(clientX, clientY)) {
          closeIfNoOpenChild();
          return;
        }
        let isInsidePolygon = false;
        switch (side) {
          case "top": {
            const cursorXOffset = isFloatingWider ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
            const cursorPointOneX = isFloatingWider ? x + cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
            const cursorPointTwoX = isFloatingWider ? x - cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
            const cursorPointY = y + POLYGON_BUFFER + 1;
            const commonYLeft = cursorLeaveFromRight ? rect.bottom - POLYGON_BUFFER : isFloatingWider ? rect.bottom - POLYGON_BUFFER : rect.top;
            const commonYRight = cursorLeaveFromRight ? (isFloatingWider ? rect.bottom - POLYGON_BUFFER : rect.top) : rect.bottom - POLYGON_BUFFER;
            isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointOneX, cursorPointY, cursorPointTwoX, cursorPointY, rect.left, commonYLeft, rect.right, commonYRight);
            break;
          }
          case "bottom": {
            const cursorXOffset = isFloatingWider ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
            const cursorPointOneX = isFloatingWider ? x + cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
            const cursorPointTwoX = isFloatingWider ? x - cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
            const cursorPointY = y - POLYGON_BUFFER;
            const commonYLeft = cursorLeaveFromRight ? rect.top + POLYGON_BUFFER : isFloatingWider ? rect.top + POLYGON_BUFFER : rect.bottom;
            const commonYRight = cursorLeaveFromRight ? (isFloatingWider ? rect.top + POLYGON_BUFFER : rect.bottom) : rect.top + POLYGON_BUFFER;
            isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointOneX, cursorPointY, cursorPointTwoX, cursorPointY, rect.left, commonYLeft, rect.right, commonYRight);
            break;
          }
          case "left": {
            const cursorYOffset = isFloatingTaller ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
            const cursorPointOneY = isFloatingTaller ? y + cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
            const cursorPointTwoY = isFloatingTaller ? y - cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
            const cursorPointX = x + POLYGON_BUFFER + 1;
            const commonXTop = cursorLeaveFromBottom ? rect.right - POLYGON_BUFFER : isFloatingTaller ? rect.right - POLYGON_BUFFER : rect.left;
            const commonXBottom = cursorLeaveFromBottom ? (isFloatingTaller ? rect.right - POLYGON_BUFFER : rect.left) : rect.right - POLYGON_BUFFER;
            isInsidePolygon = isPointInQuadrilateral(clientX, clientY, commonXTop, rect.top, commonXBottom, rect.bottom, cursorPointX, cursorPointOneY, cursorPointX, cursorPointTwoY);
            break;
          }
          case "right": {
            const cursorYOffset = isFloatingTaller ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
            const cursorPointOneY = isFloatingTaller ? y + cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
            const cursorPointTwoY = isFloatingTaller ? y - cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
            const cursorPointX = x - POLYGON_BUFFER;
            const commonXTop = cursorLeaveFromBottom ? rect.left + POLYGON_BUFFER : isFloatingTaller ? rect.left + POLYGON_BUFFER : rect.right;
            const commonXBottom = cursorLeaveFromBottom ? (isFloatingTaller ? rect.left + POLYGON_BUFFER : rect.right) : rect.left + POLYGON_BUFFER;
            isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointX, cursorPointOneY, cursorPointX, cursorPointTwoY, commonXTop, rect.top, commonXBottom, rect.bottom);
            break;
          }
          default:
        }
        if (!isInsidePolygon) closeIfNoOpenChild();
        else if (!hasLanded) timeout.start(40, closeIfNoOpenChild);
      };
    };
    fn.__options = { ...options, blockPointerEvents };
    return fn;
  }

  window.templ = window.templ || {};
  window.templ.hover = {
    createHoverInteraction,
    useHoverReferenceInteraction,
    useHoverFloatingInteraction,
    safePolygon,
    applySafePolygonPointerEventsMutation,
    clearSafePolygonPointerEventsMutation,
  };
})();
