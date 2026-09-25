// Uses window.FloatingUIDOM from components/floatingui (loaded in the same bundle).
(function () {
  const EXIT_MS = 120; // exit animation (duration-100) + slack
  const COLLISION_PADDING = 5;
  // Submenu hover intent, like Base UI: open fast, close with a grace delay so
  // moving the mouse diagonally into the submenu does not flicker.
  const SUB_OPEN_DELAY = 100;
  const SUB_CLOSE_DELAY = 300;

  const escapeTargets = new WeakSet();
  function listenForEscape(element) {
    if (!element || escapeTargets.has(element)) return;
    element.addEventListener("keydown", closeOnEscapeKeyDown);
    escapeTargets.add(element);
  }

  // useDismiss: popup/reference listeners stop Escape before outer document handlers.
  function closeOnEscapeKeyDown(event) {
    if (event.key !== "Escape") return;
    const contents = event.currentTarget === document
      ? allContents()
      : [isPositioner(event.currentTarget)
        ? event.currentTarget
        : contentFor(event.currentTarget)];
    let handled = false;
    for (const content of contents) {
      if (!content?.hasAttribute("data-open")) continue;
      if (requestOpenChange(content, false, false, true)) event.preventDefault();
      event.stopPropagation();
      handled = true;
    }
    return handled;
  }

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

  function setState(content, state) {
    const open = state === "open";
    content.toggleAttribute("data-open", open);
    content.toggleAttribute("data-closed", !open);
    const popup = popupFor(content);
    if (popup) {
      popup.toggleAttribute("data-open", open);
      popup.toggleAttribute("data-closed", !open);
    }
  }

  function isOpen(el) {
    return !!el && el.hasAttribute("data-open");
  }

  function setTransitionAttribute(content, name, present) {
    content.toggleAttribute(name, present);
    const popup = popupFor(content);
    if (popup) popup.toggleAttribute(name, present);
  }

  function startTransition(content) {
    setTransitionAttribute(content, "data-ending-style", false);
    setTransitionAttribute(content, "data-starting-style", true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTransitionAttribute(content, "data-starting-style", false));
    });
  }

  function setChecked(item, checked) {
    item.toggleAttribute("data-checked", checked);
    item.toggleAttribute("data-unchecked", !checked);
    item.setAttribute("aria-checked", checked ? "true" : "false");
  }

  function setSide(content, side) {
    content.setAttribute("data-side", side);
    const popup = popupFor(content);
    if (popup) popup.setAttribute("data-side", side);
  }

  // Base UI zooms the popup out of the anchor's center point (e.g.
  // "96px -4px"), not out of a placement corner.
  function anchorOrigin(result, anchorRect, positionerRect, sideOffset) {
    const side = result.placement.split("-")[0];
    const centerX = anchorRect.left + anchorRect.width / 2 - positionerRect.left + "px";
    const centerY = anchorRect.top + anchorRect.height / 2 - positionerRect.top + "px";
    if (side === "bottom") return centerX + " " + -sideOffset + "px";
    if (side === "top") return centerX + " calc(100% + " + sideOffset + "px)";
    if (side === "right") return -sideOffset + "px " + centerY;
    return "calc(100% + " + sideOffset + "px) " + centerY;
  }

  // Moves the content to <body> (shadcn portals it the same way).
  // The unmount half of the React portal pendant: a portaled content lives
  // as long as its SSR declaration site (_templPortalOwner) stays in the
  // document. Trigger-presence heuristics judged mid-swap moments wrongly -
  // multi-phase swap layers briefly disconnect the new triggers.
  function removeOrphanedContents(content) {
    allContents().filter((c) => c.parentElement === document.body).forEach((c) => {
      if (c !== content && c._templPortalOwner && !c._templPortalOwner.isConnected) {
        stopAutoPositioning(c);
        c._templReleaseScroll?.();
        c._templReleaseScroll = null;
        c.remove();
      }
    });
  }

  function portal(content) {
    listenForEscape(content);
    removeOrphanedContents(content);
    if (content.parentElement !== document.body) {
      if (!content._templPortalOwner) content._templPortalOwner = content.parentElement;
      document.body.appendChild(content);
    }
  }

  function positionMenu(content, trigger) {
    const { computePosition, offset, flip, shift, size } = window.FloatingUIDOM;
    // Read at open, like Base UI reads its side prop on render; a block that
    // switches side per viewport updates data-templ-side itself.
    const side = content.getAttribute("data-templ-side") || "bottom";
    const align = content.getAttribute("data-templ-align") || "start";
    const sideOffset =
      parseInt(content.getAttribute("data-templ-side-offset"), 10) || 4;
    const alignOffset =
      parseInt(content.getAttribute("data-templ-align-offset"), 10) || 0;
    const placement = align === "center" ? side : side + "-" + align;

    return computePosition(trigger, content, {
      placement: placement,
      strategy: "absolute",
      middleware: [
        offset({ mainAxis: sideOffset, alignmentAxis: alignOffset }),
        flip({ padding: COLLISION_PADDING }),
        shift({ padding: COLLISION_PADDING }),
        size({
          padding: COLLISION_PADDING,
          apply(args) {
            content.style.setProperty(
              "--available-height",
              args.availableHeight + "px",
            );
            content.style.setProperty(
              "--anchor-width",
              args.rects.reference.width + "px",
            );
          },
        }),
      ],
    }).then((result) => {
      content.style.left = result.x + "px";
      content.style.top = result.y + "px";
      setSide(content, result.placement.split("-")[0]);
      const popup = popupFor(content);
      if (popup) {
        popup.style.setProperty(
          "--transform-origin",
          anchorOrigin(
            result,
            trigger.getBoundingClientRect(),
            content.getBoundingClientRect(),
            sideOffset,
          ),
        );
      }
    });
  }

  // Base UI keeps mounted popups attached to their anchors while ancestors
  // move, resize, scroll, or shift layout. This also tracks a mobile sidebar
  // while its opening transform is still settling.
  function startAutoPositioning(content, trigger) {
    if (content._templPositionCleanup) content._templPositionCleanup();
    let resolveFirst;
    const firstPosition = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const update = () => positionMenu(content, trigger).then(resolveFirst, resolveFirst);
    content._templPositionCleanup = window.FloatingUIDOM.autoUpdate(trigger, content, update, {
      elementResize: typeof ResizeObserver !== "undefined",
      layoutShift: typeof IntersectionObserver !== "undefined",
    });
    return firstPosition;
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
    clearTimeout(content._templHide);
    content._templOpenMethod = trigger._templOpenMethod || "programmatic";
    portal(content);
    // z-index portal like shadcn (no native top layer); re-append
    // keeps paint order = open order.
    document.body.appendChild(content);
    content.hidden = false;

    // Position it invisibly first, then play the enter animation in place.
    content.style.visibility = "hidden";
    const finish = () => {
      // duration-100 transitions `all`; a visibility transition would
      // freeze at hidden in background tabs - flip suppressed.
      const popup = popupFor(content);
      content.style.transitionProperty = "none";
      if (popup) popup.style.transitionProperty = "none";
      content.style.visibility = "";
      void content.offsetWidth;
      content.style.transitionProperty = "";
      if (popup) popup.style.transitionProperty = "";
      if (content.hidden || !content.isConnected) return;
      // useAnchoredPopupScrollLock measures the positioned popup for touch opens.
      content._templReleaseScroll?.();
      content._templReleaseScroll = window.templ.scrollLock.anchoredPopup(
        true, content._templOpenMethod === "touch", content, trigger,
      );
      setState(content, "open");
      startTransition(content);
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
    stopAutoPositioning(content);
    setTransitionAttribute(content, "data-starting-style", false);
    setState(content, "closed");
    setTransitionAttribute(content, "data-ending-style", true);
    content.querySelectorAll(SUB).forEach(closeSubNow);
    const trigger = triggerFor(content);
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("data-popup-open");
      trigger.removeAttribute("data-pressed");
      if (refocusTrigger) trigger.focus({ preventScroll: true });
    }
    clearTimeout(content._templHide);
    content._templHide = setTimeout(() => {
      if (content.hasAttribute("data-closed") && !content.hidden) {
        content.hidden = true;
        setTransitionAttribute(content, "data-ending-style", false);
      }
    }, EXIT_MS);
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
    content.classList.remove("hidden");
    content.style.visibility = "hidden";

    const { computePosition, offset, flip, shift } = window.FloatingUIDOM;
    // Base UI submenu placement: right-start, sideOffset 0, alignOffset -3.
    computePosition(trigger, content, {
      placement: "right-start",
      strategy: "fixed",
      middleware: [
        offset({ mainAxis: 0, alignmentAxis: -3 }),
        flip({ padding: COLLISION_PADDING }),
        shift({ padding: COLLISION_PADDING }),
      ],
    }).then((result) => {
      if (content.classList.contains("hidden")) return; // closed meanwhile
      content.style.transition = "none";
      content.style.left = result.x + "px";
      content.style.top = result.y + "px";
      content.setAttribute("data-side", result.placement.split("-")[0]);
      content.style.setProperty(
        "--transform-origin",
        anchorOrigin(result, trigger.getBoundingClientRect(), content.getBoundingClientRect(), 0),
      );
      content.offsetHeight; // flush styles before re-enabling transitions
      content.style.transition = "";
      // duration-100 transitions `all`; a visibility transition would
      // freeze at hidden in background tabs - flip suppressed.
      content.style.transitionProperty = "none";
      content.style.visibility = "";
      void content.offsetWidth;
      content.style.transitionProperty = "";
      content.setAttribute("data-open", "");
      content.removeAttribute("data-closed");
      startTransition(content);
      trigger.setAttribute("data-popup-open", "");
	  trigger.setAttribute("aria-expanded", "true");
      if (focusFirst) focusItem(itemsIn(content)[0] || content);
    });
  }

  // Closes with the exit animation.
  function closeSub(sub) {
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    content.removeAttribute("data-open");
    content.setAttribute("data-closed", "");
    setTransitionAttribute(content, "data-starting-style", false);
    setTransitionAttribute(content, "data-ending-style", true);
    trigger.removeAttribute("data-popup-open");
	trigger.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      if (content.hasAttribute("data-closed")) {
        content.classList.add("hidden");
        setTransitionAttribute(content, "data-ending-style", false);
      }
    }, EXIT_MS);
  }

  // Closes immediately (used when the whole menu goes away).
  function closeSubNow(sub) {
    clearTimeout(sub._templOpen);
    clearTimeout(sub._templClose);
    sub._templOpen = null;
    sub._templClose = null;
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    content.classList.add("hidden");
    content.removeAttribute("data-open");
    content.setAttribute("data-closed", "");
    setTransitionAttribute(content, "data-starting-style", false);
    setTransitionAttribute(content, "data-ending-style", false);
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

  function init() {
    removeOrphanedContents();
    allContents().forEach((content) => {
      const trigger = triggerFor(content);
      if (!trigger) return;
      listenForEscape(trigger);
      // Server-side open state (Base UI open or defaultOpen), once per element.
      if (content._templInit) return;
      content._templInit = true;
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        open(content, trigger, false);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // Re-init on any childList mutation, directly (never rAF-deferred: rAF
  // does not fire in hidden tabs or throttled iframes): swapped-in markup
  // wires itself, removals release portaled content through the
  // ownership sweep.
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });

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
      return;
    }
    if (!positionerOf(e.target)) requestCloseAll(false);
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
    if (closeOnEscapeKeyDown(e)) return;
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
