(function () {
  "use strict";

  // Mirrors Base UI's accordion: aria-expanded on the trigger is the single
  // source of truth, panels animate between 0 and their measured height.

  function triggerOf(item) {
    return item.querySelector('[data-slot="accordion-trigger"]');
  }

  function panelOf(item) {
    return item.querySelector('[data-slot="accordion-content"]');
  }

  function valueOf(item) {
    return item.getAttribute("data-templ-value") || "";
  }

  function valuesOf(accordion) {
    return [...accordion.querySelectorAll('[data-slot="accordion-item"]')]
      .filter(
        (item) =>
          item.closest('[data-slot="accordion"]') === accordion &&
          triggerOf(item)?.getAttribute("aria-expanded") === "true",
      )
      .map(valueOf);
  }

  // Base UI's AccordionPanel exposes its size as these variables.
  const VARS = "--accordion-panel";

  // The item state on item, header and panel, the trigger's hidden too:
  // data-hidden while closed and unmounted.
  function headerOf(item) {
    return triggerOf(item)?.parentElement;
  }

  function syncItemState(item, open) {
    [item, headerOf(item), panelOf(item)].forEach((el) => {
      if (!el) return;
      el.toggleAttribute("data-open", open);
      el.toggleAttribute("data-closed", !open);
    });
    if (open) setHidden(item, false);
  }

  function setHidden(item, hidden) {
    [item, headerOf(item), triggerOf(item), panelOf(item)].forEach((el) => el?.toggleAttribute("data-hidden", hidden));
  }

  // Every trigger renders the root's value.
  function syncRootValue(accordion) {
    const value = valuesOf(accordion).join(",");
    accordion.querySelectorAll('[data-slot="accordion-trigger"]').forEach((trigger) => {
      if (trigger.closest('[data-slot="accordion"]') === accordion) trigger.setAttribute("data-value", value);
    });
  }

  function openItem(item) {
    const panel = panelOf(item);
    triggerOf(item).setAttribute("aria-expanded", "true");
    triggerOf(item).toggleAttribute("data-panel-open", true);
  syncItemState(item, true);
    if (!panel) return;
    triggerOf(item).setAttribute("aria-controls", panel.id);
    window.templ.collapsiblePanel.open(panel, VARS);
  }

  function closeItem(item) {
    const panel = panelOf(item);
    triggerOf(item).setAttribute("aria-expanded", "false");
    triggerOf(item).toggleAttribute("data-panel-open", false);
    triggerOf(item).removeAttribute("aria-controls");
  syncItemState(item, false);
    if (!panel) {
      setHidden(item, true);
      return;
    }
    window.templ.collapsiblePanel.close(panel, VARS, () => {
      if (triggerOf(item).getAttribute("aria-expanded") === "false") setHidden(item, true);
    });
  }

  function requestValueChange(accordion, item) {
    const open = triggerOf(item).getAttribute("aria-expanded") === "true";
    let values = valuesOf(accordion);
    if (open) {
      values = values.filter((value) => value !== valueOf(item));
    } else if (accordion.hasAttribute("data-templ-multiple")) {
      values = [...values, valueOf(item)];
    } else {
      values = [valueOf(item)];
    }
    const change = new CustomEvent("accordion-value-change", {
      bubbles: true,
      cancelable: true,
      detail: { values },
    });
    const accepted = accordion.dispatchEvent(change);
    return accepted && !accordion.hasAttribute("data-templ-value");
  }

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = e.target.closest('[data-slot="accordion-trigger"]');
    if (!trigger) return;
    const item = trigger.closest('[data-slot="accordion-item"]');
    const accordion = trigger.closest('[data-slot="accordion"]');
  if (
    !item ||
    !accordion ||
    item.hasAttribute("data-disabled") ||
    accordion.hasAttribute("data-disabled") ||
    !requestValueChange(accordion, item)
  ) return;

    if (trigger.getAttribute("aria-expanded") === "true") {
      closeItem(item);
      syncRootValue(accordion);
      return;
    }
  if (!accordion.hasAttribute("data-templ-multiple")) {
      accordion.querySelectorAll('[data-slot="accordion-item"]').forEach((other) => {
        if (other === item) return;
        if (other.closest('[data-slot="accordion"]') !== accordion) return;
        if (triggerOf(other)?.getAttribute("aria-expanded") === "true") closeItem(other);
      });
    }
    openItem(item);
    syncRootValue(accordion);
  });

  window.templ.lifecycle.register('[data-slot="accordion-content"]', {
    init: (panel) => window.templ.collapsiblePanel.mount(panel, VARS, !panel.hidden),
  });
})();
