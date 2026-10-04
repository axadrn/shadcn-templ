(function () {
  // Constants from Base UI's popover, shadcn's reference implementation.

  // The popover's element is the positioner (shadcn's isolate z-50 wrapper,
  // no slot) around the [data-slot=popover-content] popup.
  const POPUP = '[data-slot="popover-content"]';
  // Base UI's PopoverTrigger identifier, shared with DialogTrigger; the
  // data-templ-controls target tells the two apart.
  const CLICK_TRIGGER = "[data-base-ui-click-trigger][data-templ-controls]";

  function isPositioner(el) {
    // The popup is the positioner's slotted child, next to the focus guards.
    return !!el?.querySelector?.(":scope > " + POPUP);
  }

  function allContents() {
    return [...document.querySelectorAll(POPUP)].map((p) => p.parentElement).filter(isPositioner);
  }

  // The id is the popup's, like Base UI's, which data-templ-controls on
  // the triggers names.
  function idOf(content) {
    return popupFor(content)?.id || "";
  }

  function triggersFor(content) {
    return [...document.querySelectorAll('[data-templ-controls="' + idOf(content) + '"]')];
  }

  function triggerFor(content) {
    return triggersFor(content)[0] || null;
  }

  // Base UI keeps the active trigger by the id of the element that opened
  // the popup, a trigger compares it with its own id (useBaseUiId). An
  // element that renders the trigger with an id of its own never matches:
  // that trigger renders no open state, no aria-controls and no focus
  // guards.
  // An open without a trigger (the open prop, window.templ.popover.open)
  // makes the registered trigger the active one, whatever its id.
  function isOpenedByTrigger(trigger, content) {
    return trigger.id === idOf(content) + "-trigger" || content._templProgrammaticOpen === true;
  }

  // The positioner from its popup's id, the popup or the positioner.
  function resolve(target) {
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el) return null;
    if (isPositioner(el)) return el;
    return el.matches?.(POPUP) && isPositioner(el.parentElement) ? el.parentElement : null;
  }

  function contentFor(trigger) {
    return resolve(trigger.getAttribute("data-templ-controls"));
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

  function popupFor(content) {
    return content.querySelector(":scope > " + POPUP);
  }

  // The popup renders the transition status, its positioner the open state.
  function partsOf(content) {
    return { positioner: content, parts: [popupFor(content)] };
  }

  // The positioner's parent is the portal node, which moves to <body>
  // (shadcn portals it the same way).
  function portalNodeOf(content) {
    return content.parentElement;
  }

  // PopoverPortal mounts with the popup.
  function portal(content) {
    const node = portalNodeOf(content);
    window.templ.portal.render(node);
    node.hidden = false;
    wireAria(content);
  }

  // Base UI links Title/Description to the popup via aria-labelledby and
  // aria-describedby with generated ids.
  function wireAria(content) {
    const popup = popupFor(content);
    if (!popup) return;
    const title = popup.querySelector("[data-slot=popover-title]");
    if (title) {
      if (!title.id) title.id = idOf(content) + "-title";
      popup.setAttribute("aria-labelledby", title.id);
    }
    const description = popup.querySelector("[data-slot=popover-description]");
    if (description) {
      if (!description.id) description.id = idOf(content) + "-description";
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

  function requestOpenChange(content, nextOpen, details) {
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
    else close(content, details);
    return true;
  }

  // PopoverPopup's FloatingFocusManager, non modal like shadcn's popover,
  // with PopoverTrigger's focus guards around the trigger while mounted.
  function startFocusManager(content) {
    if (content._templFocus) {
      content._templFocus.open();
      return;
    }
    const trigger = triggerFor(content);
    const popup = popupFor(content);
    const onOpenChange = (open, reason, event) => requestOpenChange(content, open, { reason, event });
    content._templTriggerGuards = trigger && isOpenedByTrigger(trigger, content) ? window.templ.triggerFocusGuards.attach(trigger, {
      positioner: content,
      beforeContentFocusGuard: () => content._templFocus?.beforeGuard,
      onClose: (event) => onOpenChange(false, "focus-out", event),
    }) : null;
    content._templFocus = window.templ.focusManager.useFloatingFocusManager({
      floating: content,
      reference: trigger,
      triggers: triggersFor(content),
      modal: false,
      openInteractionType: content._templOpenMethod ?? null,
      // Opened by touch the popup takes focus, so the virtual keyboard stays
      // closed (createDefaultInitialFocus).
      initialFocus: (interactionType) => (interactionType === "touch" ? popup : true),
      restoreFocus: "popup",
      previousFocusableElement: trigger,
      nextFocusableElement: content._templTriggerGuards?.focusTarget,
      onOpenChange,
    });
  }

  function stopFocusManager(content) {
    content._templFocus?.unmount();
    content._templFocus = null;
    content._templTriggerGuards?.remove();
    content._templTriggerGuards = null;
  }

  function open(target) {
    const content = resolve(target);
    if (!content || isOpen(content)) return;
    allContents().forEach((c) => {
      if (c !== content) close(c);
    });
    portal(content);
    content.hidden = false;
    // PopoverTrigger renders aria-controls while the popup is open
    // (triggerPopupId).
    triggersFor(content).forEach((trigger) => isOpenedByTrigger(trigger, content) && trigger.setAttribute("aria-controls", idOf(content)));
    // useDismiss runs while open. Base UI's non modal popover dismisses a
    // mouse press on the click, a touch on the press.
    content._templDismiss = window.templ.dismiss.useDismiss({
      floating: content,
      reference: triggersFor(content),
      outsidePressEvent: { mouse: "intentional", touch: "sloppy" },
      onOpenChange: (open, reason, event) => requestOpenChange(content, open, { reason, event }),
    });
    startFocusManager(content);

    // Positioned first, then the enter animation plays in place.
    const finish = () => {
      const popup = popupFor(content);
      if (content.hidden) return;
      window.templ.transition.open(partsOf(content));
      const trigger = triggerFor(content);
      if (trigger && isOpenedByTrigger(trigger, content)) {
        trigger.setAttribute("aria-expanded", "true");
        trigger.setAttribute("data-popup-open", "");
        // pressableTriggerOpenStateMapping: pressed only when a press opened it.
        if (!content._templProgrammaticOpen) trigger.setAttribute("data-pressed", "");
      }
    };
    startAutoPositioning(content).then(finish, finish);
  }

  // details { reason, event } of the close, for the focus manager.
  function close(target, details) {
    const content = resolve(target);
    if (!content || content.hidden) return;
    content._templProgrammaticOpen = false;
    content._templDismiss?.();
    content._templDismiss = null;
    content._templFocus?.close(details);
    // Positioned until it unmounts, like Base UI. Unmounting the focus
    // manager returns focus.
    triggersFor(content).forEach((trigger) => trigger.removeAttribute("aria-controls"));
    window.templ.transition.close(partsOf(content), popupFor(content), () => {
      stopAutoPositioning(content);
      stopFocusManager(content);
      content.hidden = true;
      portalNodeOf(content).hidden = true;
    });
    const trigger = triggerFor(content);
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("data-popup-open");
      trigger.removeAttribute("data-pressed");
    }
  }

  function closeAll() {
    allContents().forEach((content) => close(content));
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

  // interactionType is how the trigger opened it (useOpenInteractionType),
  // null for a programmatic open.
  function toggle(target, interactionType = null) {
    const content = resolve(target);
    if (!content) return;
    content._templOpenMethod = interactionType;
    requestOpenChange(content, !isOpen(content));
  }

  // Pointer interactions toggle and dismiss on PRESS, exactly like Base UI.
  // Click is never used for open/close, so the stray click the browser fires
  // on body when the popup ends up under the released pointer is harmless.
  // PopoverTrigger's useClick with its default click event, on every trigger
  // of the popover.
  function listenForClick(content) {
    const cleanups = triggersFor(content).map((trigger) =>
      window.templ.click.useClick(trigger, {
        isOpen: () => isOpen(content),
        onOpenChange(nextOpen, event, pointerType) {
          if (trigger.disabled) return;
          content._templOpenMethod = pointerType || "keyboard";
          requestOpenChange(content, nextOpen);
        },
      }),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }

  // Content stays in its hidden portal node until it opens. It unmounts with
  // its portal owner: a portaled one is removed from <body> then.
  window.templ.lifecycle.register(POPUP, {
    init(popup) {
      const content = popup.parentElement;
      const trigger = isPositioner(content) && triggerFor(content);
      if (!trigger) return;
      content._templClickCleanup = listenForClick(content);
      // Server-side open state (Base UI open or defaultOpen).
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        open(content);
      }
    },
    destroy(popup) {
      const content = popup.parentElement;
      if (!isPositioner(content)) return;
      content._templClickCleanup?.();
      content._templDismiss?.();
      stopAutoPositioning(content);
      stopFocusManager(content);
      window.templ.portal.remove(portalNodeOf(content));
    },
  });

  window.templ = window.templ || {};
  window.templ.popover = {
    open(target) {
      const content = resolve(target);
      if (content && !isOpen(content)) content._templProgrammaticOpen = true;
      open(target);
    },
    close,
    closeAll,
    closeNearest,
    toggle,
    isOpen: (c) => {
      c = resolve(c);
      return !!c && isOpen(c);
    },
  };
})();
