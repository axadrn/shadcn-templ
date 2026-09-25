(function () {
  "use strict";

  const PANEL = '[data-slot="collapsible-content"]';

  function panelFor(trigger) {
    return document.getElementById(trigger.getAttribute("aria-controls") || "");
  }

  // A trigger merged onto another component keeps that component's slot
  // (Base UI render prop), so the trigger is whatever controls a panel.
  function triggerOf(target) {
    const trigger = target.closest("[aria-controls]");
    const panel = trigger && panelFor(trigger);
    return panel && panel.matches(PANEL) ? trigger : null;
  }

  function setOpen(el, isOpen) {
    el.toggleAttribute("data-open", isOpen);
    el.toggleAttribute("data-closed", !isOpen);
  }

  // Exposes the measured panel height, like Base UI's
  // --collapsible-panel-height, so consumers can animate it.
  function measure(panel) {
    panel.style.setProperty("--collapsible-panel-height", panel.scrollHeight + "px");
    panel.style.setProperty("--collapsible-panel-width", panel.scrollWidth + "px");
  }

  function finishClose(panel) {
    if (!panel.hasAttribute("data-ending-style")) return;
    panel.hidden = true;
    panel.removeAttribute("data-ending-style");
  }

  function timeMs(value) {
    value = value.trim();
    if (value.endsWith("ms")) return parseFloat(value) || 0;
    if (value.endsWith("s")) return (parseFloat(value) || 0) * 1000;
    return 0;
  }

  function motionMs(panel) {
    const style = getComputedStyle(panel);
    const totals = (durations, delays) => {
      const ds = durations.split(",");
      const ls = delays.split(",");
      return ds.map((duration, i) => timeMs(duration) + timeMs(ls[i % ls.length] || "0s"));
    };
    return Math.max(
      0,
      ...totals(style.transitionDuration, style.transitionDelay),
      ...totals(style.animationDuration, style.animationDelay),
    );
  }

  function toggle(trigger) {
    const panel = panelFor(trigger);
    if (!panel) return;
    const root = panel.closest('[data-slot="collapsible"]');
    if (!root || root.hasAttribute("data-disabled")) return;
    const isOpen = !panel.hasAttribute("data-open");
  const accepted = root.dispatchEvent(
    new CustomEvent("collapsible-open-change", {
      bubbles: true,
      cancelable: true,
      detail: { open: isOpen },
    }),
  );
  if (!accepted || root.hasAttribute("data-templ-open")) return;

    setOpen(root, isOpen);
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    trigger.toggleAttribute("data-panel-open", isOpen);
    if (isOpen) {
      clearTimeout(panel._templCloseTimer);
      panel.hidden = false;
      panel.removeAttribute("data-ending-style");
      setOpen(panel, true);
      measure(panel);
      panel.setAttribute("data-starting-style", "");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => panel.removeAttribute("data-starting-style"));
      });
    } else {
      panel.removeAttribute("data-starting-style");
      setOpen(panel, false);
      panel.setAttribute("data-ending-style", "");
      clearTimeout(panel._templCloseTimer);
      const duration = motionMs(panel);
      if (duration === 0) {
        finishClose(panel);
      } else {
        panel._templCloseTimer = setTimeout(() => finishClose(panel), duration + 50);
      }
    }
  }

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = triggerOf(e.target);
    if (trigger) toggle(trigger);
  });

  function finishMotion(e) {
    if (!(e.target instanceof Element)) return;
    const panel = e.target.closest(PANEL + "[data-ending-style]");
    if (panel) finishClose(panel);
  }

  document.addEventListener("transitionend", finishMotion);
  document.addEventListener("animationend", finishMotion);

  document.querySelectorAll(PANEL + "[data-open]").forEach(measure);
})();
