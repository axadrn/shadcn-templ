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

  // Keyboard navigation from useTabsList: the arrows walk the list, Home and
  // End jump to its ends, disabled tabs are skipped and movement wraps.
  //
  // Moving focus does not activate. That is Base UI's activateOnFocus=false
  // default, and the right one here: a panel is free to load its content when
  // it becomes active, and selecting on every keystroke would fire a request
  // per arrow press. Enter and Space activate, through the native button
  // click the click handler above already answers. Set ActivateOnFocus on the
  // list for the other behaviour.
  function enabledTriggers(root) {
    return [...root.querySelectorAll("[data-tui-tabs-trigger]")].filter(
      (trigger) =>
        !trigger.disabled && trigger.getAttribute("aria-disabled") !== "true",
    );
  }

  document.addEventListener("keydown", (e) => {
    const trigger = e.target.closest && e.target.closest("[data-tui-tabs-trigger]");
    if (!trigger) return;
    const root = trigger.closest("[data-tui-tabs]");
    if (!root) return;

    // In a horizontal list the arrows follow the writing direction.
    const vertical = root.getAttribute("data-orientation") === "vertical";
    const rtl = getComputedStyle(root).direction === "rtl";
    const prev = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
    const next = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";

    const triggers = enabledTriggers(root);
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

    const list = trigger.closest("[data-tui-tabs-list]");
    if (list && list.hasAttribute("data-activate-on-focus")) {
      // setActiveTab moves the roving tabindex with the selection.
      setActiveTab(
        target.getAttribute("data-tui-tabs-id"),
        target.getAttribute("data-tui-tabs-value"),
      );
    } else {
      // Focus moves without selecting, so the roving tabindex has to follow
      // the focus instead: tabbing away and back returns to where the user
      // was, not to the selected tab.
      triggers.forEach((t) => t.setAttribute("tabindex", t === target ? "0" : "-1"));
    }
    target.focus();
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
