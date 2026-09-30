(function () {
  // The menu's element is the positioner (no slot upstream) around the
  // [data-slot=context-menu-content] popup.
  const POPUP = '[data-slot="context-menu-content"]';
  const SUB = '[data-slot="context-menu-sub"]';
  const SUB_TRIGGER = '[data-slot="context-menu-sub-trigger"]';
  const SUB_CONTENT = '[data-slot="context-menu-sub-content"]';
  // Base UI links ContextMenu.Trigger and its menu through context only; the
  // port marker carries the menu id.
  const TRIGGER = "[data-templ-context-menu-trigger]";

  function isPositioner(el) {
    // The popup is the positioner's slotted child, next to the focus guards.
    return !!el?.querySelector?.(":scope > " + POPUP);
  }

  function allContents() {
    return [...document.querySelectorAll(POPUP)].map((p) => p.parentElement).filter(isPositioner);
  }

  // The root positioner of the menu an element sits in, portaled submenus
  // included.
  function positionerOf(target) {
    for (let node = target; node; node = window.templ.portal.treeParent(node)) {
      if (node.matches?.(POPUP) && isPositioner(node.parentElement)) return node.parentElement;
    }
    return null;
  }

  function contentFor(trigger) {
    return document.getElementById(trigger.getAttribute("data-templ-context-menu-trigger") || "");
  }

  function triggerFor(content) {
    return document.querySelector('[data-templ-context-menu-trigger="' + content.id + '"]');
  }

  function popupFor(content) {
    return content.querySelector(":scope > " + POPUP);
  }

  // The popup renders the transition status, its positioner the open state.
  function partsOf(content) {
    return { positioner: content, parts: [popupFor(content)] };
  }

  function setChecked(item, checked) {
    item.toggleAttribute("data-checked", checked);
    item.toggleAttribute("data-unchecked", !checked);
    item.setAttribute("aria-checked", checked ? "true" : "false");
  }



  // The positioner's parent is the portal node, which moves to <body>
  // (shadcn portals it the same way).
  function portalNodeOf(content) {
    return content.parentElement;
  }

  function portal(content) {
    window.templ.portal.render(portalNodeOf(content));
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
      onOpenChange: (open) => requestOpenChange(content, open),
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
      parts: [content, popupFor(content)],
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

  // ----- list navigation and typeahead ---------------------------------------

  const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

  // The menu an item belongs to: the root popup or a submenu's popup.
  function containerOf(el) {
    return el.closest(SUB_CONTENT + ", " + POPUP);
  }

  // The menu's list, disabled items included (Base UI's menus pass an empty
  // disabledIndices, so disabled items are highlighted too).
  function itemsIn(popup) {
    return [...popup.querySelectorAll(ITEM_SELECTOR)].filter((item) => containerOf(item) === popup);
  }

  // The item's highlight, with the roving tabindex of useMenuItemCommonProps.
  // A submenu trigger also stays in the tab order while its submenu is open.
  function highlight(popup, index) {
    popup._templActiveIndex = index;
    itemsIn(popup).forEach((item, i) => {
      item.toggleAttribute("data-highlighted", i === index);
      item.tabIndex = i === index || isOpenSubTrigger(item) ? 0 : -1;
    });
  }

  function isOpenSubTrigger(item) {
    return item.matches(SUB_TRIGGER) && item.getAttribute("aria-expanded") === "true";
  }

  // MenuSubmenuTrigger's onBlur: focus that leaves it, into its submenu too,
  // clears the parent menu's highlight.
  function onSubTriggerBlur(event) {
    const trigger = event.currentTarget;
    if (trigger.hasAttribute("data-highlighted")) highlight(containerOf(trigger), null);
  }

  function setSubTriggerOpen(trigger, open) {
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    trigger.tabIndex = open || trigger.hasAttribute("data-highlighted") ? 0 : -1;
  }

  // MenuRoot's useListNavigation and useTypeahead for one menu popup. Base UI
  // nests a context menu's root in its ContextMenu.Root: ArrowLeft closes it,
  // and no arrow key opens it.
  function startListNavigation(popup, reference, isPopupOpen, onOpenChange, options) {
    const items = () => itemsIn(popup);
    const activeIndex = () => popup._templActiveIndex ?? null;
    popup._templNav = window.templ.listNavigation.useListNavigation({
      floating: popup,
      reference,
      items,
      activeIndex,
      onNavigate: (index) => highlight(popup, index),
      onOpenChange,
      isOpen: isPopupOpen,
      loopFocus: true,
      disabledIndices: [],
      ...options,
    });
    popup._templTypeahead = window.templ.typeahead.useTypeahead({
      elements: [reference, popup],
      labels: () => items().map((item) => item.textContent.trim()),
      items,
      activeIndex,
      isOpen: isPopupOpen,
      onMatch(index) {
        if (!isPopupOpen() || index === activeIndex()) return;
        highlight(popup, index);
        popup._templNav.sync();
      },
      resetMs: 500,
    });
  }

  function stopListNavigation(popup) {
    popup._templNav?.cleanup();
    popup._templTypeahead?.cleanup();
    popup._templNav = null;
    popup._templTypeahead = null;
  }

  // ----- open / close --------------------------------------------------------

  function openAt(content, x, y, touchOpen = false) {
    const alreadyOpen = content.hasAttribute("data-open");
    allContents().forEach((c) => {
    if (c !== content) requestOpenChange(c, false);
    });
    portal(content);
    content.hidden = false;
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: content,
      reference: triggerFor(content),
      onOpenChange: (open) => requestOpenChange(content, open),
    });
    startFocusManager(content, touchOpen);

    if (alreadyOpen) {
      // Right-click somewhere else while open: move over to the new spot.
      content._templSubs?.forEach(closeSubNow);
      positionAt(content, x, y).then(() => {
        if (!content.isConnected || !content.hasAttribute("data-open")) return;
        content._templReleaseScroll?.();
        content._templReleaseScroll = window.templ.scrollLock.anchoredPopup(
          true, touchOpen, content, triggerFor(content),
        );
      });
      return;
    }

    // Fresh open: positioned first, then the enter animation plays at the
    // cursor.
    positionAt(content, x, y).then(() => {
      if (content.hidden || !content.isConnected) return; // closed or removed meanwhile
      const popup = popupFor(content);
      // useAnchoredPopupScrollLock: a native touch context menu follows the touch rule.
      content._templReleaseScroll?.();
      content._templReleaseScroll = window.templ.scrollLock.anchoredPopup(
        true, touchOpen, content, triggerFor(content),
      );
      window.templ.transition.open(partsOf(content));
      setTriggerOpen(content, true);
      popup._templNav?.open();
      popup._templTypeahead?.reset();
      syncSubState(content);
    });
  }

  function close(content) {
    if (content.hidden) return;
    content._templDismiss?.();
    content._templDismiss = null;
    content._templFocus?.close();
    const popup = popupFor(content);
    popup._templAllowMouseEnter = false;
    popup._templNav?.close();
    popup._templTypeahead?.reset();
    // Positioned until it unmounts, like Base UI. Unmounting the focus
    // manager returns focus.
    window.templ.transition.close(partsOf(content), popup, () => {
      stopAutoPositioning(content);
      stopFocusManager(content);
      content.hidden = true;
    });
    content._templSubs?.forEach(closeSubNow);
    setTriggerOpen(content, false);
    content._templReleaseScroll?.();
    content._templReleaseScroll = null;
  }

  // ContextMenuTrigger's state attributes while its menu is open.
  function setTriggerOpen(content, open) {
    const trigger = triggerFor(content);
    trigger?.toggleAttribute("data-popup-open", open);
    trigger?.toggleAttribute("data-pressed", open);
  }

  function requestOpenChange(content, nextOpen, x, y, touchOpen = false) {
  const trigger = triggerFor(content);
  const change = new CustomEvent("contextmenu-open-change", {
    bubbles: true,
    cancelable: true,
    detail: { open: nextOpen },
  });
  const accepted = (trigger || content).dispatchEvent(change);
  if (!accepted || content.hasAttribute("data-templ-open")) return false;
  if (nextOpen) openAt(content, x, y, touchOpen);
  else close(content);
  return true;
  }

  // ----- submenus -------------------------------------------------------------

  // MenuSubmenuTrigger's defaults: hover opens after 100 ms at rest, the
  // close has no delay.
  const SUBMENU_DELAY = 100;
  const SUBMENU_CLOSE_DELAY = 0;

  // The sub's trigger and popup. The popup portals on open, so the link is
  // kept from the declaration.
  function subParts(sub) {
    if (!sub._templSubContent) {
      sub._templSubContent = sub.querySelector(SUB_CONTENT);
      if (sub._templSubContent) sub._templSubContent._templSub = sub;
    }
    return { trigger: sub.querySelector(SUB_TRIGGER), content: sub._templSubContent };
  }

  // The store's open state, set when the change is requested.
  function isSubOpen(sub) {
    return !!sub._templIsOpen;
  }

  // The parent menu's popup: the root popup or a submenu's popup.
  function parentPopupOf(sub) {
    const { trigger } = subParts(sub);
    return trigger ? containerOf(trigger) : null;
  }

  // The subs whose parent menu is this popup.
  function childSubsOf(popup, all) {
    return all.filter((sub) => parentPopupOf(sub) === popup);
  }

  function subsOfTree(sub) {
    return positionerOf(subParts(sub).trigger)?._templSubs || [];
  }

  // A submenu's MenuRoot: list navigation nested in its parent menu, the
  // trigger's useClick and useHoverReferenceInteraction, the popup's
  // useHoverFloatingInteraction.
  function initSub(sub) {
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    const positioner = content.parentElement;
    trigger.addEventListener("blur", onSubTriggerBlur);
    startListNavigation(content, trigger, () => isSubOpen(sub),
      (open) => requestSubOpenChange(sub, open), { nested: true, parentOrientation: "vertical" });
    const hover = window.templ.hover;
    const disabled = () => trigger.getAttribute("aria-disabled") === "true";
    // hoverEnabled of the submenu's store: off after the pointer moved in its
    // popup or one of its own submenus opened, on again once it closes.
    const hoverEnabled = () => sub._templHoverEnabled !== false;
    sub._templHover = hover.createHoverInteraction({
      isOpen: () => isSubOpen(sub),
      onOpenChange: (open, reason, event) => requestSubOpenChange(sub, open, { reason, event }),
      openEventType: () => sub._templOpenEventType ?? null,
      domReference: () => trigger,
      floating: () => (positioner.hidden ? null : positioner),
      placement: () => positioner.getAttribute("data-side") || "right",
      triggers: () => [trigger],
      // The scope Base UI resolves for a submenu: the parent menu's popup,
      // through its data-rootownerid.
      parentFloating: () => parentPopupOf(sub),
    });
    sub._templCleanups = [
      window.templ.click.useClick(trigger, {
        event: "mousedown",
        toggle: false,
        ignoreMouse: true,
        stickIfOpen: false,
        isOpen: () => isSubOpen(sub),
        openEventType: () => sub._templOpenEventType ?? null,
        onOpenChange(nextOpen, event) {
          if (!disabled()) requestSubOpenChange(sub, nextOpen, { reason: "trigger-press", event });
        },
      }),
      hover.useHoverReferenceInteraction(trigger, sub._templHover, {
        enabled: () => hoverEnabled() && !disabled(),
        handleClose: hover.safePolygon({ blockPointerEvents: true }),
        mouseOnly: true,
        move: true,
        restMs: SUBMENU_DELAY,
        delay: { open: SUBMENU_DELAY, close: SUBMENU_CLOSE_DELAY },
        // The menu opened under a resting pointer: no submenu opens until it moves.
        shouldOpen: () => parentPopupOf(sub)?._templAllowMouseEnter === true,
        isClosing: () => window.templ.transition.isEnding(content),
      }),
      hover.useHoverFloatingInteraction(sub._templHover, { enabled: hoverEnabled, closeDelay: SUBMENU_CLOSE_DELAY }),
    ];
  }

  function destroySub(sub) {
    const { trigger, content } = subParts(sub);
    if (!content) return;
    trigger?.removeEventListener("blur", onSubTriggerBlur);
    closeSubNow(sub);
    sub._templCleanups?.forEach((cleanup) => cleanup());
    sub._templCleanups = null;
    sub._templHover?.dispose();
    sub._templHover = null;
    stopListNavigation(content);
  }

  // The submenu's MenuPopup focus manager: non modal, no initial focus, focus
  // returns to the submenu trigger.
  function startSubFocusManager(sub) {
    const { trigger, content } = subParts(sub);
    if (content._templFocus) {
      content._templFocus.open();
      return;
    }
    content._templFocus = window.templ.focusManager.useFloatingFocusManager({
      floating: content.parentElement,
      reference: trigger,
      modal: false,
      initialFocus: false,
      restoreFocus: true,
      previousFocusableElement: trigger,
      onOpenChange: (open, reason, event) => requestSubOpenChange(sub, open, { reason, event }),
    });
  }

  function stopSubFocusManager(content) {
    content._templFocus?.unmount();
    content._templFocus = null;
  }

  function openSub(sub, details = {}) {
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    const positioner = content.parentElement;
    sub._templIsOpen = true;
    sub._templOpenEventType = details.event?.type ?? null;
    window.templ.portal.render(positioner.parentElement);
    positioner.hidden = false;
    // The submenu's MenuRoot useDismiss: Escape closes only the submenu
    // (closeParentOnEsc is false).
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: positioner,
      reference: trigger,
      onOpenChange: (open, reason, event) => requestSubOpenChange(sub, open, { reason, event }),
    });
    startSubFocusManager(sub);
    sub._templHover?.openChange(true, details.reason);
    // The sub menu's MenuPositioner with the side and offsets of shadcn's
    // ContextMenuSubContent, fixed like every positioner in a context menu.
    stopAutoPositioning(content);
    const positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor: trigger,
      positioner,
      parts: [positioner, content],
      positionMethod: "fixed",
      side: "right",
      align: "start",
      sideOffset: 0,
      alignOffset: 4,
    });
    content._templPositionCleanup = positioning.cleanup;
    positioning.positioned.then(() => {
      if (positioner.hidden) return; // closed meanwhile
      window.templ.transition.open({ positioner, parts: [content] });
      trigger.setAttribute("data-popup-open", "");
      setSubTriggerOpen(trigger, true);
      content._templNav?.open();
      content._templTypeahead?.reset();
    });
  }

  // The store's reset when a submenu closes: hover on again, no pointer move
  // seen in its popup yet.
  function resetSubState(sub, content) {
    sub._templIsOpen = false;
    sub._templOpenEventType = null;
    sub._templHoverEnabled = true;
    content._templAllowMouseEnter = false;
  }

  // Closes with the exit animation. details { reason, event } of the close,
  // for the focus manager and the hover interaction.
  function closeSub(sub, details = {}) {
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    resetSubState(sub, content);
    sub._templHover?.openChange(false, details.reason);
    content._templDismiss?.();
    content._templDismiss = null;
    content._templFocus?.close(details);
    content._templNav?.close();
    content._templTypeahead?.reset();
    window.templ.transition.close({ positioner: content.parentElement, parts: [content] }, content, () => {
      stopAutoPositioning(content);
      stopSubFocusManager(content);
      content.parentElement.hidden = true;
    });
    trigger.removeAttribute("data-popup-open");
    setSubTriggerOpen(trigger, false);
  }

  // Closes immediately (used when the whole menu goes away).
  function closeSubNow(sub) {
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    const wasOpen = isSubOpen(sub);
    resetSubState(sub, content);
    if (wasOpen) sub._templHover?.openChange(false);
    stopAutoPositioning(content);
    content._templDismiss?.();
    content._templDismiss = null;
    content._templNav?.close();
    stopSubFocusManager(content);
    content.parentElement.hidden = true;
    window.templ.transition.reset({ positioner: content.parentElement, parts: [content] }, false);
    trigger.removeAttribute("data-popup-open");
    setSubTriggerOpen(trigger, false);
  }

  function requestSubOpenChange(sub, nextOpen, details = {}) {
    const { trigger, content } = subParts(sub);
    if (!trigger || !content || isSubOpen(sub) === nextOpen) return false;
    const accepted = trigger.dispatchEvent(
      new CustomEvent("contextmenu-sub-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: nextOpen },
      }),
    );
    // Controlled: the Base UI open prop on the SubmenuRoot, the owner commits.
    if (!accepted || sub.hasAttribute("data-templ-open")) return false;
    sub._templSubOpen = nextOpen;
    const all = subsOfTree(sub);
    const parentPopup = parentPopupOf(sub);
    if (nextOpen) {
      // MenuPositioner's menuopenchange: the parent menu stops closing on
      // hover, a sibling submenu closes.
      if (parentPopup?._templSub) parentPopup._templSub._templHoverEnabled = false;
      childSubsOf(parentPopup, all).forEach((other) => {
        if (other !== sub) requestSubOpenChange(other, false, { reason: "sibling-open" });
      });
      openSub(sub, details);
    } else {
      // A submenu closes with its parent.
      childSubsOf(content, all).forEach((child) => requestSubOpenChange(child, false, details));
      closeSub(sub, details);
    }
    return true;
  }

  function syncSubState(content) {
    content._templSubs?.forEach((sub) => {
      if (!subParts(sub).content) return;
      // Last requested state, else the server's open or defaultOpen.
      const shouldOpen = sub._templSubOpen ?? (
        sub.getAttribute("data-templ-open") === "true" || sub.hasAttribute("data-templ-default-open"));
      if (shouldOpen && !isSubOpen(sub)) openSub(sub);
      else if (!shouldOpen && isSubOpen(sub)) closeSubNow(sub);
    });
  }

  // The popup's onMouseMove and onClick in MenuRoot, and the items'
  // itemhover: a pointer move allows hover opening in that menu, turns off
  // the hover close of a submenu, and a move over another item of the parent
  // menu closes the open submenu there.
  function menuPopupOf(target) {
    const popup = target.closest?.(SUB_CONTENT + ", " + POPUP);
    if (!popup) return null;
    return popup.matches(SUB_CONTENT) || isPositioner(popup.parentElement) ? popup : null;
  }

  document.addEventListener("mousemove", (e) => {
    if (!(e.target instanceof Element)) return;
    const popup = menuPopupOf(e.target);
    if (!popup) return;
    popup._templAllowMouseEnter = true;
    if (popup._templSub) popup._templSub._templHoverEnabled = false;
    const item = e.target.closest(ITEM_SELECTOR);
    if (!item || containerOf(item) !== popup) return;
    const root = positionerOf(popup);
    childSubsOf(popup, root?._templSubs || []).forEach((sub) => {
      if (isSubOpen(sub) && subParts(sub).trigger !== item) {
        requestSubOpenChange(sub, false, { reason: "sibling-open", event: e });
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const sub = menuPopupOf(e.target)?._templSub;
    if (sub) sub._templHoverEnabled = false;
  });

  // ----- init (portal on open) --------------------

  window.templ.lifecycle.register(TRIGGER, {
    init(trigger) {
      // Server-side open state (Base UI open or defaultOpen).
      const content = contentFor(trigger);
      if (content && (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open"))) {
        const rect = trigger.getBoundingClientRect();
        openAt(content, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    },
  });
  // A content unmounts with its portal owner: a portaled one is removed from
  // <body> then.
  window.templ.lifecycle.register(POPUP, {
    init(popup) {
      const content = popup.parentElement;
      if (!isPositioner(content)) return;
      startListNavigation(popup, triggerFor(content), () => content.hasAttribute("data-open"),
        (open) => requestOpenChange(content, open), { nested: true, openOnArrowKeyDown: false });
      // Every sub of the tree, collected before they portal.
      content._templSubs = [...popup.querySelectorAll(SUB)];
      content._templSubs.forEach(initSub);
    },
    destroy(popup) {
      const content = popup.parentElement;
      if (!isPositioner(content)) return;
      stopListNavigation(popup);
      content._templSubs?.forEach(destroySub);
      stopAutoPositioning(content);
      content._templReleaseScroll?.();
      content._templReleaseScroll = null;
      content._templDismiss?.();
      stopFocusManager(content);
      window.templ.portal.remove(portalNodeOf(content));
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
  requestOpenChange(content, true, e.clientX, e.clientY,
    (e.pointerType || trigger._templOpenMethod) === "touch");
  });

  // Dismiss on PRESS outside, like Base UI.
  document.addEventListener("pointerdown", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = e.target.closest(TRIGGER);
    if (trigger) trigger._templOpenMethod = e.pointerType;
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    // Checkbox items toggle and keep the menu open.
    const checkbox = e.target.closest('[data-slot="context-menu-checkbox-item"]');
    if (checkbox) {
      if (checkbox.getAttribute("aria-disabled") !== "true") {
        const on = checkbox.hasAttribute("data-checked");
    const change = new CustomEvent("contextmenu-checked-change", {
      bubbles: true,
      cancelable: true,
      detail: { checked: !on },
    });
    const accepted = checkbox.dispatchEvent(change);
    if (accepted && !checkbox.hasAttribute("data-templ-checked")) {
      setChecked(checkbox, !on);
    }
      }
      return;
    }

    // Radio items select within their group and keep the menu open.
    const radio = e.target.closest('[data-slot="context-menu-radio-item"]');
    if (radio) {
      if (radio.getAttribute("aria-disabled") !== "true") {
        const group = radio.closest('[data-slot="context-menu-radio-group"]');
    const change = new CustomEvent("contextmenu-value-change", {
      bubbles: true,
      cancelable: true,
      detail: { value: radio.getAttribute("data-templ-value") },
    });
    const accepted = (group || radio).dispatchEvent(change);
    if (accepted && group && !group.hasAttribute("data-templ-value")) {
          group.querySelectorAll('[data-slot="context-menu-radio-item"]').forEach((r) => {
            setChecked(r, false);
          });
      setChecked(radio, true);
        }
      }
      return;
    }

    const item = e.target.closest('[data-slot="context-menu-item"]');
    if (item) {
      if (
        item.getAttribute("aria-disabled") !== "true" &&
        item.getAttribute("data-templ-close-on-click") !== "false"
      ) {
        const content = positionerOf(item);
    if (content) requestOpenChange(content, false);
      }
    }
  });
})();
