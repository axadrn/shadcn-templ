// Port of @base-ui/react menu (1.6.0) MenuRoot with MenuTrigger for a root
// menu, on top of menu.js: what shadcn's dropdown menu and the menus of
// shadcn's menubar share. A root menu opens from its trigger, positions
// against it, traps focus non modally, and is modal (internal backdrop and
// scroll lock) unless its parent says otherwise. The menubar passes its parent
// part: the cutout of the backdrop, the click and focus behavior of a
// MenuTrigger in a menubar, the open change it tracks for hasSubmenuOpen.
//
//   const root = window.templ.menuRoot.create({
//     slot, event, trigger,     the slot prefix, the event prefix, the trigger selector
//     subPositioning,           shadcn's <slot>-sub-content positioner props
//     parent,                   optional menubar part, see below
//   })
//
// parent: {
//   cutout(trigger)                          the backdrop's hole
//   focusGuards                              false: no MenuTrigger focus guards
//   clickEvent(trigger, isOpenedByTrigger)   useClick's event
//   listNavigation                           extra useListNavigation options
//   instant(reason)                          MenuRoot's instantType for the reason, or undefined
//   onOpenChange(content, open, details)     after a change was applied
//   keydown(event)                           the popup's keyboardEventRelay
//   rootId(trigger)                          rendered as the popup's data-rootownerid
// }
(function () {
  "use strict";

  function create(config) {
    const { slot, event: eventPrefix, trigger: TRIGGER, subPositioning, parent = null } = config;

    const menu = window.templ.menu.create({
      slot,
      event: eventPrefix,
      subPositioning,
      onItemPress: (content, event) => requestOpenChange(content, false, { reason: "item-press", event }),
    });

    // The id is the popup's, like Base UI's.
    function triggerFor(content) {
      return document.querySelector('[data-templ-controls="' + menu.popupFor(content).id + '"]');
    }

    function contentFor(trigger) {
      return menu.positionerById(trigger.getAttribute("data-templ-controls"));
    }

    // The root trigger an event target sits in, if any.
    function triggerOf(target) {
      const trigger = target.closest && target.closest(TRIGGER);
      return trigger && !trigger.matches(menu.SUB_TRIGGER) && contentFor(trigger) ? trigger : null;
    }

    // MenuPositioner: useAnchorPositioning with the menu collision avoidance,
    // while the menu is mounted. It keeps the menu attached to its trigger
    // while ancestors move, resize, scroll or shift layout.
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

    // MenuPopup's FloatingFocusManager: non modal, with MenuTrigger's focus
    // guards around the trigger while it is open (not in a menubar, where the
    // trigger is a composite item).
    function startFocusManager(content, trigger) {
      if (content._templFocus) {
        content._templFocus.open(content._templOpenMethod === "programmatic" ? null : content._templOpenMethod);
        return;
      }
      const onOpenChange = (open, reason, event) => requestOpenChange(content, open, { reason, event });
      if (!parent || parent.focusGuards !== false) {
        content._templTriggerGuards = window.templ.triggerFocusGuards.attach(trigger, {
          positioner: content,
          beforeContentFocusGuard: () => content._templFocus?.beforeGuard,
          onClose: (event) => onOpenChange(false, "focus-out", event),
        });
      }
      content._templFocus = window.templ.focusManager.useFloatingFocusManager({
        floating: content,
        reference: trigger,
        modal: false,
        openInteractionType: content._templOpenMethod === "programmatic" ? null : content._templOpenMethod,
        restoreFocus: true,
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

    // MenuRoot's instantType in a menubar ("group" for a switch between its
    // menus), rendered after menu.js' own on the positioner and the popup.
    function applyParentInstant(content, details) {
      const instant = parent?.instant?.(details.reason);
      if (!instant) return;
      content.setAttribute("data-instant", instant);
      menu.popupFor(content).setAttribute("data-instant", instant);
    }

    // details { reason, event } of the open.
    function open(content, trigger, details = {}) {
      menu.allPositioners().forEach((c) => {
        if (c !== content) close(c, parent ? { reason: "sibling-open" } : {});
      });
      content._templOpenMethod = trigger._templOpenMethod || "programmatic";
      content._templOpenReason = details.reason;
      menu.mountPortal(content);
      // A modal menu (Base UI's default) renders the internal backdrop with a
      // hole over the trigger, or over the whole menubar.
      menu.mountBackdrop(content, parent?.cutout?.(trigger) ?? trigger);
      // MenuTrigger renders aria-controls while the popup is open
      // (triggerPopupId).
      trigger.setAttribute("aria-controls", menu.popupFor(content).id);
      const rootId = parent?.rootId?.(trigger);
      if (rootId) menu.popupFor(content).setAttribute("data-rootownerid", rootId);
      content._templDismiss ??= window.templ.dismiss.useDismiss({
        floating: content,
        reference: trigger,
        onOpenChange: (open, reason, event) => requestOpenChange(content, open, { reason, event }),
      });
      startFocusManager(content, trigger);
      parent?.onOpenChange?.(content, true, details);

      // Positioned first, then the enter animation plays in place.
      const finish = () => {
        if (content.hidden || !content.isConnected) return;
        // useAnchoredPopupScrollLock for the modal menu, measured on the
        // positioned popup for touch opens; a menu opened by hover locks none.
        content._templReleaseScroll?.();
        content._templReleaseScroll = window.templ.scrollLock.anchoredPopup(
          details.reason !== "trigger-hover", content._templOpenMethod === "touch", content, trigger,
        );
        trigger.setAttribute("aria-expanded", "true");
        trigger.setAttribute("data-popup-open", "");
        trigger.setAttribute("data-pressed", "");
        menu.afterRootOpen(content, details);
        applyParentInstant(content, details);
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
      applyParentInstant(content, details);
      content._templReleaseScroll?.();
      content._templReleaseScroll = null;
      parent?.onOpenChange?.(content, false, details);
    }

    function requestOpenChange(content, nextOpen, details = {}) {
      if (!content || menu.isOpen(content) === nextOpen) return false;
      const accepted = content.dispatchEvent(
        new CustomEvent(eventPrefix + "-open-change", {
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

    // MenuTrigger's useClick: a mouse or touch press opens on mousedown, one
    // frame later, Enter and Space arrive as the click a native button fires.
    // In a menubar the trigger of the open menu closes it on click.
    function listenForClick(content, trigger) {
      const options = {
        isOpen: () => menu.isOpen(content),
        onOpenChange(nextOpen, event, pointerType) {
          if (trigger.disabled || trigger.getAttribute("aria-disabled") === "true") return;
          trigger._templOpenMethod = pointerType || "keyboard";
          requestOpenChange(content, nextOpen, { reason: "trigger-press", event });
        },
      };
      if (!parent) return window.templ.click.useClick(trigger, { ...options, event: "mousedown" });
      // useClick's event follows isOpenedByThisTrigger: re-created on change.
      let cleanup = null;
      let event = null;
      const sync = () => {
        const next = parent.clickEvent(trigger, menu.isOpen(content));
        if (next === event) return;
        cleanup?.();
        event = next;
        cleanup = window.templ.click.useClick(trigger, { ...options, event, stickIfOpen: false });
      };
      sync();
      content._templSyncClick = sync;
      return () => cleanup?.();
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
          if (trigger.disabled || trigger.getAttribute("aria-disabled") === "true") return;
          if (open) trigger._templOpenMethod = "keyboard";
          requestOpenChange(content, open, { reason, event });
        }, parent?.listNavigation);
        if (parent?.keydown) popup.addEventListener("keydown", parent.keydown);
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
        if (parent?.keydown) popup.removeEventListener("keydown", parent.keydown);
        stopAutoPositioning(content);
        content._templReleaseScroll?.();
        content._templReleaseScroll = null;
        content._templDismiss?.();
        stopFocusManager(content);
        menu.destroyRoot(content);
      },
    });

    return { menu, triggerFor, contentFor, requestOpenChange, open, close, isOpen: menu.isOpen };
  }

  window.templ = window.templ || {};
  window.templ.menuRoot = { create };
})();
