(function () {
  // Constants from Base UI's popover, shadcn's reference implementation.

  // The popover's element is the positioner (shadcn's isolate z-50 wrapper,
  // no slot) around the [data-slot=popover-content] popup.
  const POPUP = '[data-slot="popover-content"]';
  // Base UI's PopoverTrigger identifier, shared with DialogTrigger; the
  // aria-controls target tells the two apart.
  const CLICK_TRIGGER = "[data-base-ui-click-trigger][aria-controls]";

  function isPositioner(el) {
    return !!(el && el.firstElementChild && el.firstElementChild.matches(POPUP));
  }

  function allContents() {
    return [...document.querySelectorAll(POPUP)].map((p) => p.parentElement).filter(isPositioner);
  }

  function triggerFor(content) {
    return document.querySelector('[aria-controls="' + content.id + '"]');
  }

  function contentFor(trigger) {
    const el = document.getElementById(trigger.getAttribute("aria-controls"));
    return isPositioner(el) ? el : null;
  }

  // The popover trigger an event target sits in, if any.
  function triggerOf(target) {
    const trigger = target.closest && target.closest(CLICK_TRIGGER);
    return trigger && contentFor(trigger) ? trigger : null;
  }

  // The popover positioner an element sits in, if any.
  function positionerOf(target) {
    const popup = target.closest && target.closest(POPUP);
    return popup && isPositioner(popup.parentElement) ? popup.parentElement : null;
  }

  // Focus waits until after the input task:
  // Chromium's mousedown default focuses the trigger, WebKit's clears focus.
  // One frame, like Base UI, with a guard for a popup that closed meanwhile.
  function enqueueFocus(el, shouldFocus) {
    if (!el) return;
    requestAnimationFrame(() => {
      if (shouldFocus && !shouldFocus()) return;
      el.focus({ preventScroll: true });
    });
  }

  function popupFor(content) {
    return content.firstElementChild;
  }

  // The popup renders the transition status, its positioner the open state.
  function partsOf(content) {
    return { positioner: content, parts: [popupFor(content)] };
  }

  // Moves the content to <body> (shadcn portals it the same way).
  function portal(content) {
    window.templ.portal.render(content);
    wireAria(content);
  }

  // Base UI links Title/Description to the popup via aria-labelledby and
  // aria-describedby with generated ids.
  function wireAria(content) {
    const popup = popupFor(content);
    if (!popup) return;
    const title = popup.querySelector("[data-slot=popover-title]");
    if (title) {
      if (!title.id) title.id = content.id + "-title";
      popup.setAttribute("aria-labelledby", title.id);
    }
    const description = popup.querySelector("[data-slot=popover-description]");
    if (description) {
      if (!description.id) description.id = content.id + "-description";
      popup.setAttribute("aria-describedby", description.id);
    }
  }

  // PopoverPositioner: useAnchorPositioning with the popup collision
  // avoidance, while the popup is mounted.
  function startAutoPositioning(content) {
    stopAutoPositioning(content);
    const trigger = triggerFor(content);
    if (!trigger) return Promise.resolve();
    const positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor: trigger,
      positioner: content,
      parts: [content, popupFor(content)],
      side: content.getAttribute("data-templ-side") || "bottom",
      align: content.getAttribute("data-templ-align") || "center",
      sideOffset: parseFloat(content.getAttribute("data-templ-side-offset")) || 0,
      alignOffset: parseFloat(content.getAttribute("data-templ-align-offset")) || 0,
    });
    content._templPositionCleanup = positioning.cleanup;
    return positioning.positioned;
  }

  function stopAutoPositioning(content) {
    if (!content._templPositionCleanup) return;
    content._templPositionCleanup();
    content._templPositionCleanup = null;
  }

  function isOpen(content) {
    return content.hasAttribute("data-open");
  }

  function requestOpenChange(content, nextOpen, returnFocus) {
    if (!content || isOpen(content) === nextOpen) return false;
    const accepted = content.dispatchEvent(
      new CustomEvent("popover-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: nextOpen },
      }),
    );
    if (!accepted || content.hasAttribute("data-templ-open")) return false;
    if (nextOpen) open(content);
    else close(content, returnFocus);
    return true;
  }

  function open(content) {
    if (typeof content === "string") content = document.getElementById(content);
    if (!content || isOpen(content)) return;
    allContents().forEach((c) => {
      if (c !== content) close(c);
    });
    portal(content);
    content.hidden = false;
    // useDismiss runs while open. Base UI's non modal popover dismisses a
    // mouse press on the click, a touch on the press.
    content._templDismiss = window.templ.dismiss.useDismiss({
      floating: content,
      reference: [...document.querySelectorAll('[aria-controls="' + content.id + '"]')],
      outsidePressEvent: { mouse: "intentional", touch: "sloppy" },
      // Focus follows an outside press instead of returning to the trigger.
      onOpenChange: (open, reason) => requestOpenChange(content, open, reason !== "outside-press"),
    });

    // Positioned first, then the enter animation plays in place.
    const finish = () => {
      const popup = popupFor(content);
      if (content.hidden) return;
      window.templ.transition.open(partsOf(content));
      const trigger = triggerFor(content);
      if (trigger) {
        trigger.setAttribute("aria-expanded", "true");
        trigger.setAttribute("data-popup-open", "");
        trigger.setAttribute("data-pressed", "");
      }
      // Base UI moves focus into the popup when it opens.
      if (popup && !content.contains(document.activeElement)) {
        enqueueFocus(popup, () => isOpen(content));
      }
    };
    startAutoPositioning(content).then(finish, finish);
  }

  // returnFocus false skips the focus restore, like Base UI on pointer
  // dismiss: focus follows the outside press instead of the trigger.
  function close(content, returnFocus) {
    if (typeof content === "string") content = document.getElementById(content);
    if (!content || content.hidden) return;
    content._templDismiss?.();
    content._templDismiss = null;
    if (returnFocus !== false && content.contains(document.activeElement)) {
      const focusTrigger = triggerFor(content);
      if (focusTrigger) focusTrigger.focus({ preventScroll: true });
    }
    // Positioned until it unmounts, like Base UI.
    window.templ.transition.close(partsOf(content), popupFor(content), () => {
      stopAutoPositioning(content);
      content.hidden = true;
    });
    const trigger = triggerFor(content);
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("data-popup-open");
      trigger.removeAttribute("data-pressed");
    }
  }

  function closeAll(returnFocus) {
    allContents().forEach((content) => close(content, returnFocus));
  }

  function closeNearest(element) {
    if (!element) return;
    const trigger = triggerOf(element);
    const inner = element.querySelector && element.querySelector(POPUP);
    const content =
      positionerOf(element) ||
      (trigger && contentFor(trigger)) ||
      (inner && isPositioner(inner.parentElement) ? inner.parentElement : null);
    if (content) requestOpenChange(content, false);
  }

  function toggle(content) {
    if (typeof content === "string") content = document.getElementById(content);
    if (!content) return;
    requestOpenChange(content, !isOpen(content));
  }

  // Pointer interactions toggle and dismiss on PRESS, exactly like Base UI.
  // Click is never used for open/close, so the stray click the browser fires
  // on body when the popup ends up under the released pointer is harmless.
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    const trigger = triggerOf(e.target);
    if (trigger) {
      if (trigger.disabled) return;
      const content = contentFor(trigger);
      if (content) toggle(content);
    }
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = triggerOf(e.target);
    if (trigger) {
      // Keyboard activation only (Enter/Space fire a detail-0 click without
      // a preceding pointerdown); pointer presses are handled on pointerdown.
      if (e.detail === 0 && !trigger.disabled) {
        const content = contentFor(trigger);
        if (content) toggle(content);
      }
    }
  });



  // Content stays in its hidden portal node until it opens. It unmounts with
  // its portal owner: a portaled one is removed from <body> then.
  window.templ.lifecycle.register(POPUP, {
    init(popup) {
      const content = popup.parentElement;
      const trigger = isPositioner(content) && triggerFor(content);
      if (!trigger) return;
      // Server-side open state (Base UI open or defaultOpen).
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        open(content);
      }
    },
    destroy(popup) {
      const content = popup.parentElement;
      if (!isPositioner(content)) return;
      content._templDismiss?.();
      stopAutoPositioning(content);
      if (content.isConnected) content.remove();
    },
  });

  window.templ = window.templ || {};
  window.templ.popover = {
    open,
    close,
    closeAll,
    closeNearest,
    toggle,
    isOpen: (c) => {
      if (typeof c === "string") c = document.getElementById(c);
      return !!c && isOpen(c);
    },
  };
})();
