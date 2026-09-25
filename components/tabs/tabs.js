(function () {
  "use strict";

  const ROOT = '[data-slot="tabs"]';
  const TAB = '[data-slot="tabs-trigger"]';
  const PANEL = '[data-slot="tabs-content"]';

  // Parts of this root only, never those of a nested tabs.
  function partsOf(root, selector) {
    return [...root.querySelectorAll(selector)].filter((el) => el.closest(ROOT) === root);
  }

  function activeValue(root) {
    const tab = partsOf(root, TAB).find((t) => t.hasAttribute("data-active"));
    return tab ? tab.getAttribute("data-templ-value") : null;
  }

  // Update tab state
  function setActiveTab(root, value) {
    if (!root) return;
    partsOf(root, TAB).forEach((trigger) => {
      const isActive = trigger.getAttribute("data-templ-value") === value;
      // Base UI marks the selected tab with a bare data-active attribute;
      // the cn-tabs-trigger styles select on it.
      trigger.toggleAttribute("data-active", isActive);
      // The ARIA state moves with the visual one, and the roving tabindex
      // keeps the list a single tab stop.
      trigger.setAttribute("aria-selected", isActive ? "true" : "false");
      trigger.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    partsOf(root, PANEL).forEach((content) => {
      const isActive = content.getAttribute("data-templ-value") === value;
      content.toggleAttribute("data-hidden", !isActive);
      content.classList.toggle("hidden", !isActive);
      content.setAttribute("tabindex", isActive ? "0" : "-1");
    });
  }

  function requestValueChange(root, value) {
    if (!root || activeValue(root) === value) return;
    const accepted = root.dispatchEvent(
      new CustomEvent("tabs-value-change", {
        bubbles: true,
        cancelable: true,
        detail: { value },
      }),
    );
    // Controlled: the Base UI value prop on the root, the owner commits.
    if (!accepted || root.hasAttribute("data-templ-value")) return;
    setActiveTab(root, value);
  }

  // Click handler
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest && e.target.closest(TAB);
    if (!trigger || trigger.getAttribute("aria-disabled") === "true") return;
    const value = trigger.getAttribute("data-templ-value");
    if (value) requestValueChange(trigger.closest(ROOT), value);
  });

  // Keyboard navigation from useTabsList: the arrows walk the list, Home and
  // End jump to its ends, disabled tabs stay focusable and movement wraps.
  //
  // Moving focus does not activate. That is Base UI's activateOnFocus=false
  // default, and the right one here: a panel is free to load its content when
  // it becomes active, and selecting on every keystroke would fire a request
  // per arrow press. Enter and Space activate, through the native button
  // click the click handler above already answers. Set ActivateOnFocus on the
  // list for the other behaviour.
  document.addEventListener("keydown", (e) => {
    const trigger = e.target.closest && e.target.closest(TAB);
    if (!trigger) return;
    const root = trigger.closest(ROOT);
    if (!root) return;

    // In a horizontal list the arrows follow the writing direction.
    const vertical = root.getAttribute("data-orientation") === "vertical";
    const rtl = getComputedStyle(root).direction === "rtl";
    const prev = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
    const next = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";

    const triggers = partsOf(root, TAB);
    const current = triggers.indexOf(trigger);
    if (current === -1) return;

    let target = null;
    if (e.key === next) target = triggers[(current + 1) % triggers.length];
    else if (e.key === prev)
      target = triggers[(current - 1 + triggers.length) % triggers.length];
    else if (e.key === "Home") target = triggers[0];
    else if (e.key === "End") target = triggers[triggers.length - 1];
    if (!target) return;

    e.preventDefault(); // the arrows would otherwise scroll the page

    const list = trigger.closest('[data-slot="tabs-list"]');
    if (
      list && list.hasAttribute("data-templ-activate-on-focus") &&
      target.getAttribute("aria-disabled") !== "true"
    ) {
      // setActiveTab moves the roving tabindex with the selection.
      setActiveTab(root, target.getAttribute("data-templ-value"));
    } else {
      // Focus moves without selecting, so the roving tabindex has to follow
      // the focus instead: tabbing away and back returns to where the user
      // was, not to the selected tab.
      triggers.forEach((t) => t.setAttribute("tabindex", t === target ? "0" : "-1"));
    }
    target.focus();
  });

  // Initialize active states: the server marks the active tab; an
  // uncontrolled root without one activates its first enabled tab.
  function init() {
    document.querySelectorAll(ROOT).forEach((root) => {
      const value = activeValue(root);
      if (value !== null) {
        setActiveTab(root, value);
        return;
      }
      if (root.hasAttribute("data-templ-value")) return;
      const first = partsOf(root, TAB).find((t) => t.getAttribute("aria-disabled") !== "true");
      if (first) setActiveTab(root, first.getAttribute("data-templ-value"));
    });
  }

  // Setup on load and mutations
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // Re-init on any childList mutation, directly (never rAF-deferred: rAF
  // does not fire in hidden tabs or throttled iframes): swapped-in markup
  // wires itself.
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });

  // Expose public API: setActive(root, value) with the [data-slot=tabs] root.
  window.templ = window.templ || {};
  window.templ.tabs = {
    setActive: setActiveTab,
  };
})();
