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
      panel.hidden = false;
      measure(panel);
      window.templ.transition.open([panel]);
    } else {
      // Hidden once the panel's own animations finished.
      window.templ.transition.close([panel], panel, () => {
        panel.hidden = true;
      });
    }
  }

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = triggerOf(e.target);
    if (trigger) toggle(trigger);
  });

  document.querySelectorAll(PANEL + "[data-open]").forEach(measure);
})();
