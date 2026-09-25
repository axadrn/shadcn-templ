// Uses window.FloatingUIDOM from components/floatingui (loaded in the same bundle).
(function () {
  // Constants from Base UI's popover, shadcn's reference implementation.
  const EXIT_MS = 120; // exit animation (duration-100) + slack
  const COLLISION_PADDING = 5;

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

  function setSide(content, side) {
    content.setAttribute("data-side", side);
    const popup = popupFor(content);
    if (popup) popup.setAttribute("data-side", side);
  }

  // Base UI zooms the popup out of the anchor's center point, not out of a
  // placement corner.
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

  function position(content) {
    const trigger = triggerFor(content);
    if (!trigger) return Promise.resolve();
    const { computePosition, offset, flip, shift } = window.FloatingUIDOM;
    const side = content.getAttribute("data-templ-side") || "bottom";
    const align = content.getAttribute("data-templ-align") || "center";
    const sideOffset = parseFloat(content.getAttribute("data-templ-side-offset")) || 0;
    const alignOffset = parseFloat(content.getAttribute("data-templ-align-offset")) || 0;
    const placement = align === "center" ? side : side + "-" + align;

    return computePosition(trigger, content, {
      placement: placement,
      strategy: "absolute",
      middleware: [
        offset({ mainAxis: sideOffset, crossAxis: alignOffset }),
        flip({ padding: COLLISION_PADDING }),
        shift({ padding: COLLISION_PADDING }),
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

  function startAutoPositioning(content) {
    const trigger = triggerFor(content);
    if (!trigger) return Promise.resolve();
    if (content._templPositionCleanup) content._templPositionCleanup();
    let resolveFirst;
    const firstPosition = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const update = () => position(content).then(resolveFirst, resolveFirst);
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
    clearTimeout(content._templHide);
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
      if (content.hidden) return;
      setState(content, "open");
      startTransition(content);
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
    stopAutoPositioning(content);
    if (returnFocus !== false && content.contains(document.activeElement)) {
      const focusTrigger = triggerFor(content);
      if (focusTrigger) focusTrigger.focus({ preventScroll: true });
    }
    content.style.visibility = "";
    setTransitionAttribute(content, "data-starting-style", false);
    setState(content, "closed");
    setTransitionAttribute(content, "data-ending-style", true);
    const trigger = triggerFor(content);
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("data-popup-open");
      trigger.removeAttribute("data-pressed");
    }
    clearTimeout(content._templHide);
    content._templHide = setTimeout(() => {
      if (content.hasAttribute("data-closed") && !content.hidden) {
        content.hidden = true;
        setTransitionAttribute(content, "data-ending-style", false);
      }
    }, EXIT_MS);
  }

  function closeAll(returnFocus) {
    allContents().forEach((content) => close(content, returnFocus));
  }

  function requestCloseAll(returnFocus) {
    allContents().forEach((content) => requestOpenChange(content, false, returnFocus));
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
        const content = contentFor(trigger);
        if (content) toggle(content);
      }
    }
  });

  document.addEventListener("keydown", closeOnEscapeKeyDown);


  // Content stays in its hidden portal node until it opens.
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
        open(content);
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
