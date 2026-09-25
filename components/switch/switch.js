(function () {
  "use strict";

  // Vanilla port of Base UI's switch: the root span behavior comes from
  // switch/root/SwitchRoot.tsx, the non-native button keyboard semantics from
  // internals/use-button/useButton.ts. Clicks, Enter and Space forward to the
  // visually hidden native checkbox beside the root; the input's change event
  // syncs the state attributes back onto the root and thumb.

  const ROOT = '[data-slot="switch"]';
  // Base UI renders the hidden input right beside the root, without markers.
  const INPUT = ROOT + ' + input[type="checkbox"]';

  function inputOf(root) {
    const next = root.nextElementSibling;
    return next && next.matches(INPUT) ? next : null;
  }

  function rootOf(input) {
    return input.matches && input.matches(INPUT) ? input.previousElementSibling : null;
  }

  function isDisabled(root, input) {
    return (input && input.disabled) || root.getAttribute("aria-disabled") === "true";
  }

  function isReadOnly(root) {
    return root.getAttribute("aria-readonly") === "true";
  }

  // Port of utils/dispatchClickWithModifiers.ts: the constructed click keeps
  // the source event's modifier state and still runs native activation
  // behavior (toggling the input).
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

  function sync(root, input) {
    const checked = input.checked;
    root.setAttribute("aria-checked", String(checked));
    root.toggleAttribute("data-checked", checked);
    root.toggleAttribute("data-unchecked", !checked);
    // Base UI mirrors the state onto the thumb via the stateAttributesMapping.
    const thumb = root.querySelector('[data-slot="switch-thumb"]');
    if (thumb) {
      thumb.toggleAttribute("data-checked", checked);
      thumb.toggleAttribute("data-unchecked", !checked);
    }
  }

  function requestCheckedChange(root, input, sourceEvent) {
    const nextChecked = !input.checked;
    const change = new CustomEvent("switch-change", {
      bubbles: true,
      cancelable: true,
      detail: { checked: nextChecked },
    });
    root.dispatchEvent(change);
    if (change.defaultPrevented || root.hasAttribute("data-templ-checked")) return;
    forwardClick(input, sourceEvent);
  }

  // SwitchRoot onClick: cancel the click's default (a wrapping label would
  // otherwise forward it to the input a second time) and toggle through the
  // hidden input so the native change event fires.
  document.addEventListener("click", (e) => {
    const root = e.target.closest && e.target.closest(ROOT);
    if (!root) return;
    const input = inputOf(root);
    if (!input) return;
    if (isDisabled(root, input)) {
      // useButton prevents clicks on disabled non-native buttons.
      e.preventDefault();
      return;
    }
    if (isReadOnly(root)) return;
    e.preventDefault();
    requestCheckedChange(root, input, e);
  });

  document.addEventListener("change", (e) => {
    const input = e.target;
    const root = rootOf(input);
    if (root) sync(root, input);
  });

  document.addEventListener("keydown", (e) => {
    const root = e.target;
    if (!root.matches || !root.matches(ROOT)) return;
    if (isDisabled(root, inputOf(root))) return;
    if (e.key === "Enter") {
      // useButton: Enter activates non-native buttons on keydown.
      if (e.defaultPrevented) return;
      e.preventDefault();
      forwardClick(root, e);
    } else if (e.key === " ") {
      // useButton: Space activates on keyup; prevent the page scroll.
      e.preventDefault();
    }
  });

  // useButton keyup: Space dispatches the click on the root itself, which the
  // click handler above forwards to the input.
  document.addEventListener("keyup", (e) => {
    const root = e.target;
    if (!root.matches || !root.matches(ROOT)) return;
    if (e.key !== " " || e.defaultPrevented) return;
    if (isDisabled(root, inputOf(root))) return;
    forwardClick(root, e);
  });

  // Focus on the hidden input (label clicks, programmatic focus) belongs on
  // the root (SwitchRoot's input onFocus).
  document.addEventListener("focusin", (e) => {
    const root = rootOf(e.target);
    if (root) root.focus();
  });

  let labelId = 0;

  function setup(root) {
    if (root._templSwitch) return;
    root._templSwitch = true;
    const input = inputOf(root);
    if (!input) return;
    // The clicks dispatched on the hidden input are an implementation detail
    // and must not reach ancestors, which already receive the original click
    // (SwitchRoot's input onClick).
    input.addEventListener("click", (e) => e.stopPropagation());
    // useAriaLabelledBy fallback: the span control is labelled by the native
    // label associated with the hidden input.
    if (!root.hasAttribute("aria-labelledby") && !root.hasAttribute("aria-label")) {
      const label =
        input.parentElement && input.parentElement.tagName === "LABEL"
          ? input.parentElement
          : input.labels && input.labels[0];
      if (label) {
        if (!label.id) {
          labelId += 1;
          label.id = (input.id || "templ-switch-" + labelId) + "-label";
        }
        root.setAttribute("aria-labelledby", label.id);
      }
    }
    sync(root, input);
  }

  function init() {
    document.querySelectorAll(ROOT).forEach(setup);
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
