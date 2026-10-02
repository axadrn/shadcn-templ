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
    return document.getElementById(trigger.getAttribute("data-templ-tooltip-trigger"));
  }

  function triggerFor(content) {
    return document.querySelector(
      '[data-templ-tooltip-trigger="' + content.id + '"]',
    );
  }

  // The positioner's parent is the portal node, which moves to <body>
  // (shadcn portals it the same way).
  function portalNodeOf(content) {
    return positionerOf(content).parentElement;
  }

  // TooltipPortal mounts with the popup.
  function portal(content) {
    const node = portalNodeOf(content);
    window.templ.portal.render(node);
    node.hidden = false;
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

  // ----- TooltipProvider -----------------------------------------------------

  // shadcn's layout wraps the page in TooltipProvider (delay 0), Base UI's
  // FloatingDelayGroup with its 400 ms timeout: a tooltip that opens while
  // another one is open, or within the timeout after it closed, opens in the
  // instant phase, and the other closes at once.
  const GROUP_TIMEOUT = 400;
  const group = { current: null, timer: null };

  // TooltipRoot's instantType: "delay" in the instant phase, or while closing
  // because another tooltip opened; else the open change's, "focus" for a
  // focus open, "dismiss" for a press or Escape, none for hover. Positioner,
  // popup and arrow render it as data-instant.
  function setInstantType(content, open, reason) {
    if (open && reason === "trigger-focus") content._templInstantType = "focus";
    else if (!open && (reason === "trigger-press" || reason === "escape-key")) content._templInstantType = "dismiss";
    else if (reason === "trigger-hover") content._templInstantType = undefined;
    content._templCloseReason = open ? null : reason ?? null;
    renderInstant(content);
  }

  function renderInstant(content) {
    const delay = content._templEnding ? content._templCloseReason === "none" : !!content._templInstantPhase;
    const type = delay ? "delay" : content._templInstantType;
    [positionerOf(content), content, arrowOf(content)].forEach((el) => {
      if (!el) return;
      if (type) el.setAttribute("data-instant", type);
      else el.removeAttribute("data-instant");
    });
  }

  function setInstantPhase(content, on) {
    content._templInstantPhase = on;
    renderInstant(content);
  }

  // The group's open side: this tooltip becomes the current one.
  function joinGroup(content) {
    clearTimeout(group.timer);
    const previous = group.current;
    group.current = content;
    if (previous && previous !== content) {
      setInstantPhase(content, true);
      setInstantPhase(previous, true);
      requestOpenChange(triggerFor(previous), false, { reason: "none" });
    } else {
      setInstantPhase(content, false);
    }
  }

  // The group's close side: the current tooltip ends the instant phase after
  // the timeout, unless another one opened meanwhile.
  function leaveGroup(content) {
    if (group.current !== content) return;
    setInstantPhase(content, false);
    clearTimeout(group.timer);
    group.timer = setTimeout(() => {
      if (group.current !== content || content._templOpen) return;
      group.current = null;
    }, GROUP_TIMEOUT);
  }

  // ----- open / close ----------------------------------------------------------

  // details { reason, event } of the change, for the hover interaction.
  function open(trigger, details = {}) {
    // A disabled trigger (Base UI data-trigger-disabled) never opens, e.g.
    // the sidebar's menu tooltips while it is expanded.
    if (trigger.hasAttribute("data-trigger-disabled")) return;
    const content = contentFor(trigger);
    if (!content) return;
    content._templOpen = true;
    content._templOpenEventType = details.event?.type ?? null;
    content._templEnding = false;
    setInstantType(content, true, details.reason);
    joinGroup(content);
    portal(content);
    positionerOf(content).hidden = false;
    // TooltipRoot's useDismiss: a press on the trigger closes (closeOnClick).
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: positionerOf(content),
      reference: trigger,
      referencePress: true,
      onOpenChange: (open, reason, event) => requestOpenChange(trigger, open, { reason, event }),
    });
    emitOpenChange(content, true, details.reason);

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
    content._templEnding = true;
    setInstantType(content, false, details.reason);
    leaveGroup(content);
    emitOpenChange(content, false, details.reason);
    content._templDismiss?.();
    content._templDismiss = null;
    // Positioned until it unmounts, like Base UI.
    window.templ.transition.close(statusOf(content), content, () => {
      stopAutoPositioning(content);
      positionerOf(content).hidden = true;
      portalNodeOf(content).hidden = true;
      content._templEnding = false;
      content._templInstantPhase = false;
      renderInstant(content);
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
    // TooltipTrigger's useFocus.
    content._templFocusOpen = window.templ.focus.useFocus(trigger, content._templHover.context);
    // TooltipTrigger's onPointerDown and onClick: with closeOnClick a press
    // cancels a pending open (cancelPendingOpen).
    const cancelPendingOpen = () => {
      if (!content._templOpen) emitOpenChange(content, false, "trigger-press");
    };
    trigger.addEventListener("pointerdown", cancelPendingOpen);
    trigger.addEventListener("click", cancelPendingOpen);
    content._templHoverCleanups.push(() => {
      trigger.removeEventListener("pointerdown", cancelPendingOpen);
      trigger.removeEventListener("click", cancelPendingOpen);
    });
  }

  // The store's openchange event, for the trigger's interactions.
  function emitOpenChange(content, open, reason) {
    content._templHover?.openChange(open, reason);
    content._templFocusOpen?.openChange(open, reason);
  }

  function stopHover(content) {
    content._templFocusOpen?.cleanup();
    content._templFocusOpen = null;
    content._templHoverCleanups?.forEach((cleanup) => cleanup());
    content._templHoverCleanups = null;
    content._templHover?.dispose();
    content._templHover = null;
  }

  // ----- events -------------------------------------------------------------

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
