(function () {
  // shadcn's dropdown menu on Base UI's Menu (components/baseui/menu.js):
  // MenuTrigger and the root menu it opens. Base UI's MenuTrigger renders no
  // identifier: a menu trigger is whatever has aria-haspopup="menu" and links
  // a menu popup (data-templ-controls). The element may carry another
  // component's slot (sidebar.MenuButton).
  const TRIGGER = '[aria-haspopup="menu"][data-templ-controls]';

  const menu = window.templ.menu.create({
    slot: "dropdown-menu",
    event: "dropdownmenu",
    // shadcn's DropdownMenuSubContent.
    subPositioning: { side: "right", align: "start", sideOffset: 0, alignOffset: -3 },
    onItemPress: (content, event) => requestOpenChange(content, false, { reason: "item-press", event }),
  });

  // The id is the popup's, like Base UI's.
  function triggerFor(content) {
    return document.querySelector('[data-templ-controls="' + menu.popupFor(content).id + '"]');
  }

  function contentFor(trigger) {
    return menu.positionerById(trigger.getAttribute("data-templ-controls"));
  }

  // The dropdown trigger an event target sits in, if any.
  function triggerOf(target) {
    const trigger = target.closest && target.closest(TRIGGER);
    return trigger && !trigger.matches(menu.SUB_TRIGGER) && contentFor(trigger) ? trigger : null;
  }

  // MenuPositioner: useAnchorPositioning with the dropdown collision
  // avoidance, while the menu is mounted. It keeps the menu attached to its
  // trigger while ancestors move, resize, scroll or shift layout, which also
  // tracks a mobile sidebar while its opening transform settles.
  function startAutoPositioning(content, trigger) {
    stopAutoPositioning(content);
    const positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor: trigger,
      positioner: content,
      parts: [content, menu.popupFor(content)],
      // Read at open, like Base UI reads its side prop on render; a block that
      // switches side per viewport updates data-templ-side itself.
      side: content.getAttribute("data-templ-side") || "bottom",
      align: content.getAttribute("data-templ-align") || "start",
      sideOffset: parseFloat(content.getAttribute("data-templ-side-offset")) || 0,
      alignOffset: parseFloat(content.getAttribute("data-templ-align-offset")) || 0,
      collisionAvoidance: { fallbackAxisSide: "none" },
    });
    content._templPositionCleanup = positioning.cleanup;
    return positioning.positioned;
  }

  function stopAutoPositioning(content) {
    content._templPositionCleanup?.();
    content._templPositionCleanup = null;
  }

  // MenuPopup's FloatingFocusManager for a dropdown menu: non modal, with
  // MenuTrigger's focus guards around the trigger while it is open.
  function startFocusManager(content, trigger) {
    if (content._templFocus) {
      content._templFocus.open();
      return;
    }
    const onOpenChange = (open, reason, event) => requestOpenChange(content, open, { reason, event });
    content._templTriggerGuards = window.templ.triggerFocusGuards.attach(trigger, {
      positioner: content,
      beforeContentFocusGuard: () => content._templFocus?.beforeGuard,
      onClose: (event) => onOpenChange(false, "focus-out", event),
    });
    content._templFocus = window.templ.focusManager.useFloatingFocusManager({
      floating: content,
      reference: trigger,
      modal: false,
      openInteractionType: content._templOpenMethod === "programmatic" ? null : content._templOpenMethod,
      restoreFocus: true,
      previousFocusableElement: trigger,
      nextFocusableElement: content._templTriggerGuards.focusTarget,
      onOpenChange,
    });
  }

  function stopFocusManager(content) {
    content._templFocus?.unmount();
    content._templFocus = null;
    content._templTriggerGuards?.remove();
    content._templTriggerGuards = null;
  }

  // details { reason, event } of the open.
  function open(content, trigger, details = {}) {
    menu.allPositioners().forEach((c) => {
      if (c !== content) close(c);
    });
    content._templOpenMethod = trigger._templOpenMethod || "programmatic";
    menu.mountPortal(content);
    // A modal menu (Base UI's default) renders the internal backdrop with a
    // hole over the trigger.
    menu.mountBackdrop(content, trigger);
    // MenuTrigger renders aria-controls while the popup is open
    // (triggerPopupId).
    trigger.setAttribute("aria-controls", menu.popupFor(content).id);
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: content,
      reference: trigger,
      onOpenChange: (open, reason, event) => requestOpenChange(content, open, { reason, event }),
    });
    startFocusManager(content, trigger);

    // Positioned first, then the enter animation plays in place.
    const finish = () => {
      if (content.hidden || !content.isConnected) return;
      // useAnchoredPopupScrollLock for the modal menu, measured on the
      // positioned popup for touch opens.
      content._templReleaseScroll?.();
      content._templReleaseScroll = window.templ.scrollLock.anchoredPopup(
        true, content._templOpenMethod === "touch", content, trigger,
      );
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("data-popup-open", "");
      trigger.setAttribute("data-pressed", "");
      menu.afterRootOpen(content, details);
    };
    startAutoPositioning(content, trigger).then(finish, finish);
  }

  // details { reason, event } of the close, for the focus manager.
  function close(content, details = {}) {
    if (content.hidden) return;
    content._templDismiss?.();
    content._templDismiss = null;
    content._templFocus?.close(details);
    const trigger = triggerFor(content);
    if (trigger) {
      trigger.removeAttribute("aria-controls");
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("data-popup-open");
      trigger.removeAttribute("data-pressed");
    }
    // Positioned until it unmounts, like Base UI. Unmounting the focus
    // manager returns focus.
    menu.closeRoot(content, details, () => {
      stopAutoPositioning(content);
      stopFocusManager(content);
    });
    content._templReleaseScroll?.();
    content._templReleaseScroll = null;
  }

  function requestOpenChange(content, nextOpen, details = {}) {
    if (!content || menu.isOpen(content) === nextOpen) return false;
    const accepted = content.dispatchEvent(
      new CustomEvent("dropdownmenu-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: nextOpen },
      }),
    );
    if (!accepted || content.hasAttribute("data-templ-open")) return false;
    const trigger = triggerFor(content);
    if (nextOpen && trigger) open(content, trigger, details);
    else if (!nextOpen) close(content, details);
    return true;
  }

  // MenuTrigger's onMouseMove: hover opening of submenus starts once the
  // pointer moved.
  document.addEventListener("mousemove", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = triggerOf(e.target);
    const popup = trigger && menu.popupFor(contentFor(trigger));
    if (popup) popup._templAllowMouseEnter = true;
  });

  // ----- init -------------------------------------------------------------------

  // MenuTrigger's useClick: a mouse or touch press opens on mousedown, one
  // frame later, Enter and Space arrive as the click a native button fires.
  function listenForClick(content, trigger) {
    return window.templ.click.useClick(trigger, {
      event: "mousedown",
      isOpen: () => menu.isOpen(content),
      onOpenChange(nextOpen, event, pointerType) {
        if (trigger.disabled) return;
        trigger._templOpenMethod = pointerType || "keyboard";
        requestOpenChange(content, nextOpen, { reason: "trigger-press", event });
      },
    });
  }

  // A content unmounts with its portal owner: a portaled one is removed from
  // <body> then.
  window.templ.lifecycle.register(menu.POPUP, {
    init(popup) {
      const content = popup.parentElement;
      const trigger = menu.isPositioner(content) && triggerFor(content);
      if (!trigger) return;
      content._templClickCleanup = listenForClick(content, trigger);
      menu.startListNavigation(popup, trigger, () => menu.isOpen(content), (open, reason, event) => {
        if (trigger.disabled) return;
        if (open) trigger._templOpenMethod = "keyboard";
        requestOpenChange(content, open, { reason, event });
      });
      menu.initRoot(content);
      // Server-side open state (Base UI open or defaultOpen).
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        open(content, trigger);
      }
    },
    destroy(popup) {
      const content = popup.parentElement;
      if (!menu.isPositioner(content)) return;
      content._templClickCleanup?.();
      stopAutoPositioning(content);
      content._templReleaseScroll?.();
      content._templReleaseScroll = null;
      content._templDismiss?.();
      stopFocusManager(content);
      menu.destroyRoot(content);
    },
  });
})();
