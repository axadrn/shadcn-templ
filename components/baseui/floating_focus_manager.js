// Port of @base-ui/react floating-ui-react/components/FloatingFocusManager.tsx
// (1.6.0), with utils/FocusGuard.tsx and floating-ui-react/utils/enqueueFocus.ts.
//
// The component's effects become one handle that follows the popup:
//
//   const focus = window.templ.focusManager.useFloatingFocusManager(options)  on mount
//   focus.close(details)   when it closes, details { reason, event }
//   focus.unmount()        once it unmounted after its exit animation
//
//   floating                  the floating element (positioner, or the popup itself)
//   reference                 the trigger, the source's domReference
//   triggers                  every trigger of the popup (a list), default [reference]
//   modal                     traps focus with guards and hides the outside (default true)
//   initialFocus              true, false, an element, or fn(interactionType)
//   returnFocus               true, false, an element, or fn(closeType)
//   restoreFocus              false, true, or "popup"
//   closeOnFocusOut           default true
//   openInteractionType       "mouse", "touch", "pen", "keyboard", "", or null (programmatic)
//   previousFocusableElement, nextFocusableElement
//   getInsideElements         fn returning elements that count as inside
//   onOpenChange(open, reason, event)   requests the close
//
// The floating tree is the portal owner chain, like in use_dismiss.js: a
// child is an open focus manager whose floating element lies inside this one.
// The portal context is the [data-base-ui-portal] node around the floating
// element, see portal.js.
(function () {
  "use strict";

  const t = () => window.templ.tabbable;
  const webkit = typeof CSS !== "undefined" && !!CSS.supports?.("-webkit-backdrop-filter:none");
  const FOCUSABLE_ATTRIBUTE = "data-base-ui-focusable";
  const CLICK_TRIGGER_IDENTIFIER = "data-base-ui-click-trigger";
  const TYPEABLE_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";

  const instances = new Set();

  // ----- enqueueFocus -------------------------------------------------------

  // Returns a cancel for the queued focus.
  let rafId = 0;
  function enqueueFocus(el, options = {}) {
    const { preventScroll = false, sync = false, shouldFocus } = options;
    cancelAnimationFrame(rafId);
    const exec = () => {
      if (shouldFocus && !shouldFocus()) return;
      el?.focus({ preventScroll });
    };
    if (sync) {
      exec();
      return () => {};
    }
    const currentRafId = requestAnimationFrame(exec);
    rafId = currentRafId;
    return () => {
      if (rafId === currentRafId) {
        cancelAnimationFrame(currentRafId);
        rafId = 0;
      }
    };
  }

  // ----- FocusGuard -----------------------------------------------------------

  // A visually hidden tabbable span that hands focus on when it receives it.
  function createFocusGuard(type, onFocus) {
    const guard = document.createElement("span");
    if (type) guard.setAttribute("data-type", type);
    guard.setAttribute("aria-hidden", "true");
    guard.setAttribute("tabindex", "0");
    guard.setAttribute("data-base-ui-focus-guard", "");
    guard.style.cssText = "clip-path:inset(50%);overflow:hidden;white-space:nowrap;border:0;padding:0;width:1px;height:1px;margin:-1px;position:fixed;top:0;left:0";
    if (onFocus) guard.addEventListener("focus", onFocus);
    return guard;
  }

  // ----- helpers from the source's utils --------------------------------------

  const getTarget = (event) => event.composedPath?.()[0] || event.target;
  const isHTMLElement = (node) => node instanceof HTMLElement;
  const isTypeableElement = (element) => isHTMLElement(element) && element.matches(TYPEABLE_SELECTOR);
  const isTypeableCombobox = (element) => !!element && element.getAttribute("role") === "combobox" && isTypeableElement(element);
  const stopEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // The element that takes focus: the one marked focusable inside a
  // positioning wrapper, or the floating element itself.
  function getFloatingFocusElement(floatingElement) {
    if (!floatingElement) return null;
    return floatingElement.hasAttribute(FOCUSABLE_ATTRIBUTE)
      ? floatingElement
      : floatingElement.querySelector(`[${FOCUSABLE_ATTRIBUTE}]`) || floatingElement;
  }

  function getFirstTabbableElement(container) {
    if (!container) return null;
    if (t().isTabbable(container)) return container;
    return t().tabbable(container)[0] || container;
  }

  // The React tree pendant, see use_dismiss.js.
  function withinTree(root, target) {
    for (let node = target; node; node = window.templ.portal.treeParent(node)) {
      if (node === root) return true;
    }
    return false;
  }

  function isVirtualClick(event) {
    if (event.pointerType === "" && event.isTrusted) return true;
    return event.detail === 0 && !event.pointerType;
  }

  function isVirtualPointerEvent(event) {
    return (event.width === 0 && event.height === 0) ||
      (event.width < 1 && event.height < 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "touch");
  }

  function getEventType(event, lastInteractionType) {
    if (!event) return lastInteractionType || "";
    if (event instanceof KeyboardEvent) return "keyboard";
    if (event instanceof FocusEvent) return lastInteractionType || "keyboard";
    if ("pointerType" in event) return event.pointerType || "keyboard";
    if ("touches" in event) return "touch";
    if (event instanceof MouseEvent) return lastInteractionType || (event.detail === 0 ? "keyboard" : "mouse");
    return "";
  }

  // The elements focused before a modal popup took focus, most recent last.
  const LIST_LIMIT = 20;
  let previouslyFocusedElements = [];
  function clearDisconnectedPreviouslyFocusedElements() {
    previouslyFocusedElements = previouslyFocusedElements.filter((entry) => entry.deref()?.isConnected);
  }
  function addPreviouslyFocusedElement(element) {
    clearDisconnectedPreviouslyFocusedElements();
    if (element && element.nodeName.toLowerCase() !== "body") {
      previouslyFocusedElements.push(new WeakRef(element));
      if (previouslyFocusedElements.length > LIST_LIMIT) previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
    }
  }
  function getPreviouslyFocusedElement() {
    clearDisconnectedPreviouslyFocusedElements();
    return previouslyFocusedElements[previouslyFocusedElements.length - 1]?.deref();
  }

  // A dialog without tabbable content takes the Tab stop itself. data-tabindex
  // marks the value Base UI wrote, so a user authored tabindex is left alone.
  function handleTabIndex(floatingFocusElement) {
    if (floatingFocusElement.hasAttribute("tabindex") && !floatingFocusElement.hasAttribute("data-tabindex")) return;
    if (!floatingFocusElement.getAttribute("role")?.includes("dialog")) return;
    const tabbableContent = t().focusable(floatingFocusElement).filter((element) => {
      const dataTabIndex = element.getAttribute("data-tabindex") || "";
      return t().isTabbable(element) || (element.hasAttribute("data-tabindex") && !dataTabIndex.startsWith("-"));
    });
    const tabIndex = floatingFocusElement.getAttribute("tabindex");
    if (tabbableContent.length === 0) {
      if (tabIndex !== "0") {
        floatingFocusElement.setAttribute("tabindex", "0");
        floatingFocusElement.setAttribute("data-tabindex", "0");
      }
    } else if (tabIndex !== "-1" || (floatingFocusElement.hasAttribute("data-tabindex") && floatingFocusElement.getAttribute("data-tabindex") !== "-1")) {
      floatingFocusElement.setAttribute("tabindex", "-1");
      floatingFocusElement.setAttribute("data-tabindex", "-1");
    }
  }

  // ----- the focus manager ------------------------------------------------------

  function useFloatingFocusManager(options) {
    const {
      floating,
      reference: domReference = null,
      modal = true,
      initialFocus = true,
      returnFocus = true,
      restoreFocus = false,
      closeOnFocusOut = true,
      openInteractionType = "",
      previousFocusableElement = null,
      nextFocusableElement = null,
      getInsideElements,
      onOpenChange,
    } = options;
    const triggers = [...(options.triggers || [domReference])].filter(Boolean);
    const doc = floating.ownerDocument;
    const floatingFocusElement = getFloatingFocusElement(floating);
    const portalNode = floating.closest("[data-base-ui-portal]");
    const ignoreInitialFocus = initialFocus === false;
    // A typeable combobox reference keeps focus in its input: no guards,
    // but the outside is still hidden.
    const isUntrappedTypeableCombobox = isTypeableCombobox(domReference) && ignoreInitialFocus;
    const self = { floating, reference: domReference, open: false };
    const cleanups = [];
    const openCleanups = [];

    let preventReturnFocus = false;
    let isPointerDown = false;
    let pointerDownOutside = false;
    let lastFocusedTabbable = null;
    let closeType = "";
    let lastInteractionType = "";
    let insideReactTree = false;
    let blurTimer = 0;
    let pointerDownTimer = 0;

    const getTabbableContent = (container = floatingFocusElement) => (container ? t().tabbable(container) : []);
    const getResolvedInsideElements = () => getInsideElements?.().filter((element) => element != null) ?? [];
    const on = (list, target, type, listener, capture) => {
      target.addEventListener(type, listener, !!capture);
      list.push(() => target.removeEventListener(type, listener, !!capture));
    };
    const isChild = (other) => other !== self && withinTree(floating, other.floating);
    const isAncestor = (other) => other !== self && withinTree(other.floating, floating);

    // Guards inside the floating tree: a modal trap, or for a non modal popup
    // in a portal the way back out through the portal's outside guards.
    const shouldRenderGuards = (modal ? !isUntrappedTypeableCombobox : true) && (portalNode != null || modal);
    let beforeGuard = null;
    let afterGuard = null;
    if (shouldRenderGuards) {
      beforeGuard = createFocusGuard("inside", (event) => {
        if (modal) {
          const els = getTabbableContent();
          enqueueFocus(els[els.length - 1]);
        } else if (portalNode) {
          preventReturnFocus = false;
          if (t().isOutsideEvent(event, portalNode)) {
            t().getNextTabbable(domReference)?.focus();
          } else {
            (previousFocusableElement || portalNode._templPortalGuards?.beforeOutside)?.focus();
          }
        }
      });
      afterGuard = createFocusGuard("inside", (event) => {
        if (modal) {
          enqueueFocus(getTabbableContent()[0]);
        } else if (portalNode) {
          if (closeOnFocusOut) preventReturnFocus = true;
          if (t().isOutsideEvent(event, portalNode)) {
            t().getPreviousTabbable(domReference)?.focus();
          } else {
            (nextFocusableElement || portalNode._templPortalGuards?.afterOutside)?.focus();
          }
        }
      });
      floatingFocusElement.before(beforeGuard);
      floatingFocusElement.after(afterGuard);
    }

    // Prevent Tab from escaping the modal when there is nothing tabbable.
    if (modal) {
      on(cleanups, doc, "keydown", (event) => {
        if (event.key === "Tab" && t().contains(floatingFocusElement, t().activeElement(doc)) &&
          getTabbableContent().length === 0 && !isUntrappedTypeableCombobox) {
          stopEvent(event);
        }
      });
    }

    // Close on focus out, and restore focus inside the floating tree.
    if (closeOnFocusOut) {
      const handlePointerDown = () => {
        isPointerDown = true;
        clearTimeout(pointerDownTimer);
        pointerDownTimer = setTimeout(() => {
          isPointerDown = false;
        }, 0);
      };
      const handleFocusIn = (event) => {
        const target = getTarget(event);
        if (t().isTabbable(target)) lastFocusedTabbable = target;
      };
      const handleFocusOutside = (event) => {
        const relatedTarget = event.relatedTarget;
        const currentTarget = event.currentTarget;
        const target = getTarget(event);
        // Focus lost to the body (a backdrop press): remember what had it, so a
        // confirmation dialog opened then can return focus there.
        if (modal && relatedTarget == null && target != null && t().contains(floating, target)) {
          addPreviouslyFocusedElement(target);
        }
        queueMicrotask(() => {
          const insideElements = getResolvedInsideElements();
          const portalGuards = portalNode?._templPortalGuards;
          const isRelatedFocusGuard = relatedTarget?.hasAttribute?.("data-base-ui-focus-guard") &&
            [beforeGuard, afterGuard, portalGuards?.beforeOutside, portalGuards?.afterOutside, previousFocusableElement, nextFocusableElement].includes(relatedTarget);
          const insideChild = [...instances].some((other) => isChild(other) && t().contains(other.floating, relatedTarget));
          // An ancestor's popup or its reference, not the ancestor's items.
          const toAncestor = [...instances].some((other) => isAncestor(other) &&
            ([other.floating, getFloatingFocusElement(other.floating)].includes(relatedTarget) || other.reference === relatedTarget));
          const movedToUnrelatedNode = !(
            t().contains(domReference, relatedTarget) ||
            withinTree(floating, relatedTarget) ||
            t().contains(relatedTarget, floating) ||
            t().contains(portalNode, relatedTarget) ||
            insideElements.some((element) => element === relatedTarget || t().contains(element, relatedTarget)) ||
            (relatedTarget != null && triggers.includes(relatedTarget)) ||
            triggers.some((trigger) => t().contains(trigger, relatedTarget)) ||
            isRelatedFocusGuard ||
            insideChild ||
            toAncestor
          );
          if (currentTarget === domReference && floatingFocusElement) handleTabIndex(floatingFocusElement);

          // Focus lost outside the floating tree when its element went away.
          if (restoreFocus && currentTarget !== domReference && !t().isElementVisible(target) && t().activeElement(doc) === doc.body) {
            if (isHTMLElement(floatingFocusElement)) {
              floatingFocusElement.focus();
              if (restoreFocus === "popup") {
                requestAnimationFrame(() => floatingFocusElement.focus());
                return;
              }
            }
            const tabbableContent = getTabbableContent();
            const prevTabbable = lastFocusedTabbable;
            const nodeToFocus = (prevTabbable && tabbableContent.includes(prevTabbable) ? prevTabbable : null) ||
              tabbableContent[tabbableContent.length - 1] || floatingFocusElement;
            if (isHTMLElement(nodeToFocus)) nodeToFocus.focus();
          }

          if (insideReactTree) {
            insideReactTree = false;
            return;
          }

          // Focus moved out of the floating tree with no portal guard to handle it.
          if ((isUntrappedTypeableCombobox ? true : !modal) && relatedTarget && movedToUnrelatedNode && !isPointerDown &&
            (isUntrappedTypeableCombobox || relatedTarget !== getPreviouslyFocusedElement())) {
            preventReturnFocus = true;
            onOpenChange?.(false, "focus-out", event);
          }
        });
      };
      // Focus leaving through a portaled child still counts as inside.
      const markInsideReactTree = () => {
        if (pointerDownOutside) return;
        insideReactTree = true;
        clearTimeout(blurTimer);
        blurTimer = setTimeout(() => {
          insideReactTree = false;
        }, 0);
      };
      if (isHTMLElement(domReference)) {
        on(cleanups, domReference, "focusout", handleFocusOutside);
        on(cleanups, domReference, "pointerdown", handlePointerDown);
      }
      on(cleanups, floating, "focusin", handleFocusIn);
      on(cleanups, floating, "focusout", handleFocusOutside);
      if (portalNode) on(cleanups, floating, "focusout", markInsideReactTree, true);
    }

    // The effects that run while open. A popup that opens again during its
    // exit animation runs them again on the same manager.
    function open() {
      self.open = true;
      // The portal's outside guards render first, they count as inside below.
      window.templ.portal.setFocusManagerState(portalNode, { ...portalNode?._templFocusState, open: true });
      // Track pointer and keyboard interactions while open.
      on(openCleanups, doc, "pointerdown", (event) => {
        const target = getTarget(event);
        const insideElements = getResolvedInsideElements();
        const pointerTargetInside = t().contains(floating, target) || t().contains(domReference, target) ||
          t().contains(portalNode, target) || insideElements.some((element) => element === target || t().contains(element, target));
        pointerDownOutside = !pointerTargetInside;
        lastInteractionType = event.pointerType || "keyboard";
        if (target?.closest?.(`[${CLICK_TRIGGER_IDENTIFIER}]`)) {
          isPointerDown = true;
          clearTimeout(pointerDownTimer);
          pointerDownTimer = setTimeout(() => {
            isPointerDown = false;
          }, 0);
        }
      }, true);
      const clearPointerDownOutside = () => {
        pointerDownOutside = false;
      };
      on(openCleanups, doc, "pointerup", clearPointerDownOutside, true);
      on(openCleanups, doc, "pointercancel", clearPointerDownOutside, true);
      on(openCleanups, doc, "keydown", () => {
        lastInteractionType = "keyboard";
      }, true);
      openCleanups.push(clearPointerDownOutside);

      // Hide everything outside the floating tree from assistive tech while open.
      const nestedPortalNodes = Array.from(portalNode?.querySelectorAll("[data-base-ui-portal]") || []);
      const portalGuards = portalNode?._templPortalGuards;
      const insideElements = [
        floating, ...nestedPortalNodes, beforeGuard, afterGuard, portalGuards?.beforeOutside, portalGuards?.afterOutside,
        ...getResolvedInsideElements(), previousFocusableElement, nextFocusableElement,
        isUntrappedTypeableCombobox ? domReference : null,
      ].filter((x) => x != null);
      const ariaHiddenCleanup = window.templ.markOthers(insideElements, { ariaHidden: modal || isUntrappedTypeableCombobox, mark: false });
      const markerCleanup = window.templ.markOthers([floating, ...nestedPortalNodes].filter((x) => x != null));
      openCleanups.push(() => {
        markerCleanup();
        ariaHiddenCleanup();
      });

      // Focus the initial element.
      const previouslyFocusedElement = t().activeElement(doc);
      queueMicrotask(() => {
        const resolvedInitialFocus = typeof initialFocus === "function" ? initialFocus(openInteractionType || "") : initialFocus;
        if (resolvedInitialFocus === undefined || resolvedInitialFocus === false) return;
        if (t().contains(floatingFocusElement, previouslyFocusedElement)) return;
        const getDefaultFocusElement = () => getTabbableContent(floatingFocusElement)[0] || floatingFocusElement;
        let elToFocus = resolvedInitialFocus === true || resolvedInitialFocus === null ? getDefaultFocusElement() : resolvedInitialFocus;
        elToFocus = elToFocus || getDefaultFocusElement();
        const hadFocusInside = t().contains(floatingFocusElement, t().activeElement(doc));
        enqueueFocus(elToFocus, {
          preventScroll: elToFocus === floatingFocusElement,
          shouldFocus() {
            if (!self.open) return false;
            if (hadFocusInside) return true;
            const currentActiveElement = t().activeElement(doc);
            return !(currentActiveElement !== elToFocus && t().contains(floatingFocusElement, currentActiveElement));
          },
        });
      });
    }

    // Return focus targets, restored on unmount. Only a null interaction
    // type is a programmatic open.
    const elementFocusedBeforeOpen = t().activeElement(doc);
    const preferPreviousFocus = openInteractionType == null;
    addPreviouslyFocusedElement(elementFocusedBeforeOpen);

    function getReturnElement() {
      let resolved = typeof returnFocus === "function" ? returnFocus(closeType) : returnFocus;
      if (resolved === undefined || resolved === false) return null;
      if (resolved === null) resolved = true;
      const referenceReturnElement = domReference?.isConnected ? domReference : null;
      const previousReturnElement = elementFocusedBeforeOpen?.isConnected && elementFocusedBeforeOpen.nodeName.toLowerCase() !== "body"
        ? elementFocusedBeforeOpen
        : null;
      let defaultReturnElement = preferPreviousFocus
        ? previousReturnElement || referenceReturnElement
        : referenceReturnElement || previousReturnElement;
      if (!defaultReturnElement) defaultReturnElement = getPreviouslyFocusedElement() || null;
      if (typeof resolved === "boolean") return defaultReturnElement;
      return resolved || defaultReturnElement || null;
    }

    // The portal renders its outside guards for a non modal manager.
    window.templ.portal.setFocusManagerState(portalNode, {
      modal,
      closeOnFocusOut,
      open: false,
      onOpenChange,
      domReference,
      beforeInside: beforeGuard,
      afterInside: afterGuard,
    });
    if (floatingFocusElement) handleTabIndex(floatingFocusElement);
    instances.add(self);
    open();

    function close(details = {}) {
      if (!self.open) return;
      self.open = false;
      closeType = getEventType(details.event, lastInteractionType);
      if (details.reason === "trigger-hover" && details.event?.type === "mouseleave") preventReturnFocus = true;
      if (details.reason === "outside-press") {
        // An outside press returns focus without scrolling where the browser
        // supports preventScroll, everywhere current.
        const event = details.event;
        if (details.nested || (event && (isVirtualClick(event) || isVirtualPointerEvent(event)))) {
          preventReturnFocus = false;
        } else {
          let isPreventScrollSupported = false;
          doc.createElement("div").focus({
            get preventScroll() {
              isPreventScrollSupported = true;
              return false;
            },
          });
          preventReturnFocus = !isPreventScrollSupported;
        }
      }
      openCleanups.splice(0).forEach((cleanup) => cleanup());
      window.templ.portal.setFocusManagerState(portalNode, { ...portalNode?._templFocusState, open: false });
      // Safari may scroll to the bottom when an input inside the popup keeps
      // focus while it unmounts.
      const activeEl = t().activeElement(doc);
      if (webkit && isHTMLElement(activeEl) && isTypeableElement(activeEl) && t().contains(floating, activeEl)) activeEl.blur();
    }

    function unmount() {
      if (self.open) close();
      instances.delete(self);
      cleanups.splice(0).forEach((cleanup) => cleanup());
      clearTimeout(blurTimer);
      clearTimeout(pointerDownTimer);
      window.templ.portal.setFocusManagerState(portalNode, null);
      beforeGuard?.remove();
      afterGuard?.remove();

      const activeEl = t().activeElement(doc);
      const isFocusInsideFloatingTree = t().contains(floating, activeEl) ||
        getResolvedInsideElements().some((element) => element === activeEl || t().contains(element, activeEl)) ||
        [...instances].some((other) => isChild(other) && t().contains(other.floating, activeEl));
      const returnElement = getReturnElement();
      queueMicrotask(() => {
        const tabbableReturnElement = getFirstTabbableElement(returnElement);
        const hasExplicitReturnFocus = typeof returnFocus !== "boolean";
        // Focus that moved elsewhere after mount is respected.
        if (returnFocus && !preventReturnFocus && isHTMLElement(tabbableReturnElement) &&
          (!hasExplicitReturnFocus && tabbableReturnElement !== activeEl && activeEl !== doc.body ? isFocusInsideFloatingTree : true)) {
          tabbableReturnElement.focus({ preventScroll: true });
        }
        preventReturnFocus = false;
        clearDisconnectedPreviouslyFocusedElements();
      });
    }

    // beforeGuard is the source's beforeContentFocusGuardRef.
    return { open, close, unmount, beforeGuard };
  }

  window.templ = window.templ || {};
  window.templ.focusManager = { useFloatingFocusManager, createFocusGuard, enqueueFocus };
})();
