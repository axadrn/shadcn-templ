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
      if (requestOpenChange(content, false)) event.preventDefault();
      event.stopPropagation();
      handled = true;
    }
    return handled;
  }

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
    return !!(el && el.firstElementChild && el.firstElementChild.matches(POPUP));
  }

  function allContents() {
    return [...document.querySelectorAll(POPUP)].map((p) => p.parentElement).filter(isPositioner);
  }

  function positionerOf(target) {
    const popup = target && target.closest && target.closest(POPUP);
    return popup && isPositioner(popup.parentElement) ? popup.parentElement : null;
  }

  function contentFor(trigger) {
    return document.getElementById(trigger.getAttribute("data-templ-context-menu-trigger") || "");
  }

  function triggerFor(content) {
    return document.querySelector('[data-templ-context-menu-trigger="' + content.id + '"]');
  }

  function popupFor(content) {
    return content.firstElementChild;
  }

  function setOpenState(element, open) {
    element.toggleAttribute("data-open", open);
    element.toggleAttribute("data-closed", !open);
  }

  function setState(content, state) {
    const open = state === "open";
    setOpenState(content, open);
    const popup = popupFor(content);
    if (popup) setOpenState(popup, open);
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

  // Base UI zooms the popup out of the anchor's center point, not out of a
  // placement corner. The anchor here is the cursor (a zero-size rect).
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

  // A zero-size rect at the cursor acts as the anchor element.
  function cursorAnchor(x, y) {
    return {
      getBoundingClientRect: function () {
        return { x: x, y: y, top: y, bottom: y, left: x, right: x, width: 0, height: 0 };
      },
    };
  }

  function positionMenu(content, x, y) {
    const { computePosition, offset, flip, shift, size } = window.FloatingUIDOM;
    // Base UI context menu placement: right-start against the cursor,
    // sideOffset 0, alignOffset 4.
    const side = content.getAttribute("data-templ-side") || "right";
    const sideOffset =
      parseInt(content.getAttribute("data-templ-side-offset"), 10) || 0;
    const alignOffset =
      parseInt(content.getAttribute("data-templ-align-offset"), 10) || 0;
    const anchor = cursorAnchor(x, y);

    return computePosition(anchor, content, {
      placement: side + "-start",
      strategy: "fixed",
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
            anchor.getBoundingClientRect(),
            content.getBoundingClientRect(),
            sideOffset,
          ),
        );
      }
    });
  }

  // ----- focus highlighting (Base UI moves real focus to menu items) --------

  const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

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

  function openAt(content, x, y, touchOpen = false) {
    const alreadyOpen = content.hasAttribute("data-open");
    allContents().forEach((c) => {
    if (c !== content) requestOpenChange(c, false);
    });
    clearTimeout(content._templHide);
    portal(content);
    // z-index portal like shadcn (no native top layer); re-append
    // keeps paint order = open order.
    document.body.appendChild(content);
    content.hidden = false;

    if (alreadyOpen) {
      // Right-click somewhere else while open: move over to the new spot.
      content.querySelectorAll(SUB).forEach(closeSubNow);
      positionMenu(content, x, y).then(() => {
        if (!content.isConnected || !content.hasAttribute("data-open")) return;
        content._templReleaseScroll?.();
        content._templReleaseScroll = window.templ.scrollLock.anchoredPopup(
          true, touchOpen, content, triggerFor(content),
        );
      });
      return;
    }

    // Fresh open: position it invisibly first, then play the enter animation
    // at the cursor.
    content.style.visibility = "hidden";
    positionMenu(content, x, y).then(() => {
      if (content.hidden || !content.isConnected) return; // closed or removed meanwhile
      // duration-100 transitions `all`; a visibility transition would
      // freeze at hidden in background tabs - flip suppressed.
      const popup = popupFor(content);
      content.style.transitionProperty = "none";
      if (popup) popup.style.transitionProperty = "none";
      content.style.visibility = "";
      void content.offsetWidth;
      content.style.transitionProperty = "";
      if (popup) popup.style.transitionProperty = "";
      // useAnchoredPopupScrollLock: a native touch context menu follows the touch rule.
      content._templReleaseScroll?.();
      content._templReleaseScroll = window.templ.scrollLock.anchoredPopup(
        true, touchOpen, content, triggerFor(content),
      );
      setState(content, "open");
      if (popup) {
        syncSubState(popup);
        enqueueFocus(popup, () => content.hasAttribute("data-open"));
      }
    });
  }

  function close(content) {
    if (content.hidden) return;
    setState(content, "closed");
    content.querySelectorAll(SUB).forEach(closeSubNow);
    clearTimeout(content._templHide);
    content._templHide = setTimeout(() => {
      if (content.hasAttribute("data-closed") && !content.hidden) {
        content.hidden = true;
      }
    }, EXIT_MS);
    content._templReleaseScroll?.();
    content._templReleaseScroll = null;
  }

  function closeAll() {
  allContents().forEach((content) => requestOpenChange(content, false));
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

  function anyOpen() {
    return [...allContents()].find((c) => c.hasAttribute("data-open")) || null;
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
      setOpenState(content, true);
      setOpenState(trigger, true);
	  trigger.setAttribute("aria-expanded", "true");
      if (focusFirst) focusItem(itemsIn(content)[0] || content);
    });
  }

  // Closes with the exit animation.
  function closeSub(sub) {
    const { trigger, content } = subParts(sub);
    if (!trigger || !content) return;
    setOpenState(content, false);
    setOpenState(trigger, false);
	trigger.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      if (content.hasAttribute("data-closed")) {
        content.classList.add("hidden");
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
    setOpenState(content, false);
    setOpenState(trigger, false);
	trigger.setAttribute("aria-expanded", "false");
  }

  function requestSubOpenChange(sub, nextOpen, focusFirst) {
	const { trigger, content } = subParts(sub);
	if (!trigger || !content || content.hasAttribute("data-open") === nextOpen) return;
	const accepted = trigger.dispatchEvent(
	  new CustomEvent("contextmenu-sub-open-change", {
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
    if (!content || !content.hasAttribute("data-open")) return;
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
    document.querySelectorAll(TRIGGER).forEach(listenForEscape);
    removeOrphanedContents();
    document.querySelectorAll(TRIGGER).forEach((trigger) => {
      const content = contentFor(trigger);
      // Server-side open state (Base UI open or defaultOpen), once per element.
      if (!content || content._templInit) return;
      content._templInit = true;
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        const rect = trigger.getBoundingClientRect();
        openAt(content, rect.left + rect.width / 2, rect.top + rect.height / 2);
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
    if (e.button !== 0) return;
    if (!positionerOf(e.target)) closeAll();
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
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
    const checkbox = e.target.closest('[data-slot="context-menu-checkbox-item"]');
    if (checkbox) {
      if (!checkbox.disabled) {
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
      if (!radio.disabled) {
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

  document.addEventListener("keydown", (e) => {
    if (closeOnEscapeKeyDown(e)) return;
    const content = anyOpen();
    if (!content) return;

    if (e.key === "Tab") {
      closeAll();
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

  // Context menus close on scroll and resize (Base UI behavior: the anchor is
  // a point, there is nothing to stay attached to).
  window.addEventListener("scroll", closeAll, true);
  window.addEventListener("resize", closeAll);
})();
