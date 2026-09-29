(function () {
  "use strict";

  // Vanilla port of Base UI's radio group: the item behavior comes from
  // radio/root/RadioRoot.tsx, the group behavior from
  // radio-group/RadioGroup.tsx, the arrow keys and the roving tab stop from
  // the composite block. Clicks and Space forward to the visually hidden
  // native radio beside the item; arrow keys move the focus and select the
  // focused item (RadioGroup marks arrow navigation as touched, the focused
  // radio then clicks its hidden input).

  const GROUP = '[data-slot="radio-group"]';
  const ITEM = '[data-slot="radio-group-item"]';
  // Base UI renders the hidden input right beside the item, without markers.
  const INPUT = ITEM + ' + input[type="radio"]';

  function inputOf(item) {
    const next = item.nextElementSibling;
    return next && next.matches(INPUT) ? next : null;
  }

  function itemOf(input) {
    return input.matches && input.matches(INPUT) ? input.previousElementSibling : null;
  }

  function itemsOf(group) {
    return Array.from(group.querySelectorAll(ITEM));
  }

  function isDisabled(item, input) {
    return (input && input.disabled) || item.getAttribute("aria-disabled") === "true";
  }

  function isReadOnly(item) {
    return item.getAttribute("aria-readonly") === "true";
  }

  function groupOf(input) {
    return input.closest(GROUP);
  }

  function requestValueChange(input) {
    const group = groupOf(input);
    // The browser checks a radio before click listeners run, so the state
    // before this click lives on the item (RadioRoot reads its own checked).
    const item = itemOf(input);
    if (!group || (item && item.getAttribute("aria-checked") === "true")) return true;
    const change = new CustomEvent("radio-group-value-change", {
      bubbles: true,
      cancelable: true,
      detail: { value: input.value },
    });
    const accepted = group.dispatchEvent(change);
    // Controlled: the Base UI value prop on the group, the owner commits.
    return accepted && !group.hasAttribute("data-templ-value");
  }

  // Port of utils/dispatchClickWithModifiers.ts: the constructed click keeps
  // the source event's modifier state and still runs native activation
  // behavior (selecting the radio).
  function forwardClick(target, sourceEvent) {
    target.dispatchEvent(
      new PointerEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: 0,
        shiftKey: sourceEvent.shiftKey,
        ctrlKey: sourceEvent.ctrlKey,
        altKey: sourceEvent.altKey,
        metaKey: sourceEvent.metaKey,
      }),
    );
  }

  function syncItem(item, input) {
    const checked = !!input && input.checked;
    item.setAttribute("aria-checked", String(checked));
    item.toggleAttribute("data-checked", checked);
    item.toggleAttribute("data-composite-item-active", checked);
    item.toggleAttribute("data-unchecked", !checked);
    const indicator = item.querySelector('[data-slot="radio-group-indicator"]');
    if (indicator) {
      // Base UI unmounts the indicator while unchecked; we toggle [hidden].
      indicator.hidden = !checked;
      indicator.toggleAttribute("data-checked", checked);
      indicator.toggleAttribute("data-unchecked", !checked);
    }
    return checked;
  }

  function syncGroup(group) {
    itemsOf(group).forEach((item) => syncItem(item, inputOf(item)));
  }

  // RadioGroup's CompositeRoot: both orientations, loop, no Home and End,
  // Shift is the only modifier that does not cancel the navigation. Its
  // default tab stop is the checked radio, else the first enabled one.
  function initGroup(group) {
    syncGroup(group);
    group._templComposite = window.templ.composite.useCompositeRoot(group, {
      items: () => itemsOf(group),
      rtl: () => getComputedStyle(group).direction === "rtl",
      modifierKeys: ["Shift"],
    });
    // RadioGroup's onKeyDownCapture: an arrow key marks the group touched,
    // so the radio it focuses selects itself.
    group._templKeyDownCapture = (e) => {
      if (e.key.startsWith("Arrow")) group._templTouched = true;
    };
    group.addEventListener("keydown", group._templKeyDownCapture, true);
  }

  function destroyGroup(group) {
    group._templComposite?.cleanup();
    group._templComposite = null;
    group.removeEventListener("keydown", group._templKeyDownCapture, true);
  }

  function syncByInput(input) {
    // The browser already unchecked the same-name siblings without firing
    // change events on them, so the whole group resyncs.
    const group = groupOf(input);
    if (group) {
      syncGroup(group);
    } else {
      const item = itemOf(input);
      if (item) syncItem(item, input);
    }
  }

  // RadioRoot onClick: cancel the click's default (a wrapping label would
  // otherwise forward it to the input a second time) and select through the
  // hidden input so the native change event fires.
  document.addEventListener("click", (e) => {
    const item = e.target.closest && e.target.closest(ITEM);
    if (!item || e.defaultPrevented) return;
    const input = inputOf(item);
    if (!input) return;
    if (isDisabled(item, input)) {
      // useButton prevents clicks on disabled non-native buttons.
      e.preventDefault();
      return;
    }
    if (isReadOnly(item)) return;
    e.preventDefault();
    forwardClick(input, e);
  });

  document.addEventListener("change", (e) => {
    if (itemOf(e.target)) syncByInput(e.target);
  });

  document.addEventListener("keydown", (e) => {
    const item = e.target;
    if (!item.matches || !item.matches(ITEM)) return;
    const input = inputOf(item);
    if (isDisabled(item, input)) return;
    if (e.key === "Enter") {
      // RadioRoot onKeyDown: a radio only activates with Space.
      e.preventDefault();
      return;
    }
    if (e.key === " ") {
      // useButton: composite items activate Space on keydown.
      e.preventDefault();
      if (input && !isReadOnly(item)) forwardClick(input, e);
      return;
    }
  });

  // RadioRoot's onFocus: after an arrow key the focused radio selects itself.
  document.addEventListener("focusin", (e) => {
    const item = e.target;
    if (!item.matches || !item.matches(ITEM) || e.defaultPrevented) return;
    const group = item.closest(GROUP);
    if (!group?._templTouched) return;
    const input = inputOf(item);
    if (isDisabled(item, input) || isReadOnly(item)) return;
    group._templTouched = false;
    if (input) input.click();
  });

  // Focus on the hidden input (label clicks, programmatic focus) belongs on
  // the item root (RadioRoot's input onFocus).
  document.addEventListener("focusin", (e) => {
    const item = itemOf(e.target);
    if (item) item.focus();
  });

  let labelId = 0;

  function setupItem(item) {
    const input = inputOf(item);
    if (!input) return;
    // The clicks dispatched on the hidden input are an implementation detail
    // and must not reach ancestors, which already receive the original click
    // (RadioRoot's input onClick).
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!requestValueChange(input)) e.preventDefault();
    });
    // useAriaLabelledBy fallback: the span control is labelled by the native
    // label associated with the hidden input.
    if (!item.hasAttribute("aria-labelledby") && !item.hasAttribute("aria-label")) {
      const label =
        input.parentElement && input.parentElement.tagName === "LABEL"
          ? input.parentElement
          : input.labels && input.labels[0];
      if (label) {
        if (!label.id) {
          labelId += 1;
          label.id = (input.id || "templ-radio-" + labelId) + "-label";
        }
        item.setAttribute("aria-labelledby", label.id);
      }
    }
  }

  window.templ.lifecycle.register(ITEM, { init: setupItem });
  window.templ.lifecycle.register(GROUP, { init: initGroup, destroy: destroyGroup });
})();
