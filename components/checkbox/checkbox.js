(function () {
  "use strict";

  // Vanilla port of Base UI's checkbox: the root span behavior comes from
  // checkbox/root/CheckboxRoot.tsx, the non-native button keyboard semantics
  // from internals/use-button/useButton.ts. Clicks and Space forward to the
  // visually hidden native input beside the root; the input's change event
  // syncs the state attributes back onto the root and indicator.

  const ROOT = '[data-slot="checkbox"]';
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
    // The input's indeterminate IDL property is the source of truth for the
    // mixed state (Base UI's indeterminate prop): a user click clears it
    // natively, scripts set it and dispatch change.
    const indeterminate = input.indeterminate;
    root.setAttribute("aria-checked", indeterminate ? "mixed" : String(checked));
    root.toggleAttribute("data-indeterminate", indeterminate);
    root.toggleAttribute("data-checked", checked);
    root.toggleAttribute("data-unchecked", !checked);
    const indicator = root.querySelector('[data-slot="checkbox-indicator"]');
    if (indicator) {
      // Base UI unmounts the indicator while unchecked; we toggle [hidden].
      indicator.hidden = !checked && !indeterminate;
      indicator.toggleAttribute("data-indeterminate", indeterminate);
      indicator.toggleAttribute("data-checked", checked);
      indicator.toggleAttribute("data-unchecked", !checked);
    }
  }

  function requestCheckedChange(root, input, sourceEvent) {
    const nextChecked = !input.checked;
    const change = new CustomEvent("checkbox-change", {
      bubbles: true,
      cancelable: true,
      detail: { checked: nextChecked },
    });
    root.dispatchEvent(change);
    if (change.defaultPrevented || root.hasAttribute("data-templ-checked")) return;
    forwardClick(input, sourceEvent);
  }

  // CheckboxRoot onClick: cancel the click's default (a wrapping label would
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
    if (!input.matches || !input.matches(INPUT)) return;
    const root = rootOf(input);
    if (root) sync(root, input);
  });

  document.addEventListener("keydown", (e) => {
    const root = e.target;
    if (!root.matches || !root.matches(ROOT)) return;
    const input = inputOf(root);
    if (isDisabled(root, input)) return;
    if (e.key === "Enter") {
      // CheckboxRoot onKeyDown: Enter never toggles the checkbox, it submits
      // the owning form through its default submitter
      // (@base-ui/utils/getDefaultFormSubmitter.ts).
      if (e.defaultPrevented) return;
      e.preventDefault();
      const form = input && input.form;
      if (!form) return;
      for (const candidate of form.elements) {
        const tagName = candidate.tagName;
        if ((tagName === "BUTTON" || tagName === "INPUT") && candidate.type === "submit") {
          candidate.click();
          return;
        }
      }
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
  // the root (CheckboxRoot's input onFocus).
  document.addEventListener("focusin", (e) => {
    const input = e.target;
    if (!input.matches || !input.matches(INPUT)) return;
    const root = rootOf(input);
    if (root) root.focus();
  });

  let labelId = 0;

  function setup(root) {
    if (root._templCheckbox) return;
    root._templCheckbox = true;
    const input = inputOf(root);
    if (!input) return;
    // SSR'd mixed state: the input element has no indeterminate attribute,
    // so the root's data-indeterminate seeds the IDL property.
    if (root.hasAttribute("data-indeterminate")) {
      input.indeterminate = true;
    }
    // The clicks dispatched on the hidden input are an implementation detail
    // and must not reach ancestors, which already receive the original click
    // (CheckboxRoot's input onClick).
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
          label.id = (input.id || "templ-checkbox-" + labelId) + "-label";
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
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });
})();
