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

  function syncItemState(item, open) {
    item.toggleAttribute("data-open", open);
    item.toggleAttribute("data-closed", !open);
  }

  function openItem(item) {
    const panel = panelOf(item);
    triggerOf(item).setAttribute("aria-expanded", "true");
  syncItemState(item, true);
    if (!panel) return;
    triggerOf(item).setAttribute("aria-controls", panel.id);
    panel.removeAttribute("data-closed");
    panel.hidden = false;
    panel.style.setProperty("--accordion-panel-height", panel.scrollHeight + "px");
    panel.setAttribute("data-open", "");
  }

  function closeItem(item) {
    const panel = panelOf(item);
    triggerOf(item).setAttribute("aria-expanded", "false");
    triggerOf(item).removeAttribute("aria-controls");
  syncItemState(item, false);
    if (!panel) return;
    panel.removeAttribute("data-open");
    panel.style.setProperty("--accordion-panel-height", panel.scrollHeight + "px");
    panel.setAttribute("data-closed", "");
    panel.addEventListener(
      "animationend",
      () => {
        if (panel.hasAttribute("data-closed")) {
          panel.removeAttribute("data-closed");
          panel.hidden = true;
        }
      },
      { once: true }
    );
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
  });

  // WAI-ARIA accordion keyboard support: arrow keys, Home and End move focus
  // between the triggers of the same accordion.
  document.addEventListener("keydown", (e) => {
    if (!(e.target instanceof Element)) return;
    const trigger = e.target.closest('[data-slot="accordion-trigger"]');
    if (!trigger) return;
    const accordion = trigger.closest('[data-slot="accordion"]');
    if (!accordion) return;
    const triggers = [...accordion.querySelectorAll('[data-slot="accordion-trigger"]')].filter(
      (t) => !t.disabled && t.closest('[data-slot="accordion"]') === accordion
    );
    const index = triggers.indexOf(trigger);
    let next;
    if (e.key === "ArrowDown") next = triggers[(index + 1) % triggers.length];
    else if (e.key === "ArrowUp") next = triggers[(index - 1 + triggers.length) % triggers.length];
    else if (e.key === "Home") next = triggers[0];
    else if (e.key === "End") next = triggers[triggers.length - 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  });
})();
