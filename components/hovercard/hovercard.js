// Uses window.FloatingUIDOM from components/floatingui (loaded in the same bundle).
(function () {
  // Exit animations run for 100ms (duration-100); hide shortly after.
  const EXIT_MS = 120;

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
      : [event.currentTarget.matches(CONTENT)
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

  const CONTENT = '[data-slot="hover-card-content"]';
  // Base UI links PreviewCard.Trigger to its card through context only; the
  // port marker carries the card id.
  const TRIGGER = "[data-templ-hover-card-trigger]";

  function allContents() {
    return document.querySelectorAll(CONTENT);
  }

  function contentFor(trigger) {
    return document.getElementById(trigger.getAttribute("data-templ-hover-card-trigger"));
  }

  function triggerFor(content) {
    return document.querySelector(
      '[data-templ-hover-card-trigger="' + content.id + '"]',
    );
  }

  function setOpenState(content, open) {
    content.toggleAttribute("data-open", open);
    content.toggleAttribute("data-closed", !open);
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
    document.querySelectorAll("body > " + CONTENT).forEach((c) => {
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
  }

  function positionContent(content, trigger) {
    const { computePosition, offset, flip, shift } = window.FloatingUIDOM;
    const side = content.getAttribute("data-templ-side") || "bottom";
    const align = content.getAttribute("data-templ-align") || "center";
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
        flip(),
        shift({ padding: 5 }),
      ],
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
      content.setAttribute("data-side", result.placement.split("-")[0]);
      content.offsetHeight; // flush styles before re-enabling transitions
      content.style.transition = "";
    });
  }

  function startAutoPositioning(content, trigger) {
    if (content._templPositionCleanup) content._templPositionCleanup();
    let resolveFirst;
    const firstPosition = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const update = () => positionContent(content, trigger).then(resolveFirst, resolveFirst);
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

  function open(content, trigger) {
    clearTimeout(content._templHide);
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
      setOpenState(content, true);
    });
  }

  function close(content) {
    if (content.hidden) return;
    stopAutoPositioning(content);
    setOpenState(content, false);
    clearTimeout(content._templHide);
    content._templHide = setTimeout(() => {
      if (content.hasAttribute("data-closed") && !content.hidden) {
        content.hidden = true;
      }
    }, EXIT_MS);
  }

  function requestOpenChange(content, nextOpen) {
  const trigger = triggerFor(content);
  const change = new CustomEvent("hovercard-open-change", {
    bubbles: true,
    cancelable: true,
    detail: { open: nextOpen },
  });
  const accepted = (trigger || content).dispatchEvent(change);
  if (!accepted || content.hasAttribute("data-templ-open")) return false;
  if (nextOpen && trigger) open(content, trigger);
  else if (!nextOpen) close(content);
  return true;
  }

  // Hover intent: entering trigger or card keeps it open; leaving both
  // schedules the close after the card's close delay.
  function scheduleOpen(content, trigger) {
    clearTimeout(content._templClose);
    content._templClose = null;
    if (content.hasAttribute("data-open") || content._templOpen) return;
    // delay is a PreviewCard.Trigger prop, so it lives on the trigger.
    const delay = parseInt(trigger.getAttribute("data-templ-delay"), 10) || 600;
    content._templOpen = setTimeout(() => {
      content._templOpen = null;
    requestOpenChange(content, true);
    }, delay);
  }

  function scheduleClose(content) {
    clearTimeout(content._templOpen);
    content._templOpen = null;
    if (!content.hasAttribute("data-open") || content._templClose) return;
    const trigger = triggerFor(content);
    const delay = parseInt(trigger && trigger.getAttribute("data-templ-close-delay"), 10) || 300;
    content._templClose = setTimeout(() => {
      content._templClose = null;
    requestOpenChange(content, false);
    }, delay);
  }

  document.addEventListener("mouseover", (e) => {
    const trigger = e.target.closest(TRIGGER);
    if (trigger) {
      const content = contentFor(trigger);
      if (content) scheduleOpen(content, trigger);
      return;
    }
    const content = e.target.closest(CONTENT);
    if (content) {
      clearTimeout(content._templClose);
      content._templClose = null;
    }
  });

  document.addEventListener("mouseout", (e) => {
    const from = e.target.closest(TRIGGER + ", " + CONTENT);
    if (!from) return;
    const content = from.matches(CONTENT)
      ? from
      : contentFor(from);
    if (!content) return;
    if (e.relatedTarget) {
      const to = e.relatedTarget.closest(TRIGGER + ", " + CONTENT);
      // Only moving between THIS card's trigger and popup keeps it open;
      // landing on another instance must still close this one.
      if (to) {
        const toContent = to.matches(CONTENT)
          ? to
          : contentFor(to);
        if (toContent === content) return;
      }
    }
    scheduleClose(content);
  });

  document.addEventListener("keydown", closeOnEscapeKeyDown);

  function init() {
    removeOrphanedContents();
    document.querySelectorAll(TRIGGER).forEach(listenForEscape);
    allContents().forEach((content) => {
      // Server-side open state (Base UI open or defaultOpen), once per element.
      if (content._templInit) return;
      content._templInit = true;
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        const trigger = triggerFor(content);
        if (trigger) open(content, trigger);
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
