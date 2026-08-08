(function () {
  "use strict";

  // Update tab state
  function setActiveTab(tabsId, value) {
  const root = document.querySelector(
    `[data-tui-tabs][data-tui-tabs-id="${tabsId}"]`,
  );
  if (root) root.setAttribute("data-tui-tabs-value", value || "");
    // Update all triggers with this tabs-id
    document
      .querySelectorAll(`[data-tui-tabs-trigger][data-tui-tabs-id="${tabsId}"]`)
      .forEach((trigger) => {
        const isActive = trigger.getAttribute("data-tui-tabs-value") === value;
        trigger.setAttribute(
          "data-tui-tabs-state",
          isActive ? "active" : "inactive",
        );
        // Base UI marks the selected tab with a bare data-active attribute;
        // the cn-tabs-trigger styles select on it.
        trigger.toggleAttribute("data-active", isActive);
        // The ARIA state moves with the visual one, and the roving tabindex
        // keeps the list a single tab stop.
        trigger.setAttribute("aria-selected", isActive ? "true" : "false");
        trigger.setAttribute("tabindex", isActive ? "0" : "-1");
      });

    // Update all contents with this tabs-id
    document
      .querySelectorAll(`[data-tui-tabs-content][data-tui-tabs-id="${tabsId}"]`)
      .forEach((content) => {
        const isActive = content.getAttribute("data-tui-tabs-value") === value;
        content.setAttribute(
          "data-tui-tabs-state",
          isActive ? "active" : "inactive",
        );
        content.classList.toggle("hidden", !isActive);
      });
  }

  function requestValueChange(root, value) {
    if (!root || root.getAttribute("data-tui-tabs-value") === value) return;
    const accepted = root.dispatchEvent(
      new CustomEvent("tabs-value-change", {
        bubbles: true,
        cancelable: true,
        detail: { value },
      }),
    );
    if (!accepted || root.hasAttribute("data-tui-tabs-controlled")) return;
    setActiveTab(root.getAttribute("data-tui-tabs-id"), value);
  }

  // Click handler
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-tui-tabs-trigger]");
    if (!trigger) return;

    const tabsId = trigger.getAttribute("data-tui-tabs-id");
    const value = trigger.getAttribute("data-tui-tabs-value");
    if (tabsId && value) {
    const root = trigger.closest("[data-tui-tabs]");
    requestValueChange(root, value);
    }
  });

  // Initialize active states
  function init() {
    document.querySelectorAll("[data-tui-tabs]").forEach((container) => {
      const tabsId = container.getAttribute("data-tui-tabs-id");
      if (!tabsId) return;

      // Find active trigger or use first
    const authored = container.querySelector(
    `[data-tui-tabs-trigger][data-tui-tabs-state="active"]`,
    );
    const activeTrigger =
    authored ||
    (container.hasAttribute("data-tui-tabs-controlled")
      ? null
      : container.querySelector(`[data-tui-tabs-trigger]:not(:disabled)`));

      if (activeTrigger) {
        setActiveTab(tabsId, activeTrigger.getAttribute("data-tui-tabs-value"));
      }
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

  // Expose public API
  window.tui = window.tui || {};
  window.tui.tabs = {
    setActive: setActiveTab,
  };
})();
