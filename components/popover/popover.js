// Uses window.FloatingUIDOM from components/floatingui (loaded in the same bundle).
(function () {
  // Constants from Base UI's popover, shadcn's reference implementation.
  const EXIT_MS = 120; // exit animation (duration-100) + slack
  const COLLISION_PADDING = 5;

  function allContents() {
    return document.querySelectorAll("[data-tui-popover-content]");
  }

  function triggerFor(content) {
    return document.querySelector(
      '[data-tui-popover-trigger][aria-controls="' + content.id + '"]',
    );
  }

  function contentFor(trigger) {
    return document.getElementById(trigger.getAttribute("aria-controls"));
  }

  // Port of floating-ui-react's enqueueFocus, called the way
  // FloatingFocusManager calls it: focus the element once the popup is up,
  // with a guard so one that closed meanwhile does not pull focus back.
  //
  // The reference queues a single animation frame and that is enough, because
  // it focuses from a React effect — already a task later than the handler
  // that opened the popup. We have no effect to hide behind, and Safari
  // refuses focus() for a short and *variable* window after it activates a
  // button or shows a popover, so one shot is a race: microtask+frame and
  // task+frame both land inside the window often enough to strand focus on
  // the trigger and leave the arrow keys dead. Retrying across a few frames
  // and stopping the moment it takes is immune to how long the window is.
  // Chromium succeeds on the first attempt.
  function enqueueFocus(el, shouldFocus, frames = 8) {
    if (!el) return;
    const attempt = (left) => {
      if (shouldFocus && !shouldFocus()) return;
      if (document.activeElement === el) return;
      el.focus({ preventScroll: true });
      if (document.activeElement !== el && left > 0) {
        requestAnimationFrame(() => attempt(left - 1));
      }
    };
    requestAnimationFrame(() => attempt(frames));
  }

  function popupFor(content) {
    return content.querySelector("[data-tui-popover-popup]");
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
  function anchorOrigin(result, anchorRect, sideOffset) {
    const side = result.placement.split("-")[0];
    const centerX = anchorRect.left + anchorRect.width / 2 - result.x + "px";
    const centerY = anchorRect.top + anchorRect.height / 2 - result.y + "px";
    if (side === "bottom") return centerX + " " + -sideOffset + "px";
    if (side === "top") return centerX + " calc(100% + " + sideOffset + "px)";
    if (side === "right") return -sideOffset + "px " + centerY;
    return "calc(100% + " + sideOffset + "px) " + centerY;
  }

  // Moves the content to <body> (shadcn portals it the same way).
  // The unmount half of the React portal pendant: a portaled content lives
  // as long as its SSR declaration site (_tuiPortalOwner) stays in the
  // document. Trigger-presence heuristics judged mid-swap moments wrongly -
  // multi-phase swap layers briefly disconnect the new triggers.
  function portal(content) {
    document.querySelectorAll("body > [data-tui-popover-content]").forEach((c) => {
      if (c !== content && c._tuiPortalOwner && !c._tuiPortalOwner.isConnected) {
        stopAutoPositioning(c);
        c.remove();
      }
    });
    if (content.parentElement !== document.body) {
      if (!content._tuiPortalOwner) content._tuiPortalOwner = content.parentElement;
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
    const side = content.getAttribute("data-tui-popover-side") || "bottom";
    const align = content.getAttribute("data-tui-popover-align") || "center";
    const sideOffset = parseFloat(content.getAttribute("data-tui-popover-side-offset")) || 0;
    const alignOffset = parseFloat(content.getAttribute("data-tui-popover-align-offset")) || 0;
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
          anchorOrigin(result, trigger.getBoundingClientRect(), sideOffset),
        );
      }
    });
  }

  function startAutoPositioning(content) {
    const trigger = triggerFor(content);
    if (!trigger) return Promise.resolve();
    if (content._tuiPositionCleanup) content._tuiPositionCleanup();
    let resolveFirst;
    const firstPosition = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const update = () => position(content).then(resolveFirst, resolveFirst);
    content._tuiPositionCleanup = window.FloatingUIDOM.autoUpdate(trigger, content, update, {
      elementResize: typeof ResizeObserver !== "undefined",
      layoutShift: typeof IntersectionObserver !== "undefined",
    });
    return firstPosition;
  }

  function stopAutoPositioning(content) {
    if (!content._tuiPositionCleanup) return;
    content._tuiPositionCleanup();
    content._tuiPositionCleanup = null;
  }

  function isOpen(content) {
    return content.hasAttribute("data-open");
  }

  function requestOpenChange(content, nextOpen, returnFocus) {
    if (!content || isOpen(content) === nextOpen) return;
    const accepted = content.dispatchEvent(
      new CustomEvent("popover-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: nextOpen },
      }),
    );
    if (!accepted || content.hasAttribute("data-tui-popover-controlled")) return;
    if (nextOpen) open(content);
    else close(content, returnFocus);
  }

  function open(content) {
    if (typeof content === "string") content = document.getElementById(content);
    if (!content || isOpen(content)) return;
    allContents().forEach((c) => {
      if (c !== content) close(c);
    });
    clearTimeout(content._tuiHide);
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
      content.style.transitionProperty = "none";
      content.style.visibility = "";
      void content.offsetWidth;
      content.style.transitionProperty = "";
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
      const popup = popupFor(content);
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
    clearTimeout(content._tuiHide);
    content._tuiHide = setTimeout(() => {
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
    const content =
      element.closest?.("[data-tui-popover-content]") ||
      (element.closest?.("[data-tui-popover-trigger]") &&
        contentFor(element.closest("[data-tui-popover-trigger]"))) ||
      element.querySelector?.("[data-tui-popover-content]");
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
    const trigger = e.target.closest("[data-tui-popover-trigger]");
    if (trigger) {
      if (trigger.disabled) return;
      const content = contentFor(trigger);
      if (content) toggle(content);
      return;
    }
    if (!e.target.closest("[data-tui-popover-content]")) requestCloseAll(false);
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = e.target.closest("[data-tui-popover-trigger]");
    if (trigger) {
      // Keyboard activation only (Enter/Space fire a detail-0 click without
      // a preceding pointerdown); pointer presses are handled on pointerdown.
      if (e.detail === 0 && !trigger.disabled) {
        const content = contentFor(trigger);
        if (content) toggle(content);
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") requestCloseAll();
  });


  // Portal all contents up front (React portals on mount too): popovers must
  // not sit inside layout groups where hidden siblings break :last-child
  // rules. Runs on load and whenever new popovers appear in the DOM.
  // Lift SSR'd contents out of their inert <template> wrappers into <body>,
  // replacing a stale portaled copy on re-swaps (e.g. htmx).
  function liftTemplates() {
    document.querySelectorAll("template[data-tui-popover-portal]").forEach((tpl) => {
      const content = tpl.content.querySelector("[data-tui-popover-content]");
      if (content) {
        const stale = document.getElementById(content.id);
        if (stale) {
          stopAutoPositioning(stale);
          stale.remove();
        }
        content._tuiPortalOwner = tpl.parentElement;
        document.body.appendChild(content);
      }
      tpl.remove();
    });
  }

  function init() {
    liftTemplates();
    allContents().forEach((content) => {
      if (!triggerFor(content)) return;
      portal(content);
      if (content.getAttribute("data-tui-popover-initial-open") === "true") {
        content.removeAttribute("data-tui-popover-initial-open");
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
  // lifts and wires itself, removals release portaled content through the
  // ownership sweep.
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });

  window.tui = window.tui || {};
  window.tui.popover = {
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
