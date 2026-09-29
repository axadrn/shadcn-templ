(function () {
  "use strict";

  const ROOT = '[data-slot="tabs"]';
  const LIST = '[data-slot="tabs-list"]';
  const TAB = '[data-slot="tabs-trigger"]';
  const PANEL = '[data-slot="tabs-content"]';

  // Parts of this root only, never those of a nested tabs.
  function partsOf(root, selector) {
    return [...root.querySelectorAll(selector)].filter((el) => el.closest(ROOT) === root);
  }

  function isDisabled(tab) {
    return tab.getAttribute("aria-disabled") === "true";
  }

  function activeValue(root) {
    const tab = partsOf(root, TAB).find((t) => t.hasAttribute("data-active"));
    return tab ? tab.getAttribute("data-templ-value") : null;
  }

  // Update tab state
  function setActiveTab(root, value) {
    if (!root) return;
    const tabs = partsOf(root, TAB);
    tabs.forEach((trigger) => {
      const isActive = trigger.getAttribute("data-templ-value") === value;
      // Base UI marks the selected tab with a bare data-active attribute;
      // the cn-tabs-trigger styles select on it.
      trigger.toggleAttribute("data-active", isActive);
      trigger.toggleAttribute("data-composite-item-active", isActive);
      trigger.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    partsOf(root, PANEL).forEach((content) => {
      const isActive = content.getAttribute("data-templ-value") === value;
      content.toggleAttribute("data-hidden", !isActive);
      content.classList.toggle("hidden", !isActive);
      content.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    // TabsTab keeps the highlight on the active tab, unless the focus is in
    // the list, where it stays relative to the focused tab, and never on a
    // disabled tab.
    const list = partsOf(root, LIST)[0];
    const index = tabs.findIndex((t) => t.getAttribute("data-templ-value") === value);
    if (!list?._templComposite || index === -1 || isDisabled(tabs[index])) return;
    if (list.contains(document.activeElement)) return;
    list._templComposite.highlight(index);
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

  // TabsTab's onClick.
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest && e.target.closest(TAB);
    if (!trigger || isDisabled(trigger) || trigger.hasAttribute("data-active")) return;
    const value = trigger.getAttribute("data-templ-value");
    if (value) requestValueChange(trigger.closest(ROOT), value);
  });

  // TabsTab's onPointerDown: a press on a tab, and whether it is the main
  // button, for activateOnFocus.
  let isPressing = false;
  let isMainButton = false;
  document.addEventListener("pointerdown", (e) => {
    const trigger = e.target.closest && e.target.closest(TAB);
    if (!trigger || trigger.hasAttribute("data-active") || isDisabled(trigger)) return;
    isPressing = true;
    if (!e.button) {
      isMainButton = true;
      document.addEventListener("pointerup", () => {
        isPressing = false;
        isMainButton = false;
      }, { once: true });
    }
  });

  // TabsTab's onFocus: with activateOnFocus a tab focused by the keyboard,
  // touch or the main mouse button activates. Base UI's default leaves it off,
  // so the arrows move the focus and Enter or Space activate.
  document.addEventListener("focusin", (e) => {
    const trigger = e.target.closest && e.target.closest(TAB);
    if (!trigger || trigger.hasAttribute("data-active") || isDisabled(trigger)) return;
    const list = trigger.closest(LIST);
    if (!list?.hasAttribute("data-templ-activate-on-focus")) return;
    if (isPressing && !isMainButton) return;
    requestValueChange(trigger.closest(ROOT), trigger.getAttribute("data-templ-value"));
  });

  // Initialize active states: the server marks the active tab; an
  // uncontrolled root without one activates its first enabled tab.
  function init(root) {
    const value = activeValue(root);
    if (value !== null) {
      setActiveTab(root, value);
    } else if (!root.hasAttribute("data-templ-value")) {
      const first = partsOf(root, TAB).find((t) => !isDisabled(t));
      if (first) setActiveTab(root, first.getAttribute("data-templ-value"));
    }
    // TabsList's CompositeRoot: the arrows by orientation, Home and End, loop,
    // disabled tabs stay reachable (an empty disabledIndices).
    const list = partsOf(root, LIST)[0];
    if (!list) return;
    list._templComposite = window.templ.composite.useCompositeRoot(list, {
      items: () => partsOf(root, TAB),
      orientation: root.getAttribute("data-orientation") === "vertical" ? "vertical" : "horizontal",
      rtl: () => getComputedStyle(list).direction === "rtl",
      enableHomeAndEndKeys: true,
      disabledIndices: [],
    });
  }

  function destroy(root) {
    const list = partsOf(root, LIST)[0];
    list?._templComposite?.cleanup();
    if (list) list._templComposite = null;
  }

  window.templ.lifecycle.register(ROOT, { init, destroy });

  // Expose public API: setActive(root, value) with the [data-slot=tabs] root.
  window.templ = window.templ || {};
  window.templ.tabs = {
    setActive: setActiveTab,
  };
})();
