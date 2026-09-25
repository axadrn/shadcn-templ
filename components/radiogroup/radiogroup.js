(function () {
  "use strict";

  // Vanilla port of Base UI's radio group: the item behavior comes from
  // radio/root/RadioRoot.tsx, the group behavior from
  // radio-group/RadioGroup.tsx and the arrow-key navigation with roving tab
  // stop from internals/composite/root/useCompositeRoot.ts (orientation
  // "both", loopFocus, Home/End disabled, Shift is the only modifier that
  // does not cancel navigation). Clicks and Space forward to the visually
  // hidden native radio beside the item; arrow keys move the focus and select
  // the focused item (RadioGroup marks arrow navigation as touched, the
  // focused radio then clicks its hidden input).

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
    const items = itemsOf(group);
    let stop = null;
    items.forEach((item) => {
      if (syncItem(item, inputOf(item))) stop = item;
    });
    // Roving tab stop (useCompositeRoot onMapChange): the checked item is the
    // group's tab stop, otherwise the first enabled item.
    if (!stop) stop = items.find((item) => !isDisabled(item, inputOf(item))) || null;
    items.forEach((item) => {
      item.setAttribute("tabindex", item === stop ? "0" : "-1");
    });
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
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    // isModifierKeySet with modifierKeys=[Shift]: any other modifier cancels.
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const group = item.closest(GROUP);
    if (!group) return;
    const rtl = getComputedStyle(group).direction === "rtl";
    const forward = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const items = itemsOf(group);
    const enabled = items.filter((it) => !isDisabled(it, inputOf(it)));
    if (enabled.length === 0) return;
    e.preventDefault();
    let next = enabled.indexOf(item) + (forward ? 1 : -1);
    // loopFocus wraps around at both ends.
    if (next < 0) next = enabled.length - 1;
    if (next >= enabled.length) next = 0;
    const nextItem = enabled[next];
    if (nextItem === item) return;
    // The highlight (and with it the tab stop) follows the arrow navigation.
    items.forEach((it) => {
      it.setAttribute("tabindex", it === nextItem ? "0" : "-1");
    });
    nextItem.focus();
    // RadioGroup onKeyDownCapture marks arrow navigation as touched; the
    // focused radio's onFocus then clicks its hidden input, selecting it.
    const nextInput = inputOf(nextItem);
    if (nextInput && !isReadOnly(nextItem)) forwardClick(nextInput, e);
  });

  // Focus on the hidden input (label clicks, programmatic focus) belongs on
  // the item root (RadioRoot's input onFocus).
  document.addEventListener("focusin", (e) => {
    const item = itemOf(e.target);
    if (item) item.focus();
  });

  let labelId = 0;

  function setupItem(item) {
    if (item._templRadio) return;
    item._templRadio = true;
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

  function init() {
    document.querySelectorAll(ITEM).forEach(setupItem);
    document.querySelectorAll(GROUP).forEach((group) => {
      if (group._templRadioGroup) return;
      group._templRadioGroup = true;
      syncGroup(group);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // Re-init on any childList mutation, directly (never rAF-deferred: rAF
  // does not fire in hidden tabs or throttled iframes): swapped-in markup
  // wires itself.
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });
})();
