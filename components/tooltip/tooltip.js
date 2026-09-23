// Uses window.FloatingUIDOM from components/floatingui (loaded in the same bundle).
(function () {
  // Exit animations run at the tw-animate default (150ms); hide after.
  const EXIT_MS = 170;

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
      : [event.currentTarget.hasAttribute("data-tui-tooltip-content")
        ? event.currentTarget
        : contentFor(event.currentTarget)];
    let handled = false;
    for (const content of contents) {
      if (!content?.hasAttribute("data-open")) continue;
      if (requestOpenChange(triggerFor(content), false)) event.preventDefault();
      event.stopPropagation();
      handled = true;
    }
    return handled;
  }

  function allContents() {
    return document.querySelectorAll("[data-tui-tooltip-content]");
  }

  function contentFor(trigger) {
    return document.getElementById(trigger.getAttribute("aria-describedby"));
  }

  function triggerFor(content) {
    return document.querySelector(
      '[data-tui-tooltip-trigger][aria-describedby="' + content.id + '"]',
    );
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

  // The arrow styles itself per side (data-side classes, like Base UI's
  // Arrow); the script only feeds it the side and the centered coordinate.
  function placeArrow(content, side, arrowData) {
    const arrowEl = content.querySelector("[data-tui-tooltip-arrow]");
    if (!arrowEl) return;
    arrowEl.setAttribute("data-side", side);
    arrowEl.style.left = arrowData && arrowData.x != null ? arrowData.x + "px" : "";
    arrowEl.style.top = arrowData && arrowData.y != null ? arrowData.y + "px" : "";
  }

  // Moves the content to <body> (shadcn portals it the same way).
  // The unmount half of the React portal pendant: a portaled content lives
  // as long as its SSR declaration site (_tuiPortalOwner) stays in the
  // document. Trigger-presence heuristics judged mid-swap moments wrongly -
  // multi-phase swap layers briefly disconnect the new triggers.
  function removeOrphanedContents(content) {
    document.querySelectorAll("body > [data-tui-tooltip-content]").forEach((c) => {
      if (c !== content && c._tuiPortalOwner && !c._tuiPortalOwner.isConnected) {
        stopAutoPositioning(c);
        c.remove();
      }
    });
  }

  function portal(content) {
    listenForEscape(content);
    removeOrphanedContents(content);
    if (content.parentElement !== document.body) {
      if (!content._tuiPortalOwner) content._tuiPortalOwner = content.parentElement;
      document.body.appendChild(content);
    }
  }

  function positionContent(content, trigger) {
    const { computePosition, offset, flip, shift, arrow } = window.FloatingUIDOM;
    const side = content.getAttribute("data-tui-tooltip-side") || "top";
    const sideOffset =
      parseInt(content.getAttribute("data-tui-tooltip-side-offset"), 10) || 4;
    const arrowEl = content.querySelector("[data-tui-tooltip-arrow]");

    return computePosition(trigger, content, {
      placement: side,
      strategy: "absolute",
      middleware: [
        offset(sideOffset),
        flip(),
        shift({ padding: 5 }),
        arrowEl ? arrow({ element: arrowEl, padding: 5 }) : undefined,
      ].filter(Boolean),
    }).then((result) => {
      content.style.transition = "none";
      content.style.left = result.x + "px";
      content.style.top = result.y + "px";
      content.style.setProperty(
        "--transform-origin",
        anchorOrigin(
          result,
          trigger.getBoundingClientRect(),
          content.getBoundingClientRect(),
          sideOffset,
        ),
      );
      const finalSide = result.placement.split("-")[0];
      content.setAttribute("data-side", finalSide);
      placeArrow(content, finalSide, result.middlewareData.arrow);
      content.offsetHeight; // flush styles before re-enabling transitions
      content.style.transition = "";
    });
  }

  function startAutoPositioning(content, trigger) {
    if (content._tuiPositionCleanup) content._tuiPositionCleanup();
    let resolveFirst;
    const firstPosition = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const update = () => positionContent(content, trigger).then(resolveFirst, resolveFirst);
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

  function open(trigger) {
    // Consumers can suppress a tooltip situationally (e.g. the sidebar only
    // shows menu tooltips while collapsed to icons).
    if (trigger.hasAttribute("data-tui-tooltip-disabled")) return;
    const content = contentFor(trigger);
    if (!content) return;
    clearTimeout(content._tuiHide);
    portal(content);
    // z-index portal like shadcn (no native top layer); re-append
    // keeps paint order = open order.
    document.body.appendChild(content);
    content.hidden = false;

    // Position it invisibly first, then play the enter animation in place.
    content.style.visibility = "hidden";
    startAutoPositioning(content, trigger).then(() => {
      if (content.hidden) return; // closed meanwhile
      // duration-100 transitions `all`; a visibility transition would
      // freeze at hidden in background tabs - flip suppressed.
      content.style.transitionProperty = "none";
      content.style.visibility = "";
      void content.offsetWidth;
      content.style.transitionProperty = "";
      content.removeAttribute("data-closed");
      content.removeAttribute("data-ending-style");
      content.setAttribute("data-open", "");
      content.setAttribute("data-starting-style", "");
      const arrowEl = content.querySelector("[data-tui-tooltip-arrow]");
      if (arrowEl) {
        arrowEl.removeAttribute("data-closed");
        arrowEl.removeAttribute("data-ending-style");
        arrowEl.setAttribute("data-open", "");
        arrowEl.setAttribute("data-starting-style", "");
      }
      trigger.setAttribute("data-popup-open", "");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          content.removeAttribute("data-starting-style");
          if (arrowEl) arrowEl.removeAttribute("data-starting-style");
        });
      });
    });
  }

  function close(content) {
    if (content.hidden) return;
    stopAutoPositioning(content);
    content.removeAttribute("data-open");
    content.removeAttribute("data-starting-style");
    content.setAttribute("data-closed", "");
    content.setAttribute("data-ending-style", "");
    const arrowEl = content.querySelector("[data-tui-tooltip-arrow]");
    if (arrowEl) {
      arrowEl.removeAttribute("data-open");
      arrowEl.removeAttribute("data-starting-style");
      arrowEl.setAttribute("data-closed", "");
      arrowEl.setAttribute("data-ending-style", "");
    }
    const trigger = triggerFor(content);
    if (trigger) trigger.removeAttribute("data-popup-open");
    clearTimeout(content._tuiHide);
    content._tuiHide = setTimeout(() => {
      if (content.hasAttribute("data-closed") && !content.hidden) {
        content.hidden = true;
        content.removeAttribute("data-ending-style");
        if (arrowEl) arrowEl.removeAttribute("data-ending-style");
      }
    }, EXIT_MS);
  }

  function closeAll() {
    allContents().forEach(close);
  }

  function requestOpenChange(trigger, nextOpen) {
    if (!trigger) return false;
    const content = contentFor(trigger);
    if (!content || content.hasAttribute("data-open") === nextOpen) return false;
    const accepted = content.dispatchEvent(
      new CustomEvent("tooltip-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: nextOpen },
      }),
    );
    if (!accepted || content.hasAttribute("data-tui-tooltip-controlled")) return false;
    if (nextOpen) open(trigger);
    else close(content);
    return true;
  }

  function requestCloseAll() {
    allContents().forEach((content) => requestOpenChange(triggerFor(content), false));
  }

  // ----- events -------------------------------------------------------------

  document.addEventListener("mouseover", (e) => {
    const trigger = e.target.closest("[data-tui-tooltip-trigger]");
    if (trigger) requestOpenChange(trigger, true);
  });

  document.addEventListener("mouseout", (e) => {
    const trigger = e.target.closest("[data-tui-tooltip-trigger]");
    if (!trigger) return;
    if (e.relatedTarget && trigger.contains(e.relatedTarget)) return; // still inside
    const content = contentFor(trigger);
    if (content) requestOpenChange(trigger, false);
  });

  // Keyboard: show on focus, hide on blur. Like Base UI, only visible
  // focus opens the tooltip, so programmatic focus (e.g. a dialog's
  // autofocus) does not pop it.
  document.addEventListener("focusin", (e) => {
    const trigger = e.target.closest("[data-tui-tooltip-trigger]");
    if (trigger && trigger.matches(":focus-visible")) requestOpenChange(trigger, true);
  });

  document.addEventListener("focusout", (e) => {
    const trigger = e.target.closest("[data-tui-tooltip-trigger]");
    if (!trigger) return;
    const content = contentFor(trigger);
    if (content) requestOpenChange(trigger, false);
  });

  document.addEventListener("keydown", closeOnEscapeKeyDown);

  // Content stays in its hidden portal node until it opens.
  function init() {
    removeOrphanedContents();
    document.querySelectorAll("[data-tui-tooltip-trigger]").forEach(listenForEscape);
    allContents().forEach((content) => {
      if (content.getAttribute("data-tui-tooltip-initial-open") === "true") {
        content.removeAttribute("data-tui-tooltip-initial-open");
        const trigger = triggerFor(content);
        if (trigger) open(trigger);
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

})();
