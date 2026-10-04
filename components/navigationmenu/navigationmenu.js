// Port of @base-ui/react navigation-menu (1.6.0): Root, List, Item, Trigger,
// Content, Link, Icon, Portal, Positioner, Popup and Viewport, as shadcn
// composes them. One popup per menu: the positioner follows the active
// trigger, and the active item's content moves into the viewport, which
// resizes to it through --popup-width/--popup-height and
// --positioner-width/--positioner-height.
//
// Every trigger has its own floating root context, as in the source: its
// hover (rest delay, close delay, safe polygon), its click and its open
// event. The root holds the value, the active item.
(function () {
  "use strict";

  const ROOT = '[data-slot="navigation-menu"]';
  const LIST = '[data-slot="navigation-menu-list"]';
  const ITEM = '[data-slot="navigation-menu-item"]';
  const TRIGGER = '[data-slot="navigation-menu-trigger"]';
  const CONTENT = '[data-slot="navigation-menu-content"]';
  const LINK = '[data-slot="navigation-menu-link"]';
  const INDICATOR = '[data-slot="navigation-menu-indicator"]';
  // The holder a part waits in until it mounts, see navigationmenu.templ.
  const HOLDER = "[data-templ-portal]";

  const OPEN_DELAY = 50;
  const CLOSE_DELAY = 50;
  const PATIENT_CLICK_THRESHOLD = 500;
  const BLOCKED_RETURN_FOCUS_REASONS = new Set(["trigger-hover", "outside-press", "focus-out"]);

  const t = () => window.templ.tabbable;
  const T = () => window.templ.transition;

  // ----- helpers -------------------------------------------------------------

  // @floating-ui/react-dom's getCssDimensions.
  function getCssDimensions(element) {
    const css = getComputedStyle(element);
    let width = parseFloat(css.width) || 0;
    let height = parseFloat(css.height) || 0;
    const offsetWidth = element.offsetWidth;
    const offsetHeight = element.offsetHeight;
    if (Math.round(width) !== offsetWidth || Math.round(height) !== offsetHeight) {
      width = offsetWidth;
      height = offsetHeight;
    }
    return { width, height };
  }

  function isClickLikeEvent(event) {
    const type = event?.type;
    return type === "click" || type === "mousedown" || type === "keydown" || type === "keyup";
  }

  function stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  // Parts of this menu only, not of a nested one.
  function own(nav, element) {
    return element.closest(ROOT) === nav.root;
  }

  // ----- the root's value ----------------------------------------------------

  function isOpen(nav) {
    return nav.value != null;
  }

  function isActive(st) {
    return isOpen(st.nav) && st.nav.value === st.item;
  }

  function activeState(nav) {
    return nav.value ? nav.items.get(nav.value) : null;
  }

  function setValue(nav, item, reason, event) {
    if (item == null) nav.closeReason = reason;
    if (item === nav.value) return;
    const accepted = nav.root.dispatchEvent(
      new CustomEvent("navigation-menu-value-change", {
        bubbles: true,
        cancelable: true,
        detail: { value: item, reason, event },
      }),
    );
    if (!accepted) return;
    const prev = nav.value;
    nav.value = item;
    if (item == null) nav.activationDirection = null;
    render(nav, prev);
  }

  // The render pass after a value change: every part reads the new value,
  // then the layout effects run.
  function render(nav, prev = nav.value) {
    const open = isOpen(nav);
    const wasOpen = prev != null;
    nav.root.toggleAttribute("data-open", open);
    nav.list?.toggleAttribute("data-open", open);

    if (open && !nav.mounted) mount(nav);

    nav.items.forEach((st) => renderTrigger(st));
    nav.items.forEach((st) => renderContent(st));

    if (open) {
      const active = activeState(nav);
      // NavigationMenuTrigger's layout effect: the active trigger is where
      // focus returns to and what the positioner anchors to.
      nav.prevTrigger = active.trigger;
      nav.positioning?.setAnchor(active.trigger);
      if (active !== nav.floatingHoverOwner) startFloatingHover(nav, active);
      if (!wasOpen) {
        startDismiss(nav);
        // Unpositioned (fixed, invisible) first, so the opening size is the
        // popup's own; the enter transition runs once positioned.
        startPositioning(nav, active.trigger);
        sizeOnOpen(active);
      }
      focusIntoContent(active);
      setActivationDirection(nav);
    } else if (wasOpen) {
      closePopup(nav);
    }
  }

  // ----- trigger -------------------------------------------------------------

  function renderTrigger(st) {
    const { nav, trigger } = st;
    const active = isActive(st);
    trigger.setAttribute("aria-expanded", String(active));
    trigger.toggleAttribute("data-popup-open", active);
    trigger.toggleAttribute("data-pressed", active);
    if (active && nav.mounted) trigger.setAttribute("aria-controls", nav.popup.id);
    else trigger.removeAttribute("aria-controls");
    st.item.querySelectorAll(INDICATOR).forEach((indicator) => {
      if (own(nav, indicator)) indicator.toggleAttribute("data-popup-open", active);
    });
    if (active) renderTriggerGuards(st);
    else removeTriggerGuards(st);

    if (!active) {
      // Inactive: no pending resize for this trigger.
      cancelAnimationFrame(st.sizeFrame);
      cancelAnimationFrame(st.mutationFrame);
      cancelAutoSizeReset(st);
      stopContentObserver(st);
      stopResizeListener(st);
    } else {
      startContentObserver(st);
      startResizeListener(st);
    }

    if (!isOpen(nav)) {
      // The trigger's effects on close.
      clearTimeout(st.stickIfOpenTimer);
      cancelAnimationFrame(st.mutationFrame);
      cancelAnimationFrame(st.sizeFrame);
      cancelAutoSizeReset(st, true);
      st.skipAutoSizeSync = false;
      st.pointerType = "";
      st.openEvent = undefined;
      const hover = st.hover;
      hover.pointerType = undefined;
      hover.interactedInside = false;
      hover.restTimeoutPending = false;
      hover.openChangeTimeout.clear();
      hover.restTimeout.clear();
      window.templ.hover.clearSafePolygonPointerEventsMutation(hover);
    }
  }

  // The focus guards and the aria-owns link to the viewport the active
  // trigger renders after itself.
  function renderTriggerGuards(st) {
    const { nav, trigger } = st;
    if (!st.guards) {
      const { createFocusGuard } = window.templ.focusManager;
      const before = createFocusGuard(null, (event) => {
        const reference = referenceElement(nav);
        if (reference && t().isOutsideEvent(event, reference)) nav.beforeInside?.focus();
        else t().getPreviousTabbable(trigger)?.focus();
      });
      const owns = document.createElement("span");
      owns.style.cssText = "clip-path:inset(50%);position:fixed;top:0;left:0";
      const after = createFocusGuard(null, (event) => {
        const reference = referenceElement(nav);
        if (reference && t().isOutsideEvent(event, reference)) {
          (nav.afterInside || trigger).focus();
        } else {
          const nextTabbable = t().getNextTabbable(trigger);
          nextTabbable?.focus();
          if (!t().contains(nav.root, nextTabbable)) setValue(nav, null, "focus-out", event);
        }
      });
      trigger.after(before, owns, after);
      st.guards = { before, owns, after };
    }
    if (nav.mounted) st.guards.owns.setAttribute("aria-owns", nav.viewport.id);
  }

  function removeTriggerGuards(st) {
    if (!st.guards) return;
    st.guards.before.remove();
    st.guards.owns.remove();
    st.guards.after.remove();
    st.guards = null;
  }

  // positionerElement || viewportElement while mounted.
  function referenceElement(nav) {
    return nav.mounted ? nav.positioner : null;
  }

  function interactionsEnabled(st) {
    return (st.nav.mounted || st.nav.value == null) && !st.trigger.disabled;
  }

  // The trigger's floating root context store: setOpen syncs the open event
  // and notifies the interactions, then the trigger's handleOpenChange runs.
  function storeSetOpen(st, nextOpen, reason, event) {
    if (!nextOpen || !isOpen(st.nav) || (event != null && isClickLikeEvent(event))) {
      st.openEvent = nextOpen ? event : undefined;
    }
    handleOpenChange(st, nextOpen, reason, event);
    st.hover.openChange(nextOpen, reason);
  }

  function handleOpenChange(st, nextOpen, reason, event) {
    const { nav } = st;
    const isHover = reason === "trigger-hover";
    if (!interactionsEnabled(st)) return;
    if (st.pointerType === "touch" && isHover) return;
    if (!nextOpen && nav.value !== st.item) return;
    if (isHover) {
      // Only patient clicks close a popup the pointer just opened.
      st.stickIfOpen = true;
      clearTimeout(st.stickIfOpenTimer);
      st.stickIfOpenTimer = setTimeout(() => {
        st.stickIfOpen = false;
      }, PATIENT_CLICK_THRESHOLD);
    }
    if (nextOpen) {
      setValue(nav, st.item, reason, event);
    } else {
      setValue(nav, null, reason, event);
      st.pointerType = "";
    }
  }

  function setActivationDirection(nav) {
    const direction = isOpen(nav) ? nav.activationDirection : null;
    nav.items.forEach((st) => {
      if (st.contentMounted) {
        if (direction) st.content.setAttribute("data-activation-direction", direction);
        else st.content.removeAttribute("data-activation-direction");
      }
    });
  }

  // handleActivation: the direction from the previous trigger, and moving
  // an open menu over to this trigger.
  function updateActivationDirection(st) {
    const { nav } = st;
    const prevTriggerRect = nav.prevTrigger?.getBoundingClientRect();
    if (!nav.mounted || !prevTriggerRect) return;
    const nextTriggerRect = st.trigger.getBoundingClientRect();
    if (nav.orientation === "horizontal" && nextTriggerRect.left !== prevTriggerRect.left) {
      nav.activationDirection = nextTriggerRect.left > prevTriggerRect.left ? "right" : "left";
    } else if (nav.orientation === "vertical" && nextTriggerRect.top !== prevTriggerRect.top) {
      nav.activationDirection = nextTriggerRect.top > prevTriggerRect.top ? "down" : "up";
    }
  }

  // handleOpenEvent with handleActivation, for mouseenter, click and the
  // keyboard open. keyboardReason: the keydown already set the value.
  function handleOpenEvent(st, event, keyboardReason) {
    const { nav } = st;
    if (st.trigger.disabled) return;
    const wasMounted = nav.mounted;
    const prevValue = nav.value;
    const size = wasMounted ? getCssDimensions(nav.popup) : null;

    updateActivationDirection(st);
    if (event.type !== "click" && prevValue != null) st.openEvent = undefined;
    if (keyboardReason) {
      setValue(nav, st.item, keyboardReason, event);
    } else if (!(st.pointerType === "touch" && event.type !== "click")) {
      if (prevValue != null) {
        setValue(nav, st.item, event.type === "mouseenter" ? "trigger-hover" : "trigger-press", event);
      }
      const floating = referenceElement(nav);
      if (event.type === "mouseenter" && st.pointerType !== "touch" && floating) {
        const apply = () => {
          window.templ.hover.applySafePolygonPointerEventsMutation(st.hover, {
            scopeElement: nav.list ?? document.body,
            referenceElement: st.trigger,
            floatingElement: floating,
          });
        };
        if (prevValue != null && prevValue !== st.item) queueMicrotask(apply);
        else apply();
      }
    }
    setActivationDirection(nav);

    if (!wasMounted) return;
    if (prevValue != null && prevValue !== st.item && (event.type === "click" || st.pointerType !== "touch")) {
      st.skipAutoSizeSync = true;
    }
    handleValueChange(st, size.width, size.height);
  }

  // ----- sizing --------------------------------------------------------------

  function setPopupSize(nav, width, height) {
    nav.popup.style.setProperty("--popup-width", typeof width === "number" ? `${width}px` : width);
    nav.popup.style.setProperty("--popup-height", typeof height === "number" ? `${height}px` : height);
  }

  function setPositionerSize(nav, width, height) {
    nav.positioner.style.setProperty("--positioner-width", `${width}px`);
    nav.positioner.style.setProperty("--positioner-height", `${height}px`);
  }

  // utils/setSharedFixedSize.ts
  function setSharedFixedSize(nav, width, height) {
    setPopupSize(nav, width, height);
    setPositionerSize(nav, width, height);
  }

  function clearFixedSizes(nav) {
    ["--popup-width", "--popup-height"].forEach((name) => nav.popup.style.removeProperty(name));
    ["--positioner-width", "--positioner-height"].forEach((name) => nav.positioner.style.removeProperty(name));
  }

  function setAutoSizes(nav) {
    setPopupSize(nav, "auto", "auto");
  }

  // The popup's auto size reset is shared by the triggers, so a newly
  // active one can cancel the one the previous trigger scheduled.
  function cancelAutoSizeReset(st, force = false) {
    const reset = st.nav.autoSizeReset;
    if (!force && reset.owner !== st.item) return;
    reset.token = null;
    reset.owner = null;
  }

  function scheduleAutoSizeReset(st) {
    const { nav } = st;
    cancelAutoSizeReset(st, true);
    const token = {};
    nav.autoSizeReset.token = token;
    nav.autoSizeReset.owner = st.item;
    T().animationsFinished(nav.popup, () => {
      if (nav.autoSizeReset.token !== token || nav.autoSizeReset.owner !== st.item) return;
      nav.autoSizeReset.token = null;
      nav.autoSizeReset.owner = null;
      setAutoSizes(nav);
    });
  }

  function handleValueChange(st, currentWidth, currentHeight, { syncPositioner = false } = {}) {
    const { nav } = st;
    if (!nav.mounted) return;
    cancelAutoSizeReset(st, true);
    clearFixedSizes(nav);
    const { width, height } = getCssDimensions(nav.popup);
    const measuredWidth = width || nav.prevSize.width;
    const measuredHeight = height || nav.prevSize.height;
    if (currentHeight === 0 || currentWidth === 0) {
      currentWidth = measuredWidth;
      currentHeight = measuredHeight;
    }
    setPopupSize(nav, currentWidth, currentHeight);
    setPositionerSize(nav, syncPositioner ? currentWidth : measuredWidth, syncPositioner ? currentHeight : measuredHeight);
    cancelAnimationFrame(st.sizeFrame);
    st.sizeFrame = requestAnimationFrame(() => {
      if (!isActive(st)) return;
      setPopupSize(nav, measuredWidth, measuredHeight);
      if (syncPositioner) setPositionerSize(nav, measuredWidth, measuredHeight);
      scheduleAutoSizeReset(st);
    });
  }

  function handleInterruptedMutationResize(st, currentWidth, currentHeight) {
    const { nav } = st;
    cancelAnimationFrame(st.sizeFrame);
    cancelAnimationFrame(st.mutationFrame);
    cancelAutoSizeReset(st, true);
    if (currentWidth === 0 || currentHeight === 0) return;
    setSharedFixedSize(nav, currentWidth, currentHeight);
    st.mutationFrame = requestAnimationFrame(() => {
      st.mutationFrame = requestAnimationFrame(() => {
        clearFixedSizes(nav);
        const { width, height } = getCssDimensions(nav.popup);
        const measuredWidth = width || currentWidth || nav.prevSize.width;
        const measuredHeight = height || currentHeight || nav.prevSize.height;
        setSharedFixedSize(nav, currentWidth, currentHeight);
        st.sizeFrame = requestAnimationFrame(() => {
          if (!isActive(st)) return;
          setSharedFixedSize(nav, measuredWidth, measuredHeight);
          scheduleAutoSizeReset(st);
        });
      });
    });
  }

  function syncCurrentSize(st) {
    const { nav } = st;
    if (!nav.mounted) return;
    cancelAnimationFrame(st.sizeFrame);
    cancelAutoSizeReset(st, true);
    clearFixedSizes(nav);
    const { width, height } = getCssDimensions(nav.popup);
    if (width === 0 || height === 0) return;
    nav.prevSize = { width, height };
    setAutoSizes(nav);
    setPositionerSize(nav, width, height);
  }

  function getMutationBaseline(nav) {
    const popupWidth = nav.popup.style.getPropertyValue("--popup-width");
    const popupHeight = nav.popup.style.getPropertyValue("--popup-height");
    const isResizing = popupWidth !== "" && popupWidth !== "auto" && popupHeight !== "" && popupHeight !== "auto";
    if (!isResizing) return { size: nav.prevSize, syncPositioner: false };
    return {
      size: { width: nav.popup.offsetWidth || nav.prevSize.width, height: nav.popup.offsetHeight || nav.prevSize.height },
      syncPositioner: true,
    };
  }

  // The trigger's layout effect when the popup opens on it.
  function sizeOnOpen(st) {
    if (st.skipAutoSizeSync) {
      st.skipAutoSizeSync = false;
      return;
    }
    const { width, height } = getCssDimensions(st.nav.popup);
    handleValueChange(st, width, height);
  }

  // The active content changing its own size.
  function startContentObserver(st) {
    if (st.contentObserver || typeof MutationObserver !== "function" || !st.content) return;
    const { nav } = st;
    st.contentObserver = new MutationObserver(() => {
      if (!nav.mounted) return;
      if (nav.popup.hasAttribute("data-starting-style")) {
        syncCurrentSize(st);
        return;
      }
      const { size, syncPositioner } = getMutationBaseline(nav);
      if (syncPositioner) handleInterruptedMutationResize(st, size.width, size.height);
      else handleValueChange(st, size.width, size.height);
    });
    st.contentObserver.observe(st.content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
  }

  function stopContentObserver(st) {
    st.contentObserver?.disconnect();
    st.contentObserver = null;
  }

  function startResizeListener(st) {
    if (st.onResize || !st.nav.mounted) return;
    st.onResize = () => {
      cancelAnimationFrame(st.resizeFrame);
      st.resizeFrame = requestAnimationFrame(() => syncCurrentSize(st));
    };
    window.addEventListener("resize", st.onResize);
  }

  function stopResizeListener(st) {
    if (!st.onResize) return;
    cancelAnimationFrame(st.resizeFrame);
    window.removeEventListener("resize", st.onResize);
    st.onResize = null;
  }

  // ----- content -------------------------------------------------------------

  // NavigationMenuContent: portaled into the viewport while mounted, with its
  // own transition status. Inactive but still mounted it leaves the flow.
  function renderContent(st) {
    if (!st.content) return;
    const { nav, content } = st;
    const open = nav.mounted && nav.value === st.item;
    if (open) {
      if (st.contentOpen) return;
      st.contentOpen = true;
      content.style.position = "";
      content.style.top = "";
      content.style.left = "";
      content.inert = false;
      if (!st.contentMounted) {
        st.contentMounted = true;
        window.templ.portal.render(content, nav.viewport);
      }
      T().open([content]);
    } else if (st.contentOpen) {
      st.contentOpen = false;
      content.style.position = "absolute";
      content.style.top = "0px";
      content.style.left = "0px";
      content.inert = !st.focusInside;
      T().close([content], content, () => unmountContent(st));
    }
  }

  function unmountContent(st) {
    if (!st.contentMounted || st.contentOpen) return;
    const { content } = st;
    st.contentMounted = false;
    st.focusInside = false;
    st.holder.appendChild(content);
    T().reset([content], false);
    content.removeAttribute("data-open");
    content.removeAttribute("data-closed");
    content.removeAttribute("data-activation-direction");
    content.removeAttribute("style");
    content.inert = false;
  }

  // Keyboard opens move focus into the content: the trigger's guard hands it
  // on to the first tabbable inside the popup.
  function focusIntoContent(st) {
    if (!st.allowFocus || !st.nav.mounted) return;
    st.allowFocus = false;
    cancelAnimationFrame(st.focusFrame);
    st.focusFrame = requestAnimationFrame(() => st.guards?.before.focus());
  }

  // ----- popup ---------------------------------------------------------------

  function mount(nav) {
    nav.mounted = true;
    window.templ.portal.render(nav.portalNode);
    nav.positioner.hidden = false;
    nav.prevSize = { width: 0, height: 0 };
    if (typeof ResizeObserver === "function") {
      nav.popupResizeObserver = new ResizeObserver(() => {
        nav.prevSize = { width: nav.popup.offsetWidth, height: nav.popup.offsetHeight };
      });
      nav.popupResizeObserver.observe(nav.popup);
    }
    nav.onWindowResize = () => {
      // The positioner jumps instead of transitioning while the window resizes.
      nav.positioner.setAttribute("data-instant", "");
      clearTimeout(nav.instantTimer);
      nav.instantTimer = setTimeout(() => nav.positioner.removeAttribute("data-instant"), 100);
    };
    window.addEventListener("resize", nav.onWindowResize);
  }

  // NavigationMenuPositioner's useAnchorPositioning with adaptiveOrigin,
  // then the popup's enter transition in place.
  function startPositioning(nav, anchor) {
    const positioner = nav.positioner;
    if (nav.positioning) {
      // Opened again during the exit transition: still mounted and placed.
      nav.openToken = {};
      T().open({ parts: [nav.popup], positioner });
      return;
    }
    nav.positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor,
      positioner,
      parts: [positioner, nav.popup],
      side: positioner.getAttribute("data-templ-side") || "bottom",
      align: positioner.getAttribute("data-templ-align") || "center",
      sideOffset: parseFloat(positioner.getAttribute("data-templ-side-offset")) || 0,
      alignOffset: parseFloat(positioner.getAttribute("data-templ-align-offset")) || 0,
      collisionAvoidance: { fallbackAxisSide: "none" },
      adaptiveOrigin: true,
      onPosition: (result, side) => placePopup(nav, side),
    });
    const token = (nav.openToken = {});
    const finish = () => {
      if (nav.openToken !== token || !isOpen(nav)) return;
      T().open({ parts: [nav.popup], positioner });
    };
    nav.positioning.positioned.then(finish, finish);
  }

  // NavigationMenuPopup anchors its size transition to the far edge when it
  // opens on the top or left side.
  function placePopup(nav, side) {
    const style = nav.popup.style;
    const isPhysicalLeft = side === "left" || side === (nav.rtl() ? "inline-end" : "inline-start");
    const isOriginSide = side === "top" || isPhysicalLeft;
    style.position = isOriginSide ? "absolute" : "";
    style.top = isOriginSide && side !== "top" ? "0" : "";
    style.bottom = isOriginSide && side === "top" ? "0" : "";
    style.left = isOriginSide && !isPhysicalLeft ? "0" : "";
    style.right = isOriginSide && isPhysicalLeft ? "0" : "";
  }

  function closePopup(nav) {
    nav.openToken = null;
    stopDismiss(nav);
    stopFloatingHover(nav);
    // The root's layout effect: the last positioner size holds the popup
    // while it transitions out.
    const width = parseFloat(nav.positioner.style.getPropertyValue("--positioner-width")) || 0;
    const height = parseFloat(nav.positioner.style.getPropertyValue("--positioner-height")) || 0;
    if (width > 0 && height > 0) setSharedFixedSize(nav, width, height);
    T().close({ parts: [nav.popup], positioner: nav.positioner }, nav.popup, () => handleUnmount(nav));
  }

  // The root's handleUnmount once the popup's exit animations finished.
  function handleUnmount(nav) {
    if (isOpen(nav)) return;
    const active = t().activeElement(document);
    const blocked = nav.closeReason ? BLOCKED_RETURN_FOCUS_REASONS.has(nav.closeReason) : false;
    if (!blocked && nav.prevTrigger && (active === document.body || t().contains(nav.popup, active))) {
      nav.prevTrigger.focus({ preventScroll: true });
      nav.prevTrigger = null;
    }
    unmount(nav);
    nav.closeReason = undefined;
  }

  function unmount(nav) {
    if (!nav.mounted) return;
    nav.mounted = false;
    nav.activationDirection = null;
    nav.items.forEach((st) => {
      if (st.contentOpen) st.contentOpen = false;
      unmountContent(st);
      stopResizeListener(st);
    });
    nav.positioning?.cleanup();
    nav.positioning = null;
    nav.popupResizeObserver?.disconnect();
    nav.popupResizeObserver = null;
    window.removeEventListener("resize", nav.onWindowResize);
    clearTimeout(nav.instantTimer);
    nav.positioner.hidden = true;
    // A fresh positioner and popup on the next mount.
    nav.positioner.removeAttribute("style");
    nav.positioner.removeAttribute("data-side");
    nav.positioner.removeAttribute("data-align");
    nav.positioner.removeAttribute("data-anchor-hidden");
    nav.positioner.removeAttribute("data-instant");
    nav.popup.removeAttribute("style");
    nav.popup.removeAttribute("data-side");
    nav.popup.removeAttribute("data-align");
    nav.prevSize = { width: 0, height: 0 };
    window.templ.portal.remove(nav.portalNode);
  }

  // ----- interactions --------------------------------------------------------

  // NavigationMenuList's useDismiss on the active trigger's context: Escape,
  // and a click outside that is not on another trigger.
  function startDismiss(nav) {
    stopDismiss(nav);
    nav.dismiss = window.templ.dismiss.useDismiss({
      floating: nav.positioner,
      reference: [...nav.items.values()].map((st) => st.trigger),
      outsidePressEvent: "intentional",
      outsidePress(event) {
        const target = event.composedPath?.()[0] || event.target;
        return !target?.closest?.(TRIGGER);
      },
      onOpenChange(open, reason, event) {
        const active = activeState(nav);
        if (!active) return false;
        storeSetOpen(active, open, reason, event);
        return !isOpen(nav);
      },
    });
  }

  function stopDismiss(nav) {
    nav.dismiss?.();
    nav.dismiss = null;
  }

  // NavigationMenuList's useHoverFloatingInteraction, on the active trigger's
  // context.
  function startFloatingHover(nav, st) {
    stopFloatingHover(nav);
    nav.floatingHoverOwner = st;
    nav.floatingHover = window.templ.hover.useHoverFloatingInteraction(st.hover, {
      enabled: () => nav.floatingHoverOwner === st && interactionsEnabled(st),
      closeDelay: () => nav.closeDelay,
    });
  }

  function stopFloatingHover(nav) {
    nav.floatingHover?.();
    nav.floatingHover = null;
    nav.floatingHoverOwner = null;
  }

  function isOutsideMenuEvent(nav, currentTarget, relatedTarget) {
    const popup = nav.mounted ? nav.popup : null;
    if (!popup) return !t().contains(nav.root, relatedTarget);
    return (
      !t().contains(popup, currentTarget) &&
      !t().contains(popup, relatedTarget) &&
      !t().contains(nav.root, relatedTarget)
    );
  }

  function setupTrigger(nav, trigger) {
    const item = trigger.closest(ITEM);
    const content = [...item.querySelectorAll(CONTENT)].find((el) => own(nav, el) && el.parentElement?.matches(HOLDER)) || null;
    const st = {
      nav,
      item,
      trigger,
      content,
      holder: content?.parentElement ?? null,
      stickIfOpen: true,
      stickIfOpenTimer: 0,
      pointerType: "",
      openEvent: undefined,
      allowFocus: false,
      guards: null,
      contentOpen: false,
      contentMounted: false,
      focusInside: false,
      skipAutoSizeSync: false,
      sizeFrame: 0,
      mutationFrame: 0,
      focusFrame: 0,
      resizeFrame: 0,
      cleanups: [],
    };
    const on = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      st.cleanups.push(() => target.removeEventListener(type, listener, options));
    };

    // The trigger's own props run before its click and hover interactions.
    // useClick reads toggle as rendered before this click activated it.
    on(trigger, "click", () => {
      st.clickToggle = isActive(st);
    });
    on(trigger, "mouseenter", (event) => handleOpenEvent(st, event));
    on(trigger, "click", (event) => handleOpenEvent(st, event));
    on(trigger, "pointerenter", (event) => {
      st.pointerType = event.pointerType;
    });
    on(trigger, "pointerdown", (event) => {
      st.pointerType = event.pointerType;
      window.templ.hover.clearSafePolygonPointerEventsMutation(st.hover);
    });
    on(trigger, "mousemove", () => {
      st.allowFocus = false;
    });
    on(trigger, "keydown", (event) => {
      st.allowFocus = true;
      const verticalOpenKey = nav.rtl() ? "ArrowLeft" : "ArrowRight";
      const openHorizontal = nav.orientation === "horizontal" && event.key === "ArrowDown";
      const openVertical = nav.orientation === "vertical" && event.key === verticalOpenKey;
      if (openHorizontal || openVertical) {
        handleOpenEvent(st, event, "list-navigation");
        stopEvent(event);
      }
    });
    on(trigger, "blur", (event) => {
      if (nav.mounted && isOutsideMenuEvent(nav, trigger, event.relatedTarget)) {
        setValue(nav, null, "focus-out", event);
      }
    });

    const hover = window.templ.hover;
    st.hover = hover.createHoverInteraction({
      isOpen: () => isOpen(nav),
      onOpenChange: (open, reason, event) => storeSetOpen(st, open, reason, event),
      openEventType: () => st.openEvent?.type ?? null,
      domReference: () => trigger,
      floating: () => referenceElement(nav),
      placement: () => nav.positioner.getAttribute("data-side") || "bottom",
      triggers: () => [trigger],
      parentFloating: () => null,
    });
    st.cleanups.push(
      hover.useHoverReferenceInteraction(trigger, st.hover, {
        enabled: () => interactionsEnabled(st),
        move: false,
        handleClose: hover.safePolygon({ blockPointerEvents: true, getScope: () => nav.list }),
        restMs: () => (nav.mounted ? 0 : nav.delay),
        delay: () => ({ close: nav.closeDelay }),
        isClosing: () => T().isEnding(nav.popup),
      }),
      window.templ.click.useClick(trigger, {
        isOpen: () => isOpen(nav),
        toggle: () => st.clickToggle,
        stickIfOpen: () => st.stickIfOpen,
        openEventType: () => st.openEvent?.type ?? null,
        onOpenChange(nextOpen, event) {
          if (!interactionsEnabled(st)) return;
          storeSetOpen(st, nextOpen, "trigger-press", event);
        },
      }),
    );

    if (content) {
      // NavigationMenuContent: a composite of its links, and whether focus
      // is inside while it transitions out.
      const composite = window.templ.composite.useCompositeRoot(content, {
        items: () => [...content.querySelectorAll(LINK)].filter((link) => link.closest(CONTENT) === content),
        itemTabIndex: false,
        rtl: () => nav.rtl(),
      });
      st.cleanups.push(() => composite.cleanup());
      on(content, "focusin", (event) => {
        if (event.target?.hasAttribute?.("data-base-ui-focus-guard")) return;
        st.focusInside = true;
      });
      on(content, "focusout", (event) => {
        if (!t().contains(content, event.relatedTarget)) {
          st.focusInside = false;
          if (!st.contentOpen && st.contentMounted) content.inert = true;
        }
      });
    }
    return st;
  }

  function setup(root) {
    const portalOwner = [...root.children].find((child) => child.matches(HOLDER));
    const portalNode = portalOwner?.firstElementChild;
    const positioner = portalNode?.firstElementChild;
    const popup = positioner?.firstElementChild;
    const viewport = popup?.firstElementChild;
    if (!viewport) return;
    const list = [...root.querySelectorAll(LIST)].find((el) => el.closest(ROOT) === root) || null;
    const nav = {
      root,
      list,
      portalNode,
      positioner,
      popup,
      viewport,
      value: null,
      mounted: false,
      activationDirection: null,
      closeReason: undefined,
      prevTrigger: null,
      orientation: "horizontal",
      rtl: () => window.templ.direction.useDirection(root) === "rtl",
      delay: parseInt(root.getAttribute("data-templ-delay"), 10) || OPEN_DELAY,
      closeDelay: parseInt(root.getAttribute("data-templ-close-delay"), 10) || CLOSE_DELAY,
      autoSizeReset: { token: null, owner: null },
      prevSize: { width: 0, height: 0 },
      items: new Map(),
      cleanups: [],
    };
    root._templNav = nav;

    // NavigationMenuViewport's guards around it, inside the popup.
    const { createFocusGuard } = window.templ.focusManager;
    nav.beforeInside = createFocusGuard(null, (event) => {
      const reference = referenceElement(nav);
      if (reference && t().isOutsideEvent(event, reference)) t().getNextTabbable(reference)?.focus();
      else activeState(nav)?.guards?.before.focus();
    });
    nav.afterInside = createFocusGuard(null, (event) => {
      const reference = referenceElement(nav);
      if (reference && t().isOutsideEvent(event, reference)) t().getPreviousTabbable(reference)?.focus();
      else activeState(nav)?.guards?.after.focus();
    });
    viewport.before(nav.beforeInside);
    viewport.after(nav.afterInside);

    // The positioner's tabbables count only once focus came in.
    const onFocus = (event) => {
      if (!t().isOutsideEvent(event)) return;
      if (event.type === "focusin") t().enableFocusInside(positioner);
      else t().disableFocusInside(positioner);
    };
    positioner.addEventListener("focusin", onFocus, true);
    positioner.addEventListener("focusout", onFocus, true);
    nav.cleanups.push(() => {
      positioner.removeEventListener("focusin", onFocus, true);
      positioner.removeEventListener("focusout", onFocus, true);
    });

    // NavigationMenuLink's onBlur: focus leaving the menu closes it.
    const onLinkBlur = (event) => {
      const link = event.target?.closest?.(LINK);
      if (!link || !nav.mounted) return;
      if (isOutsideMenuEvent(nav, link, event.relatedTarget)) setValue(nav, null, "focus-out", event);
    };
    root.addEventListener("focusout", onLinkBlur);
    positioner.addEventListener("focusout", onLinkBlur);
    nav.cleanups.push(() => {
      root.removeEventListener("focusout", onLinkBlur);
      positioner.removeEventListener("focusout", onLinkBlur);
    });

    [...root.querySelectorAll(TRIGGER)].filter((trigger) => own(nav, trigger)).forEach((trigger) => {
      const st = setupTrigger(nav, trigger);
      nav.items.set(st.item, st);
    });

    if (list) {
      // NavigationMenuList: a composite of the triggers and links in the
      // list, every one its own tab stop; the arrows along the orientation
      // stay inside it.
      const composite = window.templ.composite.useCompositeRoot(list, {
        items: () =>
          [...list.querySelectorAll(TRIGGER + "," + LINK)].filter(
            (el) => el.closest(LIST) === list && !el.closest(HOLDER),
          ),
        loopFocus: false,
        orientation: nav.orientation,
        itemTabIndex: false,
        rtl: () => nav.rtl(),
      });
      const onKeyDown = (event) => {
        const shouldStop =
          (nav.orientation === "horizontal" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) ||
          (nav.orientation === "vertical" && (event.key === "ArrowUp" || event.key === "ArrowDown"));
        if (shouldStop) event.stopPropagation();
      };
      list.addEventListener("keydown", onKeyDown);
      nav.cleanups.push(() => {
        composite.cleanup();
        list.removeEventListener("keydown", onKeyDown);
      });
    }
  }

  function teardown(root) {
    const nav = root._templNav;
    if (!nav) return;
    stopDismiss(nav);
    stopFloatingHover(nav);
    nav.items.forEach((st) => {
      clearTimeout(st.stickIfOpenTimer);
      cancelAnimationFrame(st.sizeFrame);
      cancelAnimationFrame(st.mutationFrame);
      cancelAnimationFrame(st.focusFrame);
      stopContentObserver(st);
      stopResizeListener(st);
      removeTriggerGuards(st);
      st.cleanups.forEach((cleanup) => cleanup());
      st.hover.dispose();
    });
    nav.cleanups.forEach((cleanup) => cleanup());
    nav.positioning?.cleanup();
    nav.popupResizeObserver?.disconnect();
    window.removeEventListener("resize", nav.onWindowResize);
    window.templ.portal.remove(nav.portalNode);
    root._templNav = null;
  }

  window.templ.lifecycle.register(ROOT, { init: setup, destroy: teardown });
})();
