(function () {
  // Constants from Base UI's select, shadcn's reference implementation.
  const SIDE_OFFSET = 4;
  const COLLISION_PADDING = 5;
  const MARGIN = 10; // aligned mode: minimum distance to the viewport edges
  const MIN_HEIGHT = 100; // less room than this -> fall back to popper
  const TRIGGER_COLLISION = 20; // trigger this close to an edge -> popper
  const TOL = 1; // scroll edge tolerance
  const ARROW_TICK_MS = 40; // hovering a scroll arrow scrolls one item per tick
  const SELECTED_DELAY = 400; // mouseup selection stays disabled this long after open

  // The select's element is the positioner (no slot upstream) around the
  // [data-slot=select-content] popup.
  const POPUP = '[data-slot="select-content"]';
  const TRIGGER = '[data-slot="select-trigger"]';
  const ITEM = '[data-slot="select-item"]';
  const ARROWS = '[data-slot="select-scroll-up-button"], [data-slot="select-scroll-down-button"]';

  function isPositioner(el) {
    // The popup is the positioner's slotted child, next to the focus guards.
    return !!el?.querySelector?.(":scope > " + POPUP);
  }

  function allContents() {
    return [...document.querySelectorAll(POPUP)].map((p) => p.parentElement).filter(isPositioner);
  }

  function positionerOf(target) {
    const popup = target && target.closest && target.closest(POPUP);
    return popup && isPositioner(popup.parentElement) ? popup.parentElement : null;
  }

  function triggerFor(content) {
    return document.querySelector(TRIGGER + '[aria-controls="' + content.id + '"]');
  }

  function contentFor(trigger) {
    return document.getElementById(trigger.getAttribute("aria-controls"));
  }

  // The hidden form input sits right before the trigger button.
  function inputFor(trigger) {
    const prev = trigger.previousElementSibling;
    return prev && prev.matches('input[type="hidden"]') ? prev : null;
  }

  // Base UI's Select.ItemText has no slot; it is the item's first child.
  function itemTextOf(item) {
    return item.firstElementChild || item;
  }

  function itemTextOrNull(item) {
    return item ? itemTextOf(item) : null;
  }

  function labelOf(item) {
    return item.getAttribute("data-templ-label") || itemTextOf(item).textContent.trim();
  }

  function valueSpanFor(trigger) {
    return trigger.querySelector('[data-slot="select-value"]');
  }

  function popupFor(content) {
    return content.querySelector(":scope > " + POPUP);
  }

  // Base UI's Select.List has no slot; it is the popup child between the
  // scroll arrows.
  function viewportFor(content) {
    return popupFor(content).querySelector(":scope > :not([data-slot])");
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function maxScrollTop(el) {
    return Math.max(0, el.scrollHeight - el.clientHeight);
  }

  function isAlignMode(content) {
    return content.getAttribute("data-templ-align-item-with-trigger") !== "false";
  }

  // The popup renders the transition status, its positioner the open state.
  function partsOf(content) {
    return { positioner: content, parts: [popupFor(content)] };
  }

  function isOpen(content) {
    return !!content && content.hasAttribute("data-open");
  }



  // The positioner's parent is the portal node, which moves to <body>
  // (shadcn portals it the same way).
  function portalNodeOf(content) {
    return content.parentElement;
  }

  function portal(content) {
    window.templ.portal.render(portalNodeOf(content));
  }

  // SelectPopup's FloatingFocusManager: non modal, focus returns to the
  // trigger on unmount.
  function startFocusManager(content, trigger) {
    if (content._templFocus) {
      content._templFocus.open();
      return;
    }
    content._templFocus = window.templ.focusManager.useFloatingFocusManager({
      floating: content,
      reference: trigger,
      modal: false,
      openInteractionType: content._templOpenMethod === "programmatic" ? null : content._templOpenMethod,
      restoreFocus: true,
      onOpenChange: (open) => requestOpenChange(content, open),
    });
  }

  function stopFocusManager(content) {
    content._templFocus?.unmount();
    content._templFocus = null;
  }

  // ----- list navigation and typeahead ---------------------------------------

  function itemsIn(content) {
    return [...content.querySelectorAll(ITEM)];
  }

  function selectedIndexOf(content) {
    const index = itemsIn(content).findIndex((item) => item.hasAttribute("data-selected"));
    return index === -1 ? null : index;
  }

  // The item's highlight, with SelectItem's roving tabindex.
  function highlight(content, index) {
    content._templActiveIndex = index;
    itemsIn(content).forEach((item, i) => {
      item.toggleAttribute("data-highlighted", i === index);
      item.tabIndex = i === index ? 0 : -1;
    });
  }

  // SelectRoot's useListNavigation and useTypeahead. Disabled items are
  // highlighted (an empty disabledIndices), typeahead skips them, and typing
  // on the closed trigger selects the match.
  function startListNavigation(content, trigger) {
    const popup = popupFor(content);
    const items = () => itemsIn(content);
    const activeIndex = () => content._templActiveIndex ?? null;
    const selectedIndex = () => selectedIndexOf(content);
    const enabled = () => !trigger.disabled && trigger.getAttribute("aria-readonly") !== "true";
    content._templNav = window.templ.listNavigation.useListNavigation({
      floating: popup,
      reference: trigger,
      items,
      activeIndex,
      selectedIndex,
      disabledIndices: [],
      isOpen: () => isOpen(content),
      onNavigate(index) {
        // Retain the highlight while transitioning out.
        if (index === null && !isOpen(content)) return;
        highlight(content, index);
      },
      onOpenChange(open) {
        if (enabled()) requestOpenChange(content, open, "keyboard");
      },
    });
    content._templTypeahead = window.templ.typeahead.useTypeahead({
      elements: [trigger, popup],
      labels: () => items().map(labelOf),
      activeIndex,
      selectedIndex,
      isOpen: () => isOpen(content),
      disabledIndices: (index) => {
        const item = items()[index];
        return !item || item.hasAttribute("disabled") || item.getAttribute("aria-disabled") === "true";
      },
      onMatch(index) {
        if (!enabled()) return;
        if (isOpen(content)) {
          highlight(content, index);
          content._templNav.sync();
        } else {
          selectItem(content, items()[index]);
        }
      },
    });
  }

  function stopListNavigation(content) {
    content._templNav?.cleanup();
    content._templTypeahead?.cleanup();
    content._templNav = null;
    content._templTypeahead = null;
  }

  // Clears everything a previous open left behind on the positioner and popup.
  function resetInlineStyles(content) {
    ["left", "right", "top", "bottom", "height", "maxHeight", "marginTop", "marginBottom"].forEach(
      (prop) => (content.style[prop] = ""),
    );
    const popup = popupFor(content);
    if (popup) popup.style.height = "";
  }


  // Overlays the menu so the selected item sits on the trigger with its text
  // aligned to the trigger text. Port of Base UI's SelectPopup align logic.
  // Runs after the first positioning pass, which sets the CSS variables;
  // returns false when Base UI falls back to popper positioning.
  function positionAligned(content, trigger) {
    const popup = popupFor(content);
    const viewport = viewportFor(content);
    const valueEl = valueSpanFor(trigger);
    const textEl =
      itemTextOrNull(content.querySelector(ITEM + "[data-selected]")) ||
      itemTextOrNull(content.querySelector(ITEM));

    const docEl = document.documentElement;
    const triggerRect = trigger.getBoundingClientRect();
    const positionerRect = content.getBoundingClientRect(); // natural size from the popper pass
    // The list's natural height, measured before the aligned styles stretch
    // the popup (scrollHeight can never report less than the client height).
    const naturalScrollHeight = viewport.scrollHeight;
    const popupStyles = window.getComputedStyle(popup);
    const borderBottom = parseFloat(popupStyles.borderBottomWidth) || 0;
    const maxPopupHeight = parseFloat(popupStyles.maxHeight) || Infinity;
    const viewportHeight = docEl.clientHeight - MARGIN * 2;
    const viewportWidth = docEl.clientWidth;
    const availableSpaceBeneathTrigger = viewportHeight - triggerRect.bottom + triggerRect.height;

    let alignedLeft = triggerRect.left;
    let offsetY = 0;
    let textRect = null;
    if (textEl && valueEl) {
      const valueRect = valueEl.getBoundingClientRect();
      textRect = textEl.getBoundingClientRect();
      alignedLeft = positionerRect.left + (valueRect.left - textRect.left);
      offsetY =
        textRect.top - positionerRect.top + textRect.height / 2 -
        (valueRect.top - triggerRect.top + valueRect.height / 2);
    }

    const idealHeight = availableSpaceBeneathTrigger + offsetY + MARGIN + borderBottom;
    let height = Math.min(viewportHeight, idealHeight);
    const maxHeight = viewportHeight - MARGIN * 2;
    const scrollTop = idealHeight - height;

    content.style.left =
      clamp(
        alignedLeft,
        COLLISION_PADDING,
        Math.max(COLLISION_PADDING, viewportWidth - COLLISION_PADDING - positionerRect.width),
      ) + "px";
    content.style.height = height + "px";
    content.style.maxHeight = "none";
    content.style.marginTop = MARGIN + "px";
    content.style.marginBottom = MARGIN + "px";
    popup.style.height = "100%";

    const max = maxScrollTop(viewport);
    const isTopPositioned = scrollTop >= max - TOL;

    if (isTopPositioned) {
      height = Math.min(viewportHeight, positionerRect.height) - (scrollTop - max);
    }

    if (
      triggerRect.top < TRIGGER_COLLISION ||
      triggerRect.bottom > viewportHeight - TRIGGER_COLLISION ||
      Math.ceil(height) + TOL < Math.min(naturalScrollHeight, MIN_HEIGHT)
    ) {
      return false;
    }

    content._templReachedMax = false;

    if (isTopPositioned) {
      const topOffset = Math.max(0, viewportHeight - idealHeight);
      content.style.top = (positionerRect.height >= maxHeight ? 0 : topOffset) + "px";
      content.style.height = height + "px";
      viewport.scrollTop = maxScrollTop(viewport);
    } else {
      content.style.top = "auto";
      content.style.bottom = "0px";
      viewport.scrollTop = scrollTop;
    }

    if (textRect) {
      const clampedY = clamp(
        positionerRect.height > 0
          ? ((textRect.top + textRect.height / 2 - positionerRect.top) / positionerRect.height) * 100
          : 50,
        0,
        100,
      );
      popup.style.setProperty("--transform-origin", "50% " + clampedY + "%");
    }

    if (height >= viewportHeight || height >= maxPopupHeight) {
      content._templReachedMax = true;
    }
    return true;
  }

  // SelectPositioner: useAnchorPositioning with the dropdown collision
  // avoidance for the popper mode. While the popup is aligned with the trigger
  // (alignItemWithTrigger, not for touch opens) the positioner is fixed, its
  // side is "none", anchor tracking is off and positionAligned places it,
  // once per open. When that does not fit, the select falls back to the
  // popper mode until it unmounts.
  function startAutoPositioning(content, trigger) {
    stopAutoPositioning(content);
    const popup = popupFor(content);
    if (!popup || !viewportFor(content)) return Promise.resolve();
    const alignActive = isAlignMode(content) && content._templOpenMethod !== "touch" && !content._templAlignFallback;
    content._templAligned = false;
    resetInlineStyles(content);
    let placed = false;
    const positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor: trigger,
      positioner: content,
      parts: [content, popup],
      side: content.getAttribute("data-templ-side") || "bottom",
      align: content.getAttribute("data-templ-align") || "center",
      sideOffset: parseFloat(content.getAttribute("data-templ-side-offset")) || SIDE_OFFSET,
      alignOffset: parseFloat(content.getAttribute("data-templ-align-offset")) || 0,
      collisionAvoidance: { fallbackAxisSide: "none" },
      disableAnchorTracking: alignActive,
      applyPosition: () => !alignActive,
      onPosition(result, side) {
        trigger.setAttribute("data-popup-side", side);
        if (!alignActive) {
          updateScrollArrows(content);
          return;
        }
        if (placed) return;
        placed = true;
        [content, popup].forEach((part) => part.setAttribute("data-side", "none"));
        if (positionAligned(content, trigger)) {
          content._templAligned = true;
          updateScrollArrows(content);
          return;
        }
        content._templAlignFallback = true;
        startAutoPositioning(content, trigger);
      },
    });
    content._templPositionCleanup = positioning.cleanup;
    return positioning.positioned;
  }

  function stopAutoPositioning(content) {
    if (!content._templPositionCleanup) return;
    content._templPositionCleanup();
    content._templPositionCleanup = null;
  }

  // ----- scroll arrows + capped grow-on-scroll (Base UI behavior) -----------

  function updateScrollArrows(content) {
    const viewport = viewportFor(content);
    const up = content.querySelector('[data-slot="select-scroll-up-button"]');
    const down = content.querySelector('[data-slot="select-scroll-down-button"]');
    if (!viewport || !up || !down) return;
    const max = maxScrollTop(viewport);
    up.classList.toggle("hidden", max <= 0 || viewport.scrollTop <= TOL);
    down.classList.toggle("hidden", max <= 0 || viewport.scrollTop >= max - TOL);
  }

  // In aligned mode scrolling first consumes the remaining space toward the
  // viewport edge (capped by the popup's max-height), then scrolls the list.
  function handleAlignedScroll(content) {
    const viewport = viewportFor(content);
    const popup = popupFor(content);
    if (!viewport || !popup) return;

    const isTopPositioned = content.style.top === "0px";
    const isBottomPositioned = content.style.bottom === "0px";

    if (content._templReachedMax || !content._templAligned || (!isTopPositioned && !isBottomPositioned)) {
      updateScrollArrows(content);
      return;
    }

    const currentHeight = content.getBoundingClientRect().height;
    const maxPopupHeight = parseFloat(window.getComputedStyle(popup).maxHeight) || Infinity;
    const maxAvailableHeight = Math.min(
      document.documentElement.clientHeight - MARGIN * 2,
      maxPopupHeight,
    );

    const scrollTop = viewport.scrollTop;
    const max = maxScrollTop(viewport);

    let nextScrollTop = null;
    const diff = isTopPositioned ? max - scrollTop : scrollTop;
    const nextHeight = Math.min(currentHeight + diff, maxAvailableHeight);

    if (diff <= TOL) {
      const heightDelta = clamp(diff, 0, maxAvailableHeight - currentHeight);
      if (heightDelta > 0) {
        content.style.height = currentHeight + heightDelta + "px";
      }
      viewport.scrollTop = isTopPositioned ? maxScrollTop(viewport) : 0;
      if (maxAvailableHeight - (currentHeight + heightDelta) <= TOL) {
        content._templReachedMax = true;
      }
      updateScrollArrows(content);
      return;
    }

    if (maxAvailableHeight - nextHeight > TOL) {
      nextScrollTop = isTopPositioned ? Infinity : 0;
    } else if (isBottomPositioned && scrollTop < max) {
      const overshoot = currentHeight + diff - maxAvailableHeight;
      nextScrollTop = scrollTop - (diff - overshoot);
    }

    const nextPositionerHeight = Math.ceil(nextHeight);
    if (nextPositionerHeight !== 0) {
      content.style.height = nextPositionerHeight + "px";
    }

    if (nextScrollTop != null) {
      const target = clamp(nextScrollTop, 0, maxScrollTop(viewport));
      if (Math.abs(viewport.scrollTop - target) > TOL) {
        viewport.scrollTop = target;
      }
    }

    if (nextPositionerHeight >= maxAvailableHeight - TOL) {
      content._templReachedMax = true;
    }
    updateScrollArrows(content);
  }

  // Hovering a scroll arrow scrolls one item per tick, keeping the next item
  // clear of the arrow overlay (Base UI's getTargetScrollTop).
  function targetScrollTop(items, isUp, scrollTop, clientHeight, arrowHeight, max) {
    if (isUp) {
      let firstVisibleIndex = 0;
      const visibleTop = scrollTop + arrowHeight - TOL;
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].offsetTop >= visibleTop) {
          firstVisibleIndex = i;
          break;
        }
      }
      const targetIndex = Math.max(0, firstVisibleIndex - 1);
      const target = items[targetIndex];
      return targetIndex < firstVisibleIndex && target
        ? clamp(target.offsetTop - arrowHeight, 0, max)
        : 0;
    }

    let lastVisibleIndex = items.length - 1;
    const visibleBottom = scrollTop + clientHeight - arrowHeight + TOL;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].offsetTop + items[i].offsetHeight > visibleBottom) {
        lastVisibleIndex = Math.max(0, i - 1);
        break;
      }
    }
    const targetIndex = Math.min(items.length - 1, lastVisibleIndex + 1);
    const target = items[targetIndex];
    return targetIndex > lastVisibleIndex && target
      ? clamp(target.offsetTop + target.offsetHeight - clientHeight + arrowHeight, 0, max)
      : max;
  }

  let arrowTimer = null;

  function stopArrowScroll() {
    clearTimeout(arrowTimer);
    arrowTimer = null;
  }

  function arrowScrollStep(content, isUp, arrow) {
    const viewport = viewportFor(content);
    if (!viewport) return;
    updateScrollArrows(content);
    const max = maxScrollTop(viewport);
    const scrollTop = clamp(viewport.scrollTop, 0, max);
    if (scrollTop === (isUp ? 0 : max)) {
      stopArrowScroll();
      return;
    }
    const items = [...content.querySelectorAll(ITEM)];
    viewport.scrollTop = targetScrollTop(
      items,
      isUp,
      scrollTop,
      viewport.clientHeight,
      arrow.offsetHeight || 0,
      max,
    );
    arrowTimer = setTimeout(() => arrowScrollStep(content, isUp, arrow), ARROW_TICK_MS);
  }

  document.addEventListener("mouseover", (e) => {
    if (!(e.target instanceof Element)) return;
    const arrow = e.target.closest(ARROWS);
    if (!arrow || arrowTimer) return;
    const content = positionerOf(arrow);
    if (content) arrowScrollStep(content, arrow.matches('[data-slot="select-scroll-up-button"]'), arrow);
  });

  document.addEventListener("mouseout", (e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(ARROWS)) {
      stopArrowScroll();
    }
  });

  // ----- open / close -------------------------------------------------------

  function open(content, trigger, openMethod) {
    allContents().forEach((c) => {
      if (c !== content) close(c);
    });
    content._templOpenMethod = openMethod || "programmatic";
    // A press on the trigger can open the popup under the pointer (aligned
    // mode). Mouseup selection stays disabled briefly so releasing over the
    // selected item or a neighboring item doesn't commit an accidental
    // selection (Base UI's selectionRef + SELECTED_DELAY). Dragging can
    // re-arm unselected mouseup sooner, see the pointermove handler.
    content._templSelection = {
      allowSelectedMouseUp: false,
      allowUnselectedMouseUp: false,
      dragY: 0,
    };
    clearTimeout(content._templSelectedDelay);
    content._templSelectedDelay = setTimeout(() => {
      content._templSelection.allowSelectedMouseUp = true;
      content._templSelection.allowUnselectedMouseUp = true;
    }, SELECTED_DELAY);
    portal(content);
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: content,
      reference: trigger,
      onOpenChange: (open) => requestOpenChange(content, open),
    });
    startFocusManager(content, trigger);
    content.hidden = false;

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
      content._templNav?.open();
      content._templTypeahead?.reset();
    };
    startAutoPositioning(content, trigger).then(finish, finish);
  }

  function close(content) {
    if (content.hidden) return;
    content._templDismiss?.();
    content._templDismiss = null;
    stopArrowScroll();
    clearTimeout(content._templSelectedDelay);
    content._templSelection = {
      allowSelectedMouseUp: false,
      allowUnselectedMouseUp: false,
      dragY: 0,
    };
    content._templFocus?.close();
    content._templNav?.close();
    content._templTypeahead?.reset();
    // Aligned mode has no exit animation (animate-none, like shadcn), so
    // the close completes on the next frame. Positioned until it unmounts,
    // and the alignment fallback holds until then too. Unmounting the focus
    // manager returns focus.
    window.templ.transition.close(partsOf(content), popupFor(content), () => {
      stopAutoPositioning(content);
      stopFocusManager(content);
      highlight(content, null);
      content._templAlignFallback = false;
      content.hidden = true;
    });
    content._templReleaseScroll?.();
    content._templReleaseScroll = null;
    const trigger = triggerFor(content);
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("data-popup-open");
      trigger.removeAttribute("data-pressed");
    }
  }

  function closeAll() {
    allContents().forEach(close);
  }

  function requestOpenChange(content, nextOpen, openMethod) {
    if (!content || isOpen(content) === nextOpen) return false;
    const accepted = content.dispatchEvent(
      new CustomEvent("select-open-change", {
        bubbles: true,
        cancelable: true,
        detail: {
          open: nextOpen,
          openMethod: nextOpen ? openMethod || "programmatic" : null,
        },
      }),
    );
    if (!accepted || content.hasAttribute("data-templ-open")) return false;
    const trigger = triggerFor(content);
    if (nextOpen && trigger) open(content, trigger, openMethod);
    else if (!nextOpen) close(content);
    return true;
  }

  function selectItem(content, item) {
    const trigger = triggerFor(content);
    if (!trigger) return;
  if (trigger.getAttribute("aria-readonly") === "true") return;
    const value = item.getAttribute("data-templ-value") || "";
    const label = labelOf(item);

    const accepted = trigger.dispatchEvent(
      new CustomEvent("select-change", {
        bubbles: true,
        cancelable: true,
        detail: { value: value, label: label },
      }),
    );
    if (!accepted) return;

    // Controlled: the Base UI value prop, the owner commits.
    if (!trigger.hasAttribute("data-templ-value")) {
      content.querySelectorAll(ITEM).forEach((i) => {
      i.removeAttribute("data-selected");
      i.setAttribute("aria-selected", "false");
      });
      item.setAttribute("data-selected", "");
      item.setAttribute("aria-selected", "true");

      const span = valueSpanFor(trigger);
      if (span) span.textContent = label;
      trigger.removeAttribute("data-placeholder");

      const input = inputFor(trigger);
      if (input && input.value !== value) {
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    requestOpenChange(content, false);
  }

  // Shows the selected item's label in the trigger (server only knows the
  // value, the label lives in the item).
  window.templ.lifecycle.register(TRIGGER, {
    init(trigger) {
      const content = contentFor(trigger);
      if (!isPositioner(content)) return;
      startListNavigation(content, trigger);
      const checked = content.querySelector(ITEM + "[data-selected]");
      if (checked) {
        const label = labelOf(checked);
        const span = valueSpanFor(trigger);
        if (span && span.textContent.trim() !== label) span.textContent = label;
        if (trigger.hasAttribute("data-placeholder")) trigger.removeAttribute("data-placeholder");
      }
      // Server-side open state (Base UI open or defaultOpen). A server open
      // has no pointer, so it is programmatic.
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        open(content, trigger, "programmatic");
      }
    },
  });
  // A content unmounts with its portal owner: a portaled one is removed from
  // <body> then.
  window.templ.lifecycle.register(POPUP, {
    destroy(popup) {
      const content = popup.parentElement;
      if (!isPositioner(content)) return;
      stopListNavigation(content);
      stopAutoPositioning(content);
      content._templReleaseScroll?.();
      content._templReleaseScroll = null;
      content._templDismiss?.();
      stopFocusManager(content);
      window.templ.portal.remove(portalNodeOf(content));
    },
  });

  // ----- events -------------------------------------------------------------

  // Pointer interactions toggle and dismiss on PRESS, exactly like Base UI.
  // Click is never used for open/close, so the stray click the browser fires
  // on <body> after the menu opened over the trigger is naturally harmless.
  function toggle(trigger, openMethod) {
    const content = contentFor(trigger);
    if (!content) return;
    requestOpenChange(content, !isOpen(content), openMethod);
  }

  // Pendant of floating-ui useClick's pointerTypeRef: pointerdown marks the
  // trigger, the click that follows the same press is skipped. A click
  // without the mark (a <label for> forward, keyboard activation, or a
  // programmatic .click()) toggles instead.
  const pressedTriggers = new WeakSet();

  function isMouseWithinBounds(e, el) {
    const rect = el.getBoundingClientRect();
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }

  // Pendant of SelectTrigger's mousedown handler: the press that opened the
  // popup cancels the open again when released outside the trigger and the
  // popup positioner.
  function armCancelOpen(trigger, content) {
    // Firefox can fire the mouseup upon mousedown, hence the deferred attach.
    setTimeout(() => {
      document.addEventListener(
        "mouseup",
        (e) => {
          const target = e.target instanceof Element ? e.target : null;
          // Don't treat the release as an outside press when it lands on the
          // trigger or inside the popup (or their children).
          if (target && (trigger.contains(target) || content.contains(target))) return;
          if (isMouseWithinBounds(e, trigger)) return;
          close(content);
        },
        { once: true },
      );
    }, 0);
  }

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    const trigger = e.target.closest(TRIGGER);
    if (trigger) {
      // Touch opens on the click that fires at release (Base UI opens on
      // the compat mousedown, which for touch also fires post-touchend).
      // Opening at press would put the aligned popup under the still-down
      // finger, and the tap's click, hit-tested at the release point,
      // would land on the item above the trigger and instantly commit it.
      trigger._templOpenMethod = e.pointerType;
      if (e.pointerType === "touch") return;
      pressedTriggers.add(trigger);
      // Keep the browser from focusing the trigger button, focus lives on
      // the selected item while the listbox is open (Base UI focus scope).
      e.preventDefault();
      if (!trigger.disabled) {
        const content = contentFor(trigger);
        if (content) {
          if (isOpen(content)) {
            requestOpenChange(content, false);
          } else {
            requestOpenChange(content, true, e.pointerType);
            armCancelOpen(trigger, content);
          }
        }
      }
      return;
    }
    // Pendant of SelectItem's allowMouseSelectionRef: a real pointer click
    // only commits when its press started on the item. The stray click the
    // browser hit-tests onto the popup that just opened over the trigger
    // (touch fires its compatibility click at the tap position) never did.
    const item = e.target.closest(ITEM);
    if (item) {
      item._templPointerType = e.pointerType;
      item._templAllowMouseSelection = true;
      const content = positionerOf(item);
      if (content && content._templSelection) content._templSelection.dragY = 0;
    }
  });

  document.addEventListener("pointerover", (e) => {
    if (!(e.target instanceof Element)) return;
    const item = e.target.closest(ITEM);
    if (item) item._templPointerType = e.pointerType;
  });

  document.addEventListener("pointercancel", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = e.target.closest(TRIGGER);
    if (!trigger) return;
    trigger._templOpenMethod = null;
    pressedTriggers.delete(trigger);
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = e.target.closest(TRIGGER);
    if (trigger) {
      if (pressedTriggers.has(trigger)) {
        pressedTriggers.delete(trigger);
        return;
      }
      const openMethod = trigger._templOpenMethod || (e.detail === 0 ? "keyboard" : "mouse");
      trigger._templOpenMethod = null;
      if (!trigger.disabled) {
        toggle(trigger, openMethod);
      }
      return;
    }

    const item = e.target.closest(ITEM);
    if (item) {
      const content = positionerOf(item);
      if (!content) return;
      // Virtual clicks (detail 0: keyboard, assistive technology, .click())
      // represent explicit activation and always commit; so do touch clicks,
      // whose press necessarily started on the item.
      const isMouseClick = (item._templPointerType || "mouse") !== "touch";
      const isVirtualClick = e.detail === 0;
      const isInvalidMouseClick =
        isMouseClick && !isVirtualClick && !item._templAllowMouseSelection;
      item._templAllowMouseSelection = false;
      if (item.hasAttribute("data-disabled") || isInvalidMouseClick) return;
      selectItem(content, item);
    }
  });

  // Pendant of SelectItem's mouseup: releasing a press that started on the
  // trigger commits the item under the pointer (press trigger, drag, release
  // to select), once the SELECTED_DELAY / drag guards allow it. Touch never
  // selects on mouseup, only on click.
  document.addEventListener("mouseup", (e) => {
    if (!(e.target instanceof Element)) return;
    const item = e.target.closest(ITEM);
    if (!item) return;
    const content = positionerOf(item);
    const selection = content && content._templSelection;
    if (!selection) return;
    selection.dragY = 0;
    if (item.hasAttribute("data-disabled") || item._templPointerType === "touch") return;
    // Regular clicks are committed by the click event.
    if (item._templAllowMouseSelection) return;
    const selected = item.hasAttribute("data-selected");
    if (
      (!selection.allowSelectedMouseUp && selected) ||
      (!selection.allowUnselectedMouseUp && !selected)
    ) {
      return;
    }
    item._templAllowMouseSelection = true;
    item.click();
    item._templAllowMouseSelection = false;
  });

  document.addEventListener("keydown", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = e.target.closest(TRIGGER);
    if (trigger) {
      pressedTriggers.delete(trigger); // like useClick's onKeyDown reset
      trigger._templOpenMethod = null;
      return;
    }
    // SelectItem is a button: Enter and Space commit the item. A Space that
    // continues a typeahead never gets here, useTypeahead stops it.
    const item = e.target.closest(ITEM);
    if (!item || (e.key !== "Enter" && e.key !== " ")) return;
    const content = positionerOf(item);
    if (!content) return;
    e.preventDefault();
    if (!item.hasAttribute("data-disabled")) selectItem(content, item);
  });

  // SelectItem's onPointerMove, the highlight itself follows the pointer
  // through the list navigation.
  document.addEventListener("pointermove", (e) => {
    if (!(e.target instanceof Element)) return;
    const item = e.target.closest(ITEM);
    if (!item) return;
    // Dragging with the button held re-arms unselected mouseup selection
    // before SELECTED_DELAY has elapsed, once the drag covers >= 8px.
    if (e.pointerType === "mouse" && e.buttons === 1) {
      const content = positionerOf(item);
      if (content && content._templSelection) {
        content._templSelection.dragY += e.movementY;
        if (content._templSelection.dragY ** 2 >= 64) {
          content._templSelection.allowUnselectedMouseUp = true;
        }
      }
    }
  });

  window.addEventListener(
    "scroll",
    (e) => {
      const inMenu = e.target instanceof Element && positionerOf(e.target);
      if (inMenu) {
        if (inMenu._templAligned) {
          handleAlignedScroll(inMenu);
        } else {
          updateScrollArrows(inMenu);
        }
        return;
      }
    },
    true,
  );

})();
