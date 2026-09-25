// Port of @base-ui/react utils/popups/useTriggerFocusGuards.ts (1.6.0) with the
// guards PopoverTrigger and MenuTrigger render around their trigger while
// their non modal popup is mounted.
//
//   const guards = window.templ.triggerFocusGuards.attach(trigger, options)
//   guards.focusTarget   the guard after the trigger, the focus manager's
//                        nextFocusableElement
//   guards.remove()      once the popup unmounted
//
//   positioner                 the popup's positioner
//   beforeContentFocusGuard()  the focus manager's guard before the content
//   onClose(event)             closes the popup (reason focus-out)
//
// Tabbing out of the trigger backwards closes the popup and moves on; tabbing
// forward enters the popup through its content guard, and leaving the popup
// forward closes it and moves past it.
(function () {
  "use strict";

  const t = () => window.templ.tabbable;

  function attach(trigger, { positioner, beforeContentFocusGuard, onClose }) {
    const { createFocusGuard } = window.templ.focusManager;
    const preFocusGuard = createFocusGuard(null, (event) => {
      onClose(event);
      t().getTabbableBeforeElement(preFocusGuard)?.focus();
    });
    const focusTarget = createFocusGuard(null, (event) => {
      if (positioner && t().isOutsideEvent(event, positioner)) {
        beforeContentFocusGuard()?.focus();
        return;
      }
      onClose(event);
      let nextTabbable = t().getTabbableAfterElement(focusTarget || trigger);
      while (nextTabbable !== null && t().contains(positioner, nextTabbable)) {
        const prevTabbable = nextTabbable;
        nextTabbable = t().getNextTabbable(nextTabbable);
        if (nextTabbable === prevTabbable) break;
      }
      nextTabbable?.focus();
    });
    trigger.before(preFocusGuard);
    trigger.after(focusTarget);
    return {
      focusTarget,
      remove() {
        preFocusGuard.remove();
        focusTarget.remove();
      },
    };
  }

  window.templ = window.templ || {};
  window.templ.triggerFocusGuards = { attach };
})();
