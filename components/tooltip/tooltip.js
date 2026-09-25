(function () {
  const CONTENT = '[data-slot="tooltip-content"]';
  // Base UI's TooltipTrigger identifier; a disabled trigger renders
  // data-trigger-disabled instead, so it never opens.
  const TRIGGER = "[data-base-ui-tooltip-trigger]";

  function allContents() {
    return document.querySelectorAll(CONTENT);
  }

  // shadcn's TooltipPrimitive.Arrow has no slot; Base UI renders it
  // aria-hidden as the popup's last child.
  function arrowOf(content) {
    return content.querySelector(':scope > [aria-hidden="true"]:last-child');
  }

  // Base UI's TooltipPositioner, the popup's parent: it is portaled and
  // positioned and renders the open state.
  function positionerOf(content) {
    return content.parentElement;
  }

  function statusOf(content) {
    return { positioner: positionerOf(content), parts: [content], stateParts: [arrowOf(content)] };
  }

  function contentFor(trigger) {
    return document.getElementById(trigger.getAttribute("aria-describedby"));
  }

  function triggerFor(content) {
    return document.querySelector(
      '[aria-describedby="' + content.id + '"]',
    );
  }

  // Moves the positioner to <body> (shadcn portals it the same way).
  function portal(content) {
    window.templ.portal.render(positionerOf(content));
  }

  // TooltipPositioner: useAnchorPositioning with the popup collision
  // avoidance, while the tooltip is mounted.
  function startAutoPositioning(content, trigger) {
    stopAutoPositioning(content);
    const positioner = positionerOf(content);
    const arrow = arrowOf(content);
    const positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor: trigger,
      positioner,
      parts: [positioner, content, arrow],
      arrow,
      side: positioner.getAttribute("data-templ-side") || "top",
      align: positioner.getAttribute("data-templ-align") || "center",
      sideOffset: parseFloat(positioner.getAttribute("data-templ-side-offset")) || 0,
      alignOffset: parseFloat(positioner.getAttribute("data-templ-align-offset")) || 0,
    });
    content._templPositionCleanup = positioning.cleanup;
    return positioning.positioned;
  }

  function stopAutoPositioning(content) {
    if (!content._templPositionCleanup) return;
    content._templPositionCleanup();
    content._templPositionCleanup = null;
  }

  function open(trigger) {
    // A disabled trigger (Base UI data-trigger-disabled) never opens, e.g.
    // the sidebar's menu tooltips while it is expanded.
    if (trigger.hasAttribute("data-trigger-disabled")) return;
    const content = contentFor(trigger);
    if (!content) return;
    portal(content);
    positionerOf(content).hidden = false;
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: positionerOf(content),
      reference: trigger,
      onOpenChange: (open) => requestOpenChange(trigger, open),
    });

    // Positioned first, then the enter animation plays in place.
    startAutoPositioning(content, trigger).then(() => {
      if (positionerOf(content).hidden) return; // closed meanwhile
      window.templ.transition.open(statusOf(content));
      trigger.setAttribute("data-popup-open", "");
    });
  }

  function close(content) {
    if (positionerOf(content).hidden) return;
    content._templDismiss?.();
    content._templDismiss = null;
    // Positioned until it unmounts, like Base UI.
    window.templ.transition.close(statusOf(content), content, () => {
      stopAutoPositioning(content);
      positionerOf(content).hidden = true;
    });
    const trigger = triggerFor(content);
    if (trigger) trigger.removeAttribute("data-popup-open");
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
    if (!accepted || content.hasAttribute("data-templ-open")) return false;
    if (nextOpen) open(trigger);
    else close(content);
    return true;
  }

  function requestCloseAll() {
    allContents().forEach((content) => requestOpenChange(triggerFor(content), false));
  }

  // ----- events -------------------------------------------------------------

  document.addEventListener("mouseover", (e) => {
    const trigger = e.target.closest(TRIGGER);
    if (trigger) requestOpenChange(trigger, true);
  });

  document.addEventListener("mouseout", (e) => {
    const trigger = e.target.closest(TRIGGER);
    if (!trigger) return;
    if (e.relatedTarget && trigger.contains(e.relatedTarget)) return; // still inside
    const content = contentFor(trigger);
    if (content) requestOpenChange(trigger, false);
  });

  // Keyboard: show on focus, hide on blur. Like Base UI, only visible
  // focus opens the tooltip, so programmatic focus (e.g. a dialog's
  // autofocus) does not pop it.
  document.addEventListener("focusin", (e) => {
    const trigger = e.target.closest(TRIGGER);
    if (trigger && trigger.matches(":focus-visible")) requestOpenChange(trigger, true);
  });

  document.addEventListener("focusout", (e) => {
    const trigger = e.target.closest(TRIGGER);
    if (!trigger) return;
    const content = contentFor(trigger);
    if (content) requestOpenChange(trigger, false);
  });


  // Content stays in its hidden portal node until it opens. It unmounts with
  // its portal owner: a portaled one is removed from <body> then.
  window.templ.lifecycle.register(CONTENT, {
    init(content) {
      // Server-side open state (Base UI open or defaultOpen).
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        const trigger = triggerFor(content);
        if (trigger) open(trigger);
      }
    },
    destroy(content) {
      stopAutoPositioning(content);
      content._templDismiss?.();
      const positioner = positionerOf(content);
      if (positioner?.isConnected) positioner.remove();
    },
  });
})();
