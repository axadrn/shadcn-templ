// Port of @base-ui/react floating-ui-react/hooks/useFocus.ts (1.6.0). Opens
// a popup while its trigger has visible focus, like CSS :focus-visible.
//
//   const focus = window.templ.focus.useFocus(trigger, context, options)
//   focus.openChange(open, reason)   after every open change, the store's openchange
//   focus.cleanup()
//
// context is the floating root context as in use_hover.js: isOpen(),
// onOpenChange(open, reason, event), domReference(), floating(), triggers().
// Options: enabled() and delay (ms or a function).
(function () {
  "use strict";

  const t = () => window.templ.tabbable;
  const TYPEABLE_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
  const isMacSafari = /Mac/.test(navigator.platform) && /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);

  function matchesFocusVisible(element) {
    try {
      return element.matches(":focus-visible");
    } catch {
      return true;
    }
  }

  function isInsideEnabledTrigger(target, triggers) {
    if (!(target instanceof Element)) return false;
    const trigger = triggers.find((element) => t().contains(element, target));
    return !!trigger && !trigger.hasAttribute("data-trigger-disabled");
  }

  function useFocus(trigger, context, options = {}) {
    const { enabled = () => true, delay } = options;
    const win = trigger.ownerDocument.defaultView;
    let blockFocus = false;
    // The reference blocked from reopening after an Escape or press dismissal.
    let blockedReference = null;
    let keyboardModality = true;
    let timeout = 0;
    const startTimeout = (ms, fn) => {
      clearTimeout(timeout);
      timeout = setTimeout(fn, ms);
    };

    // Focus that stays on a closed trigger while the window loses it does
    // not open the popup when the window comes back.
    function onWindowBlur() {
      const reference = context.domReference();
      if (!context.isOpen() && reference === t().activeElement(reference.ownerDocument)) blockFocus = true;
    }
    const onKeyDown = () => {
      keyboardModality = true;
    };
    const onPointerDown = () => {
      keyboardModality = false;
    };

    function resetBlockedFocus() {
      blockFocus = false;
      blockedReference = null;
    }

    function onFocus(event) {
      if (!enabled()) return;
      const focusTarget = event.currentTarget;
      if (blockFocus) {
        if (blockedReference === focusTarget) return;
        resetBlockedFocus();
      }
      const target = event.target;
      if (target instanceof Element) {
        // Safari does not match :focus-visible when the focus came from
        // outside the document.
        if (isMacSafari && !event.relatedTarget) {
          if (!keyboardModality && !target.matches(TYPEABLE_SELECTOR)) return;
        } else if (!matchesFocusVisible(target)) {
          return;
        }
      }
      const movedFromOtherEnabledTrigger = isInsideEnabledTrigger(event.relatedTarget, context.triggers());
      const delayValue = typeof delay === "function" ? delay() : delay;
      if ((context.isOpen() && movedFromOtherEnabledTrigger) || delayValue === 0 || delayValue === undefined) {
        context.onOpenChange(true, "trigger-focus", event);
        return;
      }
      startTimeout(delayValue, () => {
        if (blockFocus) return;
        context.onOpenChange(true, "trigger-focus", event);
      });
    }

    function onBlur(event) {
      if (!enabled()) return;
      resetBlockedFocus();
      const relatedTarget = event.relatedTarget;
      // Moving to a non modal focus manager's portal guard, focus goes into
      // the popup right after.
      const movedToFocusGuard = relatedTarget instanceof Element &&
        relatedTarget.hasAttribute("data-base-ui-focus-guard") && relatedTarget.getAttribute("data-type") === "outside";
      // Waits for the window blur listener.
      startTimeout(0, () => {
        const reference = context.domReference();
        const activeEl = t().activeElement(reference.ownerDocument);
        // Focus left the page: keep it open.
        if (!relatedTarget && activeEl === reference) return;
        // A click into the popup keeps it open.
        if (t().contains(context.floating(), activeEl) || t().contains(reference, activeEl) || movedToFocusGuard) return;
        // Another trigger's focus handler takes over.
        if (isInsideEnabledTrigger(relatedTarget ?? activeEl, context.triggers())) return;
        context.onOpenChange(false, "trigger-focus", event);
      });
    }

    trigger.addEventListener("mouseleave", resetBlockedFocus);
    trigger.addEventListener("focusin", onFocus);
    trigger.addEventListener("focusout", onBlur);
    win.addEventListener("blur", onWindowBlur);
    if (isMacSafari) {
      win.addEventListener("keydown", onKeyDown, true);
      win.addEventListener("pointerdown", onPointerDown, true);
    }

    return {
      // The source's openchange listener: a close by pressing the trigger or
      // by Escape blocks the focus from reopening it.
      openChange(open, reason) {
        if (reason === "trigger-press" || reason === "escape-key") {
          blockedReference = context.domReference();
          blockFocus = true;
        }
      },
      cleanup() {
        clearTimeout(timeout);
        trigger.removeEventListener("mouseleave", resetBlockedFocus);
        trigger.removeEventListener("focusin", onFocus);
        trigger.removeEventListener("focusout", onBlur);
        win.removeEventListener("blur", onWindowBlur);
        win.removeEventListener("keydown", onKeyDown, true);
        win.removeEventListener("pointerdown", onPointerDown, true);
      },
    };
  }

  window.templ = window.templ || {};
  window.templ.focus = { useFocus };
})();
