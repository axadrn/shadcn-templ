(function () {
  "use strict";

  // Vanilla port of Base UI's Dialog (packages/react/src/dialog): the portal
  // node, backdrop and popup are SSRd divs; this script drives Base UI's
  // data-open/data-closed/data-starting-style/data-ending-style transition
  // lifecycle, the FloatingFocusManager focus trap (guards, initial focus,
  // return focus), useDismiss's escape/outside-press semantics, markOthers'
  // aria-hidden application to outside content and useScrollLock's deferred
  // body lock. "Unmount" is the portal node getting [hidden] again.

  // ----- registry ------------------------------------------------------------

  // Popup element -> per-dialog state. The open stack orders open dialogs by
  // open time (last = topmost), like Base UI's nested dialog counts.
  const dialogs = new Map();
  const openStack = [];

  // A dialog popup (Dialog, Sheet, AlertDialog) is the dialog or alertdialog
  // element carrying Base UI's modal prop; the popover popup has role dialog
  // too but no modal prop. Its parent is the portal node (data-base-ui-portal)
  // that holds the backdrop and the popup.
  const POPUP = '[role="dialog"][data-templ-modal], [role="alertdialog"][data-templ-modal]';
  // Base UI's Dialog.Backdrop renders role="presentation".
  const BACKDROP = ':scope > [role="presentation"]';

  function getDialog(target) {
    if (!target) return null;
    if (typeof target === "string") {
      const el = document.getElementById(target);
      return el && el.matches(POPUP) ? el : null;
    }
    if (target.matches?.(POPUP)) return target;
    return target.closest?.(POPUP) || null;
  }

  function stateOf(target) {
    const popup = getDialog(target);
    return popup ? dialogs.get(popup) : null;
  }

  function dialogFor(element) {
    // Dialog.Close links through context in Base UI; its port marker carries
    // the dialog id when the close sits outside the popup.
    const id =
      element.getAttribute("aria-controls") || element.getAttribute("data-templ-dialog-close");
    if (id) return getDialog(id);
    return getDialog(element);
  }

  function triggersFor(popup) {
    if (!popup.id) return [];
    return document.querySelectorAll(
      '[data-base-ui-click-trigger][aria-controls="' + popup.id + '"]',
    );
  }

  function isModal(state) {
    return state.popup.getAttribute("data-templ-modal") !== "false";
  }

  // ----- interaction type ----------------------------------------------------

  // FloatingFocusManager tracks the last pointer/keyboard interaction to pick
  // touch initial focus and keyboard-visible return focus.
  let lastInteractionType = "";
  document.addEventListener(
    "pointerdown",
    (event) => {
      lastInteractionType = event.pointerType || "mouse";
    },
    true,
  );
  document.addEventListener(
    "keydown",
    () => {
      lastInteractionType = "keyboard";
    },
    true,
  );

  // ----- tabbable (floating-ui-react/utils/tabbable.ts) ----------------------

  const CANDIDATE_SELECTOR =
    'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';

  function isFocusableElement(element) {
    if (
      !element.matches(CANDIDATE_SELECTOR) ||
      !element.isConnected ||
      element.matches(":disabled") ||
      (element.localName === "input" && element.type === "hidden")
    ) {
      return false;
    }
    for (let current = element; current; current = current.parentElement) {
      const isAncestor = current !== element;
      if (current.hasAttribute("inert") || current.hasAttribute("hidden")) return false;
      const style = getComputedStyle(current);
      if (style.display === "none") return false;
      if (!isAncestor && (style.visibility === "hidden" || style.visibility === "collapse")) {
        return false;
      }
      if (
        isAncestor &&
        current.localName === "details" &&
        !current.open &&
        !(current.querySelector(":scope > summary")?.contains(element))
      ) {
        return false;
      }
    }
    return true;
  }

  function getTabIndex(element) {
    const tabIndex = element.tabIndex;
    if (tabIndex < 0) {
      const name = element.localName;
      if (name === "details" || name === "audio" || name === "video" || element.isContentEditable) {
        return 0;
      }
    }
    return tabIndex;
  }

  function getNamedRadioInput(element) {
    return element.localName === "input" && element.type === "radio" && element.name !== ""
      ? element
      : null;
  }

  function isTabbableRadio(element, candidates) {
    const input = getNamedRadioInput(element);
    if (!input) return true;
    const group = candidates.filter((candidate) => {
      const radio = getNamedRadioInput(candidate);
      return radio && radio.name === input.name && radio.form === input.form;
    });
    const checked = group.find((radio) => radio.checked);
    return checked ? checked === input : group[0] === input;
  }

  function focusable(container) {
    return Array.from(container.querySelectorAll(CANDIDATE_SELECTOR)).filter(isFocusableElement);
  }

  function tabbable(container) {
    const candidates = focusable(container);
    return candidates.filter(
      (element) => getTabIndex(element) >= 0 && isTabbableRadio(element, candidates),
    );
  }

  function isTabbable(element) {
    return isFocusableElement(element) && getTabIndex(element) >= 0;
  }

  // FloatingFocusManager.getFirstTabbableElement: the element if it is
  // tabbable, otherwise its first tabbable child, otherwise itself.
  // (handleTabIndex is not ported: it early-returns for elements with an
  // authored tabindex, and FOCUSABLE_POPUP_PROPS always renders the dialog
  // popup with tabindex="-1" — ours is SSRd the same way and never changes.)
  function getFirstTabbableElement(container) {
    if (!container) return null;
    if (isTabbable(container)) return container;
    return tabbable(container)[0] || container;
  }

  // floating-ui-react/utils/enqueueFocus: focus lands on the next frame; a
  // newer enqueue cancels the previous one.
  let focusFrame = 0;
  function enqueueFocus(el, options = {}) {
    if (!el) return;
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      if (options.shouldFocus && !options.shouldFocus()) return;
      el.focus(options);
    });
  }

  // ----- markOthers (floating-ui-react/utils/markOthers.ts) ------------------

  // Applies aria-hidden="true" to everything outside the open dialogs, with
  // reference counting so nested opens undo cleanly. aria-live regions are
  // kept, like Base UI. (Base UI's modal dialogs use aria-hidden, not inert:
  // pointer interaction is blocked by the full-viewport backdrop.)
  const ariaHiddenCounts = new WeakMap();
  const ariaHiddenUncontrolled = new WeakSet();

  function collectOutsideElements(keepElements, stopElements) {
    const outside = [];
    const walk = (parent) => {
      if (!parent || stopElements.has(parent)) return;
      for (const node of parent.children) {
        if (node.localName === "script") continue;
        if (keepElements.has(node)) {
          walk(node);
        } else {
          outside.push(node);
        }
      }
    };
    walk(document.body);
    return outside;
  }

  function buildKeepSet(targets) {
    const keep = new Set();
    targets.forEach((target) => {
      let node = target;
      while (node && !keep.has(node)) {
        keep.add(node);
        node = node.parentElement;
      }
    });
    return keep;
  }

  function markOthers(avoidElements) {
    const controlElements = avoidElements.concat(
      Array.from(document.body.querySelectorAll("[aria-live]")),
    );
    const targets = collectOutsideElements(
      buildKeepSet(controlElements),
      new Set(controlElements),
    );
    const hiddenElements = [];

    targets.forEach((node) => {
      const attr = node.getAttribute("aria-hidden");
      const alreadyHidden = attr !== null && attr !== "false";
      const count = (ariaHiddenCounts.get(node) || 0) + 1;
      ariaHiddenCounts.set(node, count);
      hiddenElements.push(node);
      if (count === 1 && alreadyHidden) ariaHiddenUncontrolled.add(node);
      if (!alreadyHidden) node.setAttribute("aria-hidden", "true");
    });

    return () => {
      hiddenElements.forEach((node) => {
        const count = (ariaHiddenCounts.get(node) || 0) - 1;
        ariaHiddenCounts.set(node, count);
        if (count <= 0) {
          if (!ariaHiddenUncontrolled.has(node)) node.removeAttribute("aria-hidden");
          ariaHiddenUncontrolled.delete(node);
        }
      });
    };
  }

  // ----- aria wiring (useDialogTitle/-Description registration) --------------

  function wireAria(state) {
    const popup = state.popup;
    const title = popup.querySelector("[data-templ-dialog-title]");
    if (title) {
      if (!title.id) title.id = popup.id + "-title";
      popup.setAttribute("aria-labelledby", title.id);
    } else {
      popup.removeAttribute("aria-labelledby");
    }
    const description = popup.querySelector("[data-templ-dialog-description]");
    if (description) {
      if (!description.id) description.id = popup.id + "-description";
      popup.setAttribute("aria-describedby", description.id);
    } else {
      popup.removeAttribute("aria-describedby");
    }
  }

  // ----- transition lifecycle ------------------------------------------------

  // The parts that render the transition status, popup first.
  function partsOf(state) {
    return [state.popup, state.backdrop];
  }

  // ----- nested dialog bookkeeping ------------------------------------------

  // A dialog is nested when its hidden portal node was SSRd inside another
  // dialog's content — the DOM pendant of Base UI's parent DialogRootContext. The
  // relation is recorded at registration (see ensureDialog); parentOf resolves
  // it to the parent's live state.
  function parentOf(state) {
    const parentId = state.root._templParent;
    return parentId ? stateOf(parentId) : null;
  }

  function nestedOpenCount(state) {
    return openStack.filter((other) => {
      for (let p = parentOf(other); p; p = parentOf(p)) {
        if (p === state) return true;
      }
      return false;
    }).length;
  }

  function updateNestedAttributes() {
    openStack.forEach((state) => {
      const count = nestedOpenCount(state);
      state.popup.style.setProperty("--nested-dialogs", String(count));
      state.popup.toggleAttribute("data-nested-dialog-open", count > 0);
    });
  }

  function isTopmost(state) {
    return nestedOpenCount(state) === 0;
  }

  // ----- open / close --------------------------------------------------------

  function updateTriggers(state, isOpen) {
    triggersFor(state.popup).forEach((trigger) => {
      trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      trigger.toggleAttribute("data-popup-open", isOpen);
    });
  }

  function openDialog(target, trigger) {
    const state = stateOf(target);
    if (!state || state.open) return;

    const popup = state.popup;
    state.openType = trigger ? lastInteractionType || "mouse" : null;
    state.trigger =
      trigger && trigger instanceof Element ? trigger : triggersFor(popup)[0] || null;
    state.previouslyFocused = document.activeElement;

    state.open = true;
    openStack.push(state);
    updateNestedAttributes();
    startDismiss(state);

    window.templ.portal.render(state.root);
    state.root.hidden = false;

    wireAria(state);

    window.templ.transition.open(partsOf(state));

    if (isModal(state)) {
      state.releaseScroll = window.templ.scrollLock.acquire(popup);
      state.undoMarkOthers = markOthers([state.root]);
    }

    updateTriggers(state, true);

    // FloatingFocusManager initial focus: first tabbable element, or the
    // popup itself — also when opened by touch, so the virtual keyboard
    // stays closed (createDefaultInitialFocus).
    queueMicrotask(() => {
      if (!state.open) return;
      if (popup.contains(document.activeElement)) return;
      const elToFocus =
        state.openType === "touch" ? popup : tabbable(popup)[0] || popup;
      enqueueFocus(elToFocus, {
        preventScroll: elToFocus === popup,
        shouldFocus() {
          if (!state.open) return false;
          const active = document.activeElement;
          return !(active !== elToFocus && popup.contains(active));
        },
      });
    });
  }

  function closeDialog(target) {
    const state = stateOf(target);
    if (!state || !state.open) return;

    const popup = state.popup;
    state.open = false;
    state.closeType = lastInteractionType;
    stopDismiss(state);
    const index = openStack.indexOf(state);
    if (index !== -1) openStack.splice(index, 1);
    updateNestedAttributes();

    // Base UI order on open=false: the transition status flips to ending,
    // aria-hidden marking and the scroll lock release immediately, the
    // popup unmounts (and focus returns) once the exit animation finishes.
    window.templ.transition.close(partsOf(state), popup, () => {
      state.root.hidden = true;
      popup.style.removeProperty("--nested-dialogs");
      popup.removeAttribute("data-nested-dialog-open");
      returnFocus(state);
      // onOpenChangeComplete(false) pendant: fires once the exit animation
      // finished and the dialog unmounted (command.js resets its palette on
      // this).
      popup.dispatchEvent(new CustomEvent("dialog-close", { bubbles: true }));
    });
    if (state.undoMarkOthers) {
      state.undoMarkOthers();
      state.undoMarkOthers = null;
    }
    state.releaseScroll?.();
    state.releaseScroll = null;
    updateTriggers(state, false);
  }

  // FloatingFocusManager return focus: the trigger (or the previously
  // focused element for programmatic opens), resolved to its first tabbable,
  // focused without scrolling — visibly when the dialog was closed with the
  // keyboard. Focus that legitimately moved elsewhere is respected.
  function returnFocus(state) {
    const referenceReturn = state.trigger?.isConnected ? state.trigger : null;
    const previousReturn =
      state.previouslyFocused?.isConnected &&
      state.previouslyFocused.localName !== "body"
        ? state.previouslyFocused
        : null;
    const preferPreviousFocus = state.openType == null;
    const returnElement = preferPreviousFocus
      ? previousReturn || referenceReturn
      : referenceReturn || previousReturn;

    queueMicrotask(() => {
      const tabbableReturnElement = getFirstTabbableElement(returnElement);
      if (!tabbableReturnElement) return;
      const active = document.activeElement;
      const focusMovedElsewhere =
        tabbableReturnElement !== active &&
        active !== document.body &&
        !state.popup.contains(active) &&
        !state.root.contains(active);
      if (focusMovedElsewhere) return;
      const options = { preventScroll: true };
      if (state.closeType === "keyboard") options.focusVisible = true;
      tabbableReturnElement.focus(options);
    });
  }

  function isDialogOpen(target) {
    return stateOf(target)?.open || false;
  }

  function requestOpenChange(target, nextOpen, trigger) {
    const state = stateOf(target);
    if (!state || state.open === nextOpen) return false;
    const accepted = state.popup.dispatchEvent(
      new CustomEvent("dialog-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: nextOpen },
      }),
    );
    if (!accepted || state.popup.hasAttribute("data-templ-open")) return false;
    if (nextOpen) openDialog(state.popup, trigger);
    else closeDialog(state.popup);
    return true;
  }

  function toggleDialog(target, trigger) {
    requestOpenChange(target, !isDialogOpen(target), trigger);
  }

  // ----- dismissal (useDismiss, options from useDialogRoot) ------------------

  function startDismiss(state) {
    const popup = state.popup;
    state.dismiss = window.templ.dismiss.useDismiss({
      floating: popup,
      reference: triggersFor(popup),
      // A nested open dialog blocks its parent.
      escapeKey: () => isTopmost(state),
      // With a backdrop the dismissal waits for the click, so a press that
      // starts inside and is released over the backdrop never dismisses.
      // Modal is a boolean here, Base UI's "trap-focus" mode does not exist.
      outsidePressEvent: () => state.backdrop ? "intentional" : { mouse: "intentional", touch: "sloppy" },
      outsidePress(event) {
        if ("button" in event && event.button !== 0) return false;
        if ("touches" in event && event.touches.length !== 1) return false;
        if (!isTopmost(state) || popup.hasAttribute("data-templ-disable-pointer-dismissal")) return false;
        // A modal dialog closes only on its own backdrop, which supports
        // several modal dialogs that are not nested.
        if (!isModal(state)) return true;
        const target = event.target;
        if (!state.backdrop) return true;
        return target === state.backdrop ||
          (target.contains(popup) && !target.hasAttribute("data-base-ui-portal"));
      },
      onOpenChange: (open) => requestOpenChange(popup, open),
    });
  }

  function stopDismiss(state) {
    state.dismiss?.();
    state.dismiss = null;
  }

  document.addEventListener("keydown", (event) => {
    // FloatingFocusManager: prevent Tab from escaping the modal when the
    // popup has no tabbable elements (the guards would have nothing to
    // focus).
    if (event.key === "Tab") {
      const state = openStack.find(
        (other) => isModal(other) && other.popup.contains(document.activeElement),
      );
      if (state && tabbable(state.popup).length === 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  });

  // ----- initialization ------------------------------------------------------

  // FocusGuard: visually hidden tabbable sentinels around the popup; focusing
  // one wraps focus to the other end of the popup's tab cycle.
  function createFocusGuard() {
    const guard = document.createElement("span");
    guard.setAttribute("tabindex", "0");
    guard.setAttribute("aria-hidden", "true");
    guard.setAttribute("data-base-ui-focus-guard", "");
    guard.style.cssText =
      "clip-path:inset(50%);overflow:hidden;white-space:nowrap;border:0;padding:0;width:1px;height:1px;margin:-1px;position:fixed;top:0;left:0;";
    return guard;
  }

  function ensureDialog(popup) {
    if (!popup || dialogs.has(popup)) return dialogs.get(popup) || null;
    const root = popup.parentElement;

    const parentPopup = root.parentElement?.closest(POPUP);
    if (parentPopup?.id) root._templParent = parentPopup.id;

    const state = {
      root,
      popup,
      backdrop: root.querySelector(BACKDROP),
      open: false,
      trigger: null,
      previouslyFocused: null,
      openType: null,
      closeType: "",
      undoMarkOthers: null,
      releaseScroll: null,
    };
    dialogs.set(popup, state);

    // A nested dialog renders no backdrop in Base UI (DialogBackdrop's
    // enabled: !nested); the parent's backdrop keeps covering the page.
    if (root._templParent) {
      popup.setAttribute("data-nested", "");
      if (state.backdrop) state.backdrop.hidden = true;
    }

    const beforeGuard = createFocusGuard();
    const afterGuard = createFocusGuard();
    if (!isModal(state)) {
      // Non-modal dialogs do not trap focus: the guards stay out of the tab
      // order (Base UI renders different non-modal guard behavior; without a
      // React portal boundary the natural tab order is the equivalent).
      beforeGuard.setAttribute("tabindex", "-1");
      afterGuard.setAttribute("tabindex", "-1");
    }
    popup.before(beforeGuard);
    popup.after(afterGuard);
    beforeGuard.addEventListener("focus", () => {
      if (!isModal(state)) return;
      const els = tabbable(popup);
      enqueueFocus(els[els.length - 1] || popup, { preventScroll: els.length === 0 });
    });
    afterGuard.addEventListener("focus", () => {
      if (!isModal(state)) return;
      const els = tabbable(popup);
      enqueueFocus(els[0] || popup, { preventScroll: els.length === 0 });
    });

    // FloatingFocusManager restoreFocus="popup": when the focused element is
    // removed from inside the popup (e.g. an htmx swap of the dialog body),
    // focus falls back to the popup instead of escaping to <body>.
    popup.addEventListener("focusout", (event) => {
      const target = event.target;
      queueMicrotask(() => {
        if (!state.open) return;
        if (target instanceof Element && target.isConnected) return;
        if (document.activeElement === document.body) {
          popup.focus();
          requestAnimationFrame(() => {
            if (state.open && document.activeElement === document.body) popup.focus();
          });
        }
      });
    });

    wireAria(state);
    return state;
  }

  // Fully retire a dialog: undo aria-hidden marking, release the scroll
  // lock and remove the portaled DOM. Used when an htmx/datastar swap
  // removed the dialog's source from the page or replaced it with a fresh
  // hidden portal node.
  function destroyDialog(popup) {
    const state = dialogs.get(popup);
    if (!state) {
      popup.parentElement?.remove();
      return;
    }
    window.templ.transition.reset(partsOf(state), false);
    stopDismiss(state);
    if (state.undoMarkOthers) {
      state.undoMarkOthers();
      state.undoMarkOthers = null;
    }
    const index = openStack.indexOf(state);
    if (index !== -1) openStack.splice(index, 1);
    const wasOpen = state.open;
    state.open = false;
    updateNestedAttributes();
    state.releaseScroll?.();
    state.releaseScroll = null;
    if (wasOpen) popup.dispatchEvent(new CustomEvent("dialog-close", { bubbles: true }));
    state.root.remove();
    dialogs.delete(popup);
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    // Base UI's DialogTrigger identifier, shared with PopoverTrigger; only
    // triggers whose aria-controls names a dialog popup are ours.
    const trigger = event.target.closest("[data-base-ui-click-trigger][aria-controls]");
    if (trigger && dialogFor(trigger)) {
      toggleDialog(dialogFor(trigger), trigger);
      return;
    }
    const closeButton = event.target.closest("[data-templ-dialog-close]");
    if (closeButton) {
      requestOpenChange(dialogFor(closeButton), false);
    }
  });

  // A dialog lives as long as its SSR declaration site (the portal owner)
  // stays in the document, including trigger-less programmatic dialogs.
  // Unmounting retires it: aria-hidden marking, scroll lock, portaled DOM.
  window.templ.lifecycle.register(POPUP, {
    init(popup) {
      if (!ensureDialog(popup)) return;
      // Server-side open state (Base UI open or defaultOpen).
      if (popup.getAttribute("data-templ-open") === "true" || popup.hasAttribute("data-templ-default-open")) {
        openDialog(popup);
      }
    },
    destroy: destroyDialog,
  });

  window.templ = window.templ || {};
  window.templ.dialog = {
    open: openDialog,
    close: closeDialog,
    toggle: toggleDialog,
    isOpen: isDialogOpen,
  };
})();
