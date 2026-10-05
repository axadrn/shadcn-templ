(function () {
  "use strict";

  const ROOT = '[data-slot="collapsible"]';
  const PANEL = '[data-slot="collapsible-content"]';

  function panelFor(trigger) {
    return document.getElementById(trigger.getAttribute("data-templ-controls") || "");
  }

  // A trigger merged onto another component keeps that component's slot
  // (Base UI render prop), so the trigger is whatever links a panel. A
  // collapsible without a panel still has its own trigger slot.
  function isTrigger(el) {
    const panel = panelFor(el);
    return panel ? panel.matches(PANEL) : el.matches('[data-slot="collapsible-trigger"]');
  }

  function triggerOf(target) {
    const trigger = target.closest("[data-templ-controls]");
    return trigger && isTrigger(trigger) ? trigger : null;
  }

  // Base UI's CollapsiblePanel exposes its size as these variables.
  const VARS = "--collapsible-panel";

  // apply renders the root's open state on the root, its triggers and its
  // panel. The root and the triggers render the transition status with the
  // panel.
  function apply(root, isOpen) {
    const own = (el) => el.closest(ROOT) === root;
    root.toggleAttribute("data-open", isOpen);
    root.toggleAttribute("data-closed", !isOpen);
    const triggers = [...root.querySelectorAll("[data-templ-controls]")].filter((t) => own(t) && isTrigger(t));
    for (const trigger of triggers) {
      trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      trigger.toggleAttribute("data-panel-open", isOpen);
      // CollapsibleTrigger renders aria-controls while open.
      if (isOpen) trigger.setAttribute("aria-controls", trigger.getAttribute("data-templ-controls"));
      else trigger.removeAttribute("aria-controls");
    }
    // The trigger's mapping renders data-panel-open, not data-open.
    const shared = { parts: [root], styleParts: triggers };
    const panel = [...root.querySelectorAll(PANEL)].find(own);
    if (panel) {
      if (isOpen) window.templ.collapsiblePanel.open(panel, VARS, shared);
      else window.templ.collapsiblePanel.close(panel, VARS, null, shared);
      return;
    }
    if (isOpen) {
      window.templ.transition.open(shared, null);
      return;
    }
    // The panel's animations end a close (useOpenChangeComplete sets mounted
    // false); without a panel the status stays ending.
    window.templ.transition.reset(shared, false);
    requestAnimationFrame(() => {
      if (root.hasAttribute("data-open")) return;
      [root, ...triggers].forEach((part) => part.setAttribute("data-ending-style", ""));
    });
  }

  function toggle(trigger) {
    const root = trigger.closest(ROOT);
    if (!root || root.hasAttribute("data-disabled")) return;
    const isOpen = !root.hasAttribute("data-open");
    const accepted = root.dispatchEvent(
      new CustomEvent("collapsible-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: isOpen },
      }),
    );
    if (!accepted || root.hasAttribute("data-templ-open")) return;
    apply(root, isOpen);
  }

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = triggerOf(e.target);
    if (trigger) toggle(trigger);
  });

  window.templ.lifecycle.register(PANEL, {
    init: (panel) => window.templ.collapsiblePanel.mount(panel, VARS, !panel.hidden),
  });

  // The owner's API: setOpen is the pendant of the open prop a page renders
  // a controlled collapsible with.
  window.templ.collapsible = {
    setOpen(root, open) {
      apply(root, open);
    },
  };
})();
