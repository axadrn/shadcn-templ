(function () {
  // shadcn's context menu on Base UI's Menu (components/baseui/menu.js):
  // ContextMenu.Trigger and the root menu it opens at the cursor. Base UI
  // links the trigger and its menu through context only; the port marker
  // carries the popup id.
  const TRIGGER = "[data-templ-context-menu-trigger]";

  const menu = window.templ.menu.create({
    slot: "context-menu",
    event: "contextmenu",
    // shadcn's ContextMenuSubContent, fixed like every positioner in a
    // context menu.
    subPositioning: { side: "right", align: "start", sideOffset: 0, alignOffset: 4, positionMethod: "fixed" },
    onItemPress: (content, event) => requestOpenChange(content, false, { reason: "item-press", event }),
  });

  function contentFor(trigger) {
    return menu.positionerById(trigger.getAttribute("data-templ-context-menu-trigger"));
  }

  function triggerFor(content) {
    return document.querySelector('[data-templ-context-menu-trigger="' + menu.popupFor(content).id + '"]');
  }

  // MenuPopup's FloatingFocusManager for a context menu: modal, so focus stays
  // in the menu and the outside is hidden, focus returns on unmount.
  function startFocusManager(content, touchOpen) {
    if (content._templFocus) {
      content._templFocus.open();
      return;
    }
    content._templFocus = window.templ.focusManager.useFloatingFocusManager({
      floating: content,
      reference: triggerFor(content),
      modal: true,
      openInteractionType: touchOpen ? "touch" : "mouse",
      restoreFocus: true,
      onOpenChange: (open, reason, event) => requestOpenChange(content, open, { reason, event }),
    });
  }

  function stopFocusManager(content) {
    content._templFocus?.unmount();
    content._templFocus = null;
  }

  // A zero-size rect at the cursor acts as the anchor element.
  function cursorAnchor(x, y) {
    return {
      getBoundingClientRect: function () {
        return { x: x, y: y, top: y, bottom: y, left: x, right: x, width: 0, height: 0 };
      },
    };
  }

  // The context menu's MenuPositioner: fixed against the cursor, the
  // dropdown collision avoidance with the cross axis shift, no arrow padding.
  function positionAt(content, x, y) {
    stopAutoPositioning(content);
    const positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor: cursorAnchor(x, y),
      positioner: content,
      parts: [content, menu.popupFor(content)],
      positionMethod: "fixed",
      side: content.getAttribute("data-templ-side") || "right",
      align: content.getAttribute("data-templ-align") || "start",
      sideOffset: parseFloat(content.getAttribute("data-templ-side-offset")) || 0,
      alignOffset: parseFloat(content.getAttribute("data-templ-align-offset")) || 0,
      arrowPadding: 0,
      collisionAvoidance: { fallbackAxisSide: "none" },
      shiftCrossAxis: true,
    });
    content._templPositionCleanup = positioning.cleanup;
    return positioning.positioned;
  }

  function stopAutoPositioning(content) {
    content._templPositionCleanup?.();
    content._templPositionCleanup = null;
  }

  // ----- open / close --------------------------------------------------------

  // details { reason, event, x, y, touch } of the open.
  function openAt(content, details) {
    const { x, y, touch = false } = details;
    const alreadyOpen = menu.isOpen(content);
    menu.allPositioners().forEach((c) => {
      if (c !== content) requestOpenChange(c, false);
    });
    menu.mountPortal(content);
    // The context menu is modal: the internal backdrop covers everything.
    if (!alreadyOpen) menu.mountBackdrop(content, null);
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: content,
      reference: triggerFor(content),
      onOpenChange: (open, reason, event) => requestOpenChange(content, open, { reason, event }),
    });
    startFocusManager(content, touch);

    const lockScroll = () => {
      // useAnchoredPopupScrollLock: a native touch context menu follows the
      // touch rule.
      content._templReleaseScroll?.();
      content._templReleaseScroll = window.templ.scrollLock.anchoredPopup(
        true, touch, content, triggerFor(content),
      );
    };

    if (alreadyOpen) {
      // Right-click somewhere else while open: move over to the new spot.
      menu.closeSubs(content);
      positionAt(content, x, y).then(() => {
        if (content.isConnected && menu.isOpen(content)) lockScroll();
      });
      return;
    }

    // Fresh open: positioned first, then the enter animation plays at the
    // cursor.
    positionAt(content, x, y).then(() => {
      if (content.hidden || !content.isConnected) return; // closed or removed meanwhile
      lockScroll();
      setTriggerOpen(content, true);
      menu.afterRootOpen(content, details);
    });
  }

  function close(content, details = {}) {
    if (content.hidden) return;
    content._templDismiss?.();
    content._templDismiss = null;
    content._templFocus?.close(details);
    setTriggerOpen(content, false);
    // Positioned until it unmounts, like Base UI. Unmounting the focus
    // manager returns focus.
    menu.closeRoot(content, details, () => {
      stopAutoPositioning(content);
      stopFocusManager(content);
    });
    content._templReleaseScroll?.();
    content._templReleaseScroll = null;
  }

  // ContextMenuTrigger's state attributes while its menu is open.
  function setTriggerOpen(content, open) {
    const trigger = triggerFor(content);
    trigger?.toggleAttribute("data-popup-open", open);
    trigger?.toggleAttribute("data-pressed", open);
  }

  function requestOpenChange(content, nextOpen, details = {}) {
    const trigger = triggerFor(content);
    const accepted = (trigger || content).dispatchEvent(new CustomEvent("contextmenu-open-change", {
      bubbles: true,
      cancelable: true,
      detail: { open: nextOpen },
    }));
    if (!accepted || content.hasAttribute("data-templ-open")) return false;
    if (nextOpen) openAt(content, details);
    else close(content, details);
    return true;
  }

  // ----- init -------------------------------------------------------------------

  window.templ.lifecycle.register(TRIGGER, {
    init(trigger) {
      // Server-side open state (Base UI open or defaultOpen).
      const content = contentFor(trigger);
      if (content && (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open"))) {
        const rect = trigger.getBoundingClientRect();
        openAt(content, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
    },
  });

  // A content unmounts with its portal owner: a portaled one is removed from
  // <body> then.
  window.templ.lifecycle.register(menu.POPUP, {
    init(popup) {
      const content = popup.parentElement;
      if (!menu.isPositioner(content)) return;
      // Base UI nests a context menu's root in its ContextMenu.Root: ArrowLeft
      // closes it, and no arrow key opens it.
      menu.startListNavigation(popup, triggerFor(content), () => menu.isOpen(content),
        (open, reason, event) => requestOpenChange(content, open, { reason, event }),
        { nested: true, openOnArrowKeyDown: false });
      menu.initRoot(content);
    },
    destroy(popup) {
      const content = popup.parentElement;
      if (!menu.isPositioner(content)) return;
      stopAutoPositioning(content);
      content._templReleaseScroll?.();
      content._templReleaseScroll = null;
      content._templDismiss?.();
      stopFocusManager(content);
      menu.destroyRoot(content);
    },
  });

  // ----- events ---------------------------------------------------------------

  document.addEventListener("contextmenu", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = e.target.closest(TRIGGER);
    if (!trigger) return;
    const content = contentFor(trigger);
    if (!content) return;
    e.preventDefault();
    requestOpenChange(content, true, {
      reason: "trigger-press",
      event: e,
      x: e.clientX,
      y: e.clientY,
      touch: (e.pointerType || trigger._templOpenMethod) === "touch",
    });
  });

  document.addEventListener("pointerdown", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = e.target.closest(TRIGGER);
    if (trigger) trigger._templOpenMethod = e.pointerType;
  });
})();
