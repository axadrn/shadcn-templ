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

  // Base UI's CollapsiblePanel exposes its size as these variables.
  const VARS = "--collapsible-panel";

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
    if (isOpen) window.templ.collapsiblePanel.open(panel, VARS);
    else window.templ.collapsiblePanel.close(panel, VARS);
  }

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = triggerOf(e.target);
    if (trigger) toggle(trigger);
  });

  window.templ.lifecycle.register(PANEL, {
    init: (panel) => window.templ.collapsiblePanel.mount(panel, VARS, !panel.hidden),
  });
})();
