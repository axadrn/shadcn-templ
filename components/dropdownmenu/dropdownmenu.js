(function () {
  // Submenu hover intent, like Base UI: open fast, close with a grace delay so
  // moving the mouse diagonally into the submenu does not flicker.
  const SUB_OPEN_DELAY = 100;
  const SUB_CLOSE_DELAY = 300;

  // The menu's element is the positioner (shadcn's isolate z-50 wrapper, no
  // slot) around the [data-slot=dropdown-menu-content] popup.
  const POPUP = '[data-slot="dropdown-menu-content"]';
  const SUB = '[data-slot="dropdown-menu-sub"]';
  const SUB_TRIGGER = '[data-slot="dropdown-menu-sub-trigger"]';
  const SUB_CONTENT = '[data-slot="dropdown-menu-sub-content"]';
  // Base UI's MenuTrigger renders no identifier: a menu trigger is whatever
  // has aria-haspopup="menu" and controls a menu positioner. The element may
  // carry another component's slot (sidebar.MenuButton).
  const TRIGGER = '[aria-haspopup="menu"][aria-controls]';

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

  // The dropdown trigger an event target sits in, if any.
  function triggerOf(target) {
    const trigger = target.closest && target.closest(TRIGGER);
    return trigger && !trigger.matches(SUB_TRIGGER) && contentFor(trigger) ? trigger : null;
  }

  // The dropdown positioner an element sits in, if any.
  function positionerOf(target) {
    const popup = target && target.closest && target.closest(POPUP);
    return popup && isPositioner(popup.parentElement) ? popup.parentElement : null;
  }

  function popupFor(content) {
    return content.firstElementChild;
  }

  // The popup renders the transition status, its positioner the open state.
  function partsOf(content) {
    return { positioner: content, parts: [popupFor(content)] };
  }

  function isOpen(el) {
    return !!el && el.hasAttribute("data-open");
  }

  function setChecked(item, checked) {
    item.toggleAttribute("data-checked", checked);
    item.toggleAttribute("data-unchecked", !checked);
    item.setAttribute("aria-checked", checked ? "true" : "false");
  }



  // Moves the content to <body> (shadcn portals it the same way).
  function portal(content) {
    window.templ.portal.render(content);
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
      parts: [content, popupFor(content)],
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
    if (!content._templPositionCleanup) return;
    content._templPositionCleanup();
    content._templPositionCleanup = null;
  }

  // ----- focus highlighting (Base UI moves real focus to menu items) --------

  const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

  // The menu container the keyboard navigates in: the deepest open submenu
  // holding focus, otherwise the root popup.
  function containerOf(el) {
    return el.closest(SUB_CONTENT + ", " + POPUP);
  }

  function itemsIn(container) {
    return [...container.querySelectorAll(ITEM_SELECTOR)].filter(
      (item) =>
        containerOf(item) === container &&
        !item.disabled &&
        item.getAttribute("aria-disabled") !== "true",
    );
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

  function focusItem(item) {
    if (item && document.activeElement !== item) item.focus({ preventScroll: false });
  }

  // Wraps at both ends, the pendant of Menu.Root's loopFocus, which the
  // reference defaults to true: ArrowDown on the last item returns to the
  // first and ArrowUp on the first goes to the last. Disabled items stay out
  // of the walk — itemsIn filters them, because ours are natively disabled
  // buttons rather than the aria-disabled ones the reference keeps focusable.
  function moveFocus(container, delta) {
    const items = itemsIn(container);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (index === -1) {
      focusItem(delta > 0 ? items[0] : items[items.length - 1]);
      return;
    }
    focusItem(items[(index + delta + items.length) % items.length]);
  }

  // ----- open / close --------------------------------------------------------

  // focusOn: "first" or "last" lands focus on that item once the menu is in
  // place, anything falsy focuses the popup. `true` still means "first".
  function open(content, trigger, focusOn) {
    allContents().forEach((c) => {
      if (c !== content) close(c);
    });
    content._templOpenMethod = trigger._templOpenMethod || "programmatic";
    portal(content);
    content.hidden = false;
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: content,
      reference: trigger,
      onOpenChange: (open, reason) => requestOpenChange(content, open, false, reason === "escape-key"),
    });

    // Positioned first, then the enter animation plays in place.
    const finish = () => {
      const popup = popupFor(content);
      if (content.hidden || !content.isConnected) return;
      // useAnchoredPopupScrollLock measures the positioned popup for touch opens.
      content._templReleaseScroll?.();
      content._templReleaseScroll = window.templ.scrollLock.anchoredPopup(
        true, content._templOpenMethod === "touch", content, trigger,
      );
      window.templ.transition.open(partsOf(content));
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("data-popup-open", "");
      trigger.setAttribute("data-pressed", "");
      if (!popup) return;
      syncSubState(popup);
      // The guard is the same one the reference uses: do not pull focus back
      // into a popup that closed while the frame was queued.
      const stillOpen = () => isOpen(content);
      if (focusOn) {
        const items = itemsIn(popup);
        enqueueFocus((focusOn === "last" ? items[items.length - 1] : items[0]) || popup, stillOpen);
      } else {
        enqueueFocus(popup, stillOpen);
      }
    };
    startAutoPositioning(content, trigger).then(finish, finish);
  }

  function close(content, refocusTrigger) {
    if (content.hidden) return;
    content._templDismiss?.();
    content._templDismiss = null;
    // Positioned until it unmounts, like Base UI.
    window.templ.transition.close(partsOf(content), popupFor(content), () => {
      stopAutoPositioning(content);
      content.hidden = true;
    });
    content.querySelectorAll(SUB).forEach(closeSubNow);
    const trigger = triggerFor(content);
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("data-popup-open");
      trigger.removeAttribute("data-pressed");
      if (refocusTrigger) trigger.focus({ preventScroll: true });
    }
    content._templReleaseScroll?.();
    content._templReleaseScroll = null;
  }

  function closeAll(refocusTrigger) {
    allContents().forEach((content) => close(content, refocusTrigger));
  }

  function requestOpenChange(content, nextOpen, focusOn, refocusTrigger) {
    if (!content || isOpen(content) === nextOpen) return false;
    const accepted = content.dispatchEvent(
      new CustomEvent("dropdownmenu-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: nextOpen },
      }),
    );
    if (!accepted || content.hasAttribute("data-templ-open")) return false;
    const trigger = triggerFor(content);
    if (nextOpen && trigger) open(content, trigger, focusOn);
    else if (!nextOpen) close(content, refocusTrigger);
    return true;
  }

  function requestCloseAll(refocusTrigger) {
    allContents().forEach((content) =>
      requestOpenChange(content, false, false, refocusTrigger),
    );
  }

  function anyOpen() {
    return [...allContents()].find(isOpen) || null;
  }

  // ----- submenus -------------------------------------------------------------

  function subParts(sub) {
    return {
      trigger: sub.querySelector(SUB_TRIGGER),
      content: sub.querySelector(SUB_CONTENT),
    };
  }

  function openSub(sub, focusFirst) {
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    const positioner = content.parentElement;
    positioner.hidden = false;
    // The sub menu's MenuPositioner with the side and offsets of shadcn's
    // DropdownMenuSubContent and the popup collision avoidance. Fixed, since it stays
    // nested in the root popup.
    stopAutoPositioning(content);
    const positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor: trigger,
      positioner,
      parts: [positioner, content],
      positionMethod: "fixed",
      side: "right",
      align: "start",
      sideOffset: 0,
      alignOffset: -3,
    });
    content._templPositionCleanup = positioning.cleanup;
    positioning.positioned.then(() => {
      if (positioner.hidden) return; // closed meanwhile
      window.templ.transition.open({ positioner, parts: [content] });
      trigger.setAttribute("data-popup-open", "");
	  trigger.setAttribute("aria-expanded", "true");
      if (focusFirst) focusItem(itemsIn(content)[0] || content);
    });
  }

  // Closes with the exit animation.
  function closeSub(sub) {
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    window.templ.transition.close({ positioner: content.parentElement, parts: [content] }, content, () => {
      stopAutoPositioning(content);
      content.parentElement.hidden = true;
    });
    trigger.removeAttribute("data-popup-open");
	trigger.setAttribute("aria-expanded", "false");
  }

  // Closes immediately (used when the whole menu goes away).
  function closeSubNow(sub) {
    clearTimeout(sub._templOpen);
    clearTimeout(sub._templClose);
    sub._templOpen = null;
    sub._templClose = null;
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    stopAutoPositioning(content);
    content.parentElement.hidden = true;
    window.templ.transition.reset({ positioner: content.parentElement, parts: [content] }, false);
    trigger.removeAttribute("data-popup-open");
	trigger.setAttribute("aria-expanded", "false");
  }

  function requestSubOpenChange(sub, nextOpen, focusFirst) {
	const { trigger, content } = subParts(sub);
	if (!trigger || !content || content.hasAttribute("data-open") === nextOpen) return;
	const accepted = trigger.dispatchEvent(
	  new CustomEvent("dropdownmenu-sub-open-change", {
		bubbles: true,
		cancelable: true,
		detail: { open: nextOpen },
	  }),
	);
	// Controlled: the Base UI open prop on the SubmenuRoot, the owner commits.
	if (!accepted || sub.hasAttribute("data-templ-open")) return;
	sub._templSubOpen = nextOpen;
	if (nextOpen) openSub(sub, focusFirst);
	else closeSub(sub);
  }

  function syncSubState(menu) {
	menu.querySelectorAll(SUB).forEach((sub) => {
	  const { content } = subParts(sub);
	  if (!content) return;
	  // Last requested state, else the server's open or defaultOpen.
	  const shouldOpen = sub._templSubOpen ?? (
	    sub.getAttribute("data-templ-open") === "true" || sub.hasAttribute("data-templ-default-open"));
	  if (shouldOpen && !content.hasAttribute("data-open")) openSub(sub, false);
	  else if (!shouldOpen && content.hasAttribute("data-open")) closeSubNow(sub);
	});
  }

  // Hover intent: while the pointer is over a sub (trigger or its content),
  // keep it open; everything else in the menu schedules its subs to close.
  document.addEventListener("mouseover", (e) => {
    if (!(e.target instanceof Element)) return;
    const menu = positionerOf(e.target);
    if (!menu) return;
    const hovered = e.target.closest(SUB);

    menu.querySelectorAll(SUB).forEach((sub) => {
      const { content } = subParts(sub);
      if (!content) return;
      const isOpen = content.hasAttribute("data-open");
      const onPath = hovered && (sub === hovered || sub.contains(hovered));

      if (onPath) {
        clearTimeout(sub._templClose);
        sub._templClose = null;
        if (!isOpen && !sub._templOpen) {
          sub._templOpen = setTimeout(() => {
            sub._templOpen = null;
			requestSubOpenChange(sub, true);
          }, SUB_OPEN_DELAY);
        }
      } else {
        clearTimeout(sub._templOpen);
        sub._templOpen = null;
        if (isOpen && !sub._templClose) {
          sub._templClose = setTimeout(() => {
            sub._templClose = null;
			requestSubOpenChange(sub, false);
          }, SUB_CLOSE_DELAY);
        }
      }
    });
  });

  // The highlight follows the pointer: focus the item under it, fall back to
  // the menu container when the pointer sits on empty menu space.
  document.addEventListener("pointermove", (e) => {
    if (!(e.target instanceof Element)) return;
    const content = positionerOf(e.target);
    if (!isOpen(content)) return;
    const item = e.target.closest(ITEM_SELECTOR);
    if (item && containerOf(item)) {
      focusItem(item);
    } else {
      const container = containerOf(e.target) || popupFor(content);
      if (container && !container.contains(document.activeElement)) return;
      if (container && document.activeElement !== container) {
        container.focus({ preventScroll: true });
      }
    }
  });

  // ----- init (portal on open) --------------------

  // A content unmounts with its portal owner: a portaled one is removed from
  // <body> then.
  window.templ.lifecycle.register(POPUP, {
    init(popup) {
      const content = popup.parentElement;
      const trigger = isPositioner(content) && triggerFor(content);
      if (!trigger) return;
      // Server-side open state (Base UI open or defaultOpen).
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        open(content, trigger, false);
      }
    },
    destroy(popup) {
      const content = popup.parentElement;
      if (!isPositioner(content)) return;
      stopAutoPositioning(content);
      content._templReleaseScroll?.();
      content._templReleaseScroll = null;
      content._templDismiss?.();
      if (content.isConnected) content.remove();
    },
  });

  // ----- events ---------------------------------------------------------------

  // Pointer interactions toggle and dismiss on PRESS, exactly like Base UI.
  // Click is never used for open/close, so the stray click the browser fires
  // on <body> after the menu opened over the trigger is naturally harmless.
  function toggle(trigger, focusOn) {
    const content = contentFor(trigger);
    if (!content) return;
    requestOpenChange(content, !isOpen(content), focusOn);
  }

  // The menu-button pattern: ArrowDown opens on the first item, ArrowUp on
  // the last. Only the arrows are taken here — Enter and Space arrive as the
  // detail-0 click a native button synthesises and are handled there, the way
  // useClick and useListNavigation split it in the reference.
  const OPEN_KEYS = { ArrowDown: "first", ArrowUp: "last" };
  document.addEventListener("keydown", (e) => {
    if (!(e.target instanceof Element)) return;
    const focusOn = OPEN_KEYS[e.key];
    if (!focusOn) return;
    const trigger = triggerOf(e.target);
    if (!trigger || trigger.disabled) return;
    const content = contentFor(trigger);
    // Already open: leave it to the handlers that navigate and close.
    if (!content || isOpen(content)) return;
    e.preventDefault(); // the arrows would otherwise scroll the page
    // Opening consumes the key. Without this the navigation handler below
    // sees the menu already open in the same dispatch and walks the highlight
    // a second time, so ArrowDown would land on the second item.
    e.stopImmediatePropagation();
    // Through requestOpenChange, not open, so a controlled menu still gets to
    // veto the open and the change event still fires.
    trigger._templOpenMethod = "keyboard";
    requestOpenChange(content, true, focusOn);
  });

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    const trigger = triggerOf(e.target);
    if (trigger) {
      trigger._templOpenMethod = e.pointerType;
      if (!trigger.disabled) toggle(trigger, false);
    }
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = triggerOf(e.target);
    if (trigger) {
      // Keyboard activation only (Enter/Space fire a detail-0 click without
      // a preceding pointerdown); pointer presses are handled on pointerdown.
      if (e.detail === 0 && !trigger.disabled) {
        trigger._templOpenMethod = "keyboard";
        toggle(trigger, true);
      }
      return;
    }

    // Clicking a submenu trigger opens it right away.
    const subTrigger = e.target.closest(SUB_TRIGGER);
    if (subTrigger) {
      const sub = subTrigger.closest(SUB);
      if (sub) {
        clearTimeout(sub._templOpen);
        sub._templOpen = null;
		requestSubOpenChange(sub, true, e.detail === 0);
      }
      return;
    }

    // Checkbox items toggle and keep the menu open.
    const checkbox = e.target.closest('[data-slot="dropdown-menu-checkbox-item"]');
    if (checkbox) {
      if (!checkbox.disabled) {
        const on = checkbox.hasAttribute("data-checked");
    const change = new CustomEvent("dropdownmenu-checked-change", {
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
    const radio = e.target.closest('[data-slot="dropdown-menu-radio-item"]');
    if (radio) {
      if (!radio.disabled) {
        const group = radio.closest('[data-slot="dropdown-menu-radio-group"]');
    const change = new CustomEvent("dropdownmenu-value-change", {
      bubbles: true,
      cancelable: true,
      detail: { value: radio.getAttribute("data-templ-value") },
    });
    const accepted = (group || radio).dispatchEvent(change);
    if (accepted && group && !group.hasAttribute("data-templ-value")) {
          group.querySelectorAll('[data-slot="dropdown-menu-radio-item"]').forEach((r) => {
            setChecked(r, false);
          });
      setChecked(radio, true);
        }
      }
      return;
    }

    const item = e.target.closest('[data-slot="dropdown-menu-item"]');
    if (item) {
      if (
        item.getAttribute("aria-disabled") !== "true" &&
        item.getAttribute("data-templ-close-on-click") !== "false"
      ) {
        const content = positionerOf(item);
        if (content) requestOpenChange(content, false, false, true);
      }
      return;
    }
  });

  document.addEventListener("keydown", (e) => {
    const content = anyOpen();
    if (!content) return;

    if (e.key === "Tab") {
      requestCloseAll(false);
      return;
    }

    const active = document.activeElement;
    if (!content.contains(active)) return;
    const container = containerOf(active) || popupFor(content);
    if (!container) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus(container, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(container, -1);
        break;
      case "Home": {
        e.preventDefault();
        const items = itemsIn(container);
        focusItem(items[0]);
        break;
      }
      case "End": {
        e.preventDefault();
        const items = itemsIn(container);
        focusItem(items[items.length - 1]);
        break;
      }
      case "ArrowRight": {
        const subTrigger = active.closest(SUB_TRIGGER);
        if (subTrigger) {
          e.preventDefault();
          const sub = subTrigger.closest(SUB);
		  if (sub) requestSubOpenChange(sub, true, true);
        }
        break;
      }
      case "ArrowLeft": {
        const subContent = active.closest(SUB_CONTENT);
        if (subContent) {
          e.preventDefault();
          const sub = subContent.closest(SUB);
          if (sub) {
            const { trigger } = subParts(sub);
			requestSubOpenChange(sub, false);
            if (trigger) trigger.focus({ preventScroll: true });
          }
        }
        break;
      }
    }
  });

})();
