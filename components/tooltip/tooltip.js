(function () {
  const CONTENT = '[data-slot="tooltip-content"]';
  // Base UI's TooltipTrigger identifier; a disabled trigger renders
  // data-trigger-disabled instead, so it never opens.
  const TRIGGER = "[data-base-ui-tooltip-trigger]";

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

  // The positioner's parent is the portal node, which moves to <body>
  // (shadcn portals it the same way).
  function portalNodeOf(content) {
    return positionerOf(content).parentElement;
  }

  function portal(content) {
    window.templ.portal.render(portalNodeOf(content));
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

  // details { reason, event } of the change, for the hover interaction.
  function open(trigger, details = {}) {
    // A disabled trigger (Base UI data-trigger-disabled) never opens, e.g.
    // the sidebar's menu tooltips while it is expanded.
    if (trigger.hasAttribute("data-trigger-disabled")) return;
    const content = contentFor(trigger);
    if (!content) return;
    content._templOpen = true;
    content._templOpenEventType = details.event?.type ?? null;
    portal(content);
    positionerOf(content).hidden = false;
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: positionerOf(content),
      reference: trigger,
      onOpenChange: (open, reason, event) => requestOpenChange(trigger, open, { reason, event }),
    });
    content._templHover?.openChange(true, details.reason);

    // Positioned first, then the enter animation plays in place.
    startAutoPositioning(content, trigger).then(() => {
      if (positionerOf(content).hidden) return; // closed meanwhile
      window.templ.transition.open(statusOf(content));
      trigger.setAttribute("data-popup-open", "");
    });
  }

  function close(content, details = {}) {
    if (positionerOf(content).hidden) return;
    content._templOpen = false;
    content._templOpenEventType = null;
    content._templHover?.openChange(false, details.reason);
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

  function requestOpenChange(trigger, nextOpen, details) {
    if (!trigger) return false;
    const content = contentFor(trigger);
    if (!content || !!content._templOpen === nextOpen) return false;
    const accepted = content.dispatchEvent(
      new CustomEvent("tooltip-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: nextOpen },
      }),
    );
    if (!accepted || content.hasAttribute("data-templ-open")) return false;
    if (nextOpen) open(trigger, details);
    else close(content, details);
    return true;
  }

  // TooltipTrigger's useHoverReferenceInteraction and TooltipPopup's
  // useHoverFloatingInteraction. The delay is shadcn's TooltipProvider
  // default of 0, the popup is hoverable through safePolygon.
  function startHover(content, trigger) {
    const hover = window.templ.hover;
    const positioner = positionerOf(content);
    content._templHover = hover.createHoverInteraction({
      isOpen: () => !!content._templOpen,
      onOpenChange: (open, reason, event) => requestOpenChange(trigger, open, { reason, event }),
      openEventType: () => content._templOpenEventType ?? null,
      domReference: () => trigger,
      floating: () => (positioner.hidden ? null : positioner),
      placement: () => positioner.getAttribute("data-side") || "top",
      triggers: () => [trigger],
      parentFloating: () => null,
    });
    const isClosing = () => window.templ.transition.isEnding(content);
    content._templHoverCleanups = [
      hover.useHoverReferenceInteraction(trigger, content._templHover, {
        mouseOnly: true,
        move: false,
        handleClose: hover.safePolygon(),
        restMs: 0,
        delay: { close: 0 },
        isClosing,
      }),
      hover.useHoverFloatingInteraction(content._templHover, { closeDelay: 0 }),
    ];
  }

  function stopHover(content) {
    content._templHoverCleanups?.forEach((cleanup) => cleanup());
    content._templHoverCleanups = null;
    content._templHover?.dispose();
    content._templHover = null;
  }

  // ----- events -------------------------------------------------------------

  // Keyboard: show on focus, hide on blur. Like Base UI, only visible
  // focus opens the tooltip, so programmatic focus (e.g. a dialog's
  // autofocus) does not pop it.
  document.addEventListener("focusin", (e) => {
    const trigger = e.target.closest(TRIGGER);
    if (trigger && trigger.matches(":focus-visible")) requestOpenChange(trigger, true, { reason: "trigger-focus", event: e });
  });

  document.addEventListener("focusout", (e) => {
    const trigger = e.target.closest(TRIGGER);
    if (!trigger) return;
    const content = contentFor(trigger);
    if (content) requestOpenChange(trigger, false, { reason: "trigger-focus", event: e });
  });


  // Content stays in its hidden portal node until it opens. It unmounts with
  // its portal owner: a portaled one is removed from <body> then.
  window.templ.lifecycle.register(CONTENT, {
    init(content) {
      const trigger = triggerFor(content);
      if (!trigger) return;
      startHover(content, trigger);
      // Server-side open state (Base UI open or defaultOpen).
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        open(trigger);
      }
    },
    destroy(content) {
      stopHover(content);
      stopAutoPositioning(content);
      content._templDismiss?.();
      window.templ.portal.remove(portalNodeOf(content));
    },
  });
})();
