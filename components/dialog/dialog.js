(function () {
  "use strict";

  // Vanilla port of Base UI's Dialog (packages/react/src/dialog): the portal
  // node, backdrop and popup are SSRd divs. The script wires the blocks in
  // components/baseui (portal, transition status, dismiss, focus manager,
  // scroll lock) the way DialogRoot and DialogPopup use them. "Unmount" is
  // the portal node getting [hidden] again.

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
      element.getAttribute("data-templ-controls") || element.getAttribute("data-templ-dialog-close");
    if (id) return getDialog(id);
    return getDialog(element);
  }

  function triggersFor(popup) {
    if (!popup.id) return [];
    return document.querySelectorAll(
      '[data-base-ui-click-trigger][data-templ-controls="' + popup.id + '"]',
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

  // DialogTrigger renders aria-controls while the popup is open
  // (triggerPopupId).
  function updateTriggers(state, isOpen) {
    triggersFor(state.popup).forEach((trigger) => {
      trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      trigger.toggleAttribute("data-popup-open", isOpen);
      if (isOpen) trigger.setAttribute("aria-controls", state.popup.id);
      else trigger.removeAttribute("aria-controls");
    });
  }

  // DialogPortal renders an InternalBackdrop for a modal dialog while it is
  // mounted: fixed over the viewport, inert while closing, and useDismiss
  // treats it as a backdrop.
  function createInternalBackdrop() {
    const backdrop = document.createElement("div");
    backdrop.setAttribute("role", "presentation");
    backdrop.setAttribute("data-base-ui-inert", "");
    backdrop.style.cssText = "position:fixed;inset:0;user-select:none;-webkit-user-select:none";
    return backdrop;
  }

  function openDialog(target, trigger) {
    const state = stateOf(target);
    if (!state || state.open) return;

    const popup = state.popup;
    state.openType = trigger ? lastInteractionType || "mouse" : null;
    state.trigger =
      trigger && trigger instanceof Element ? trigger : triggersFor(popup)[0] || null;

    state.open = true;
    openStack.push(state);
    updateNestedAttributes();
    startDismiss(state);

    window.templ.portal.render(state.root);
    state.root.hidden = false;
    if (isModal(state)) {
      state.internalBackdrop ??= createInternalBackdrop();
      state.internalBackdrop.inert = false;
      state.root.prepend(state.internalBackdrop);
    }

    wireAria(state);

    window.templ.transition.open(partsOf(state));

    if (isModal(state)) {
      state.releaseScroll = window.templ.scrollLock.acquire(popup);
    }

    updateTriggers(state, true);

    // DialogPopup's FloatingFocusManager, mounted until the exit animation
    // finished. Opened by touch the popup takes focus, so the virtual
    // keyboard stays closed (createDefaultInitialFocus).
    if (state.focus) {
      state.focus.open();
    } else {
      state.focus = window.templ.focusManager.useFloatingFocusManager({
        floating: popup,
        reference: state.trigger,
        triggers: triggersFor(popup),
        modal: isModal(state),
        openInteractionType: state.openType,
        initialFocus: (interactionType) => (interactionType === "touch" ? popup : true),
        restoreFocus: "popup",
        closeOnFocusOut: !popup.hasAttribute("data-templ-disable-pointer-dismissal"),
        onOpenChange: (open) => requestOpenChange(popup, open),
      });
    }
  }

  function closeDialog(target) {
    const state = stateOf(target);
    if (!state || !state.open) return;

    const popup = state.popup;
    state.open = false;
    stopDismiss(state);
    const index = openStack.indexOf(state);
    if (index !== -1) openStack.splice(index, 1);
    updateNestedAttributes();

    // Base UI order on open=false: the transition status flips to ending,
    // aria-hidden marking and the scroll lock release immediately, the
    // popup unmounts (and focus returns) once the exit animation finishes.
    state.focus?.close();
    if (state.internalBackdrop) state.internalBackdrop.inert = true;
    window.templ.transition.close(partsOf(state), popup, () => {
      state.root.hidden = true;
      popup.style.removeProperty("--nested-dialogs");
      popup.removeAttribute("data-nested-dialog-open");
      // Unmounting the focus manager returns focus.
      state.focus?.unmount();
      state.focus = null;
      state.internalBackdrop?.remove();
      // onOpenChangeComplete(false) pendant: fires once the exit animation
      // finished and the dialog unmounted (command.js resets its palette on
      // this).
      popup.dispatchEvent(new CustomEvent("dialog-close", { bubbles: true }));
    });
    state.releaseScroll?.();
    state.releaseScroll = null;
    updateTriggers(state, false);
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
      outsidePressEvent: () => (state.internalBackdrop?.isConnected || state.backdrop) ? "intentional" : { mouse: "intentional", touch: "sloppy" },
      outsidePress(event) {
        if ("button" in event && event.button !== 0) return false;
        if ("touches" in event && event.touches.length !== 1) return false;
        if (!isTopmost(state) || popup.hasAttribute("data-templ-disable-pointer-dismissal")) return false;
        // A modal dialog closes only on its own backdrop, which supports
        // several modal dialogs that are not nested.
        if (!isModal(state)) return true;
        const target = event.target;
        const internalBackdrop = state.internalBackdrop?.isConnected ? state.internalBackdrop : null;
        if (!state.backdrop && !internalBackdrop) return true;
        return target === state.backdrop || target === internalBackdrop ||
          (target.contains(popup) && !target.hasAttribute("data-base-ui-portal"));
      },
      onOpenChange: (open) => requestOpenChange(popup, open),
    });
  }

  function stopDismiss(state) {
    state.dismiss?.();
    state.dismiss = null;
  }

  // ----- initialization ------------------------------------------------------

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
      openType: null,
      focus: null,
      internalBackdrop: null,
      releaseScroll: null,
    };
    dialogs.set(popup, state);

    // A nested dialog renders no backdrop in Base UI (DialogBackdrop's
    // enabled: !nested); the parent's backdrop keeps covering the page.
    if (root._templParent) {
      popup.setAttribute("data-nested", "");
      if (state.backdrop) state.backdrop.hidden = true;
    }

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
    state.focus?.unmount();
    state.focus = null;
    const index = openStack.indexOf(state);
    if (index !== -1) openStack.splice(index, 1);
    const wasOpen = state.open;
    state.open = false;
    updateNestedAttributes();
    state.releaseScroll?.();
    state.releaseScroll = null;
    if (wasOpen) popup.dispatchEvent(new CustomEvent("dialog-close", { bubbles: true }));
    window.templ.portal.remove(state.root);
    dialogs.delete(popup);
  }

  // DialogTrigger's useClick with its default click event. Base UI's
  // DialogTrigger identifier is shared with PopoverTrigger and DrawerTrigger;
  // only triggers whose data-templ-controls names a dialog popup are ours.
  window.templ.lifecycle.register("[data-base-ui-click-trigger][data-templ-controls]", {
    init(trigger) {
      if (!dialogFor(trigger)) return;
      trigger._templDialogClick = window.templ.click.useClick(trigger, {
        isOpen: () => isDialogOpen(dialogFor(trigger)),
        onOpenChange: (nextOpen) => requestOpenChange(dialogFor(trigger), nextOpen, trigger),
      });
    },
    destroy(trigger) {
      trigger._templDialogClick?.();
      trigger._templDialogClick = null;
    },
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
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
