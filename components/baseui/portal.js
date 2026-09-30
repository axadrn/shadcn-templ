// Port of @base-ui/react floating-ui-react/components/FloatingPortal.tsx (1.6.0).
//
// render(node) moves a [data-base-ui-portal] node to its container while its
// component stays where it was declared. That declaration site is the portal
// owner, and lifecycle.js unmounts the portaled subtree once the owner leaves
// the document. The container is the portal node of an enclosing portal, or
// <body> (useFloatingPortalNode). remove(node) unmounts it with its guards.
//
// setFocusManagerState(node, state) is the source's portal context: a non
// modal focus manager inside the node gets the outside guards at the
// declaration site, which move Tab between the trigger and the portaled
// content, and the node's tabbables are taken out of the tab order while
// focus is outside of it.
(function () {
  "use strict";

  let uid = 0;
  const t = () => window.templ.tabbable;

  // The React tree pendant: the parent of a portal node is where it was
  // declared, of every other node its DOM parent.
  function treeParent(node) {
    return node._templPortalOwner || node.parentNode;
  }

  function containerFor(node) {
    return node._templPortalOwner?.closest("[data-base-ui-portal]") || document.body;
  }

  // Appends on every open, so paint order follows open order like the
  // portal nodes React creates on mount.
  function render(node) {
    if (!node._templPortalOwner) node._templPortalOwner = node.parentElement;
    if (!node.id) node.id = "templ-portal-" + ++uid;
    containerFor(node).appendChild(node);
  }

  function remove(node) {
    if (!node) return;
    setFocusManagerState(node, null);
    if (node.isConnected) node.remove();
  }

  // Tabbables inside the node count only once focus entered it, through an
  // outside guard or a pointer.
  function onFocus(event) {
    const node = event.currentTarget;
    if (!event.relatedTarget || !t().isOutsideEvent(event)) return;
    if (event.type === "focusin") {
      if (node._templFocusInsideDisabled) {
        t().enableFocusInside(node);
        node._templFocusInsideDisabled = false;
      }
    } else {
      t().disableFocusInside(node);
      node._templFocusInsideDisabled = true;
    }
  }

  function createOutsideGuards(node) {
    const { createFocusGuard } = window.templ.focusManager;
    const state = () => node._templFocusState;
    const beforeOutside = createFocusGuard("outside", (event) => {
      if (t().isOutsideEvent(event, node)) {
        state()?.beforeInside?.focus();
      } else {
        const domReference = state()?.domReference;
        if (domReference) t().getPreviousTabbable(domReference)?.focus();
      }
    });
    const afterOutside = createFocusGuard("outside", (event) => {
      if (t().isOutsideEvent(event, node)) {
        state()?.afterInside?.focus();
      } else {
        const domReference = state()?.domReference;
        if (domReference) t().getNextTabbable(domReference)?.focus();
        if (state()?.closeOnFocusOut) state()?.onOpenChange?.(false, "focus-out", event);
      }
    });
    const owns = document.createElement("span");
    owns.setAttribute("aria-owns", node.id);
    owns.style.cssText = "clip-path:inset(50%);position:fixed;top:0;left:0";
    node._templPortalOwner?.before(beforeOutside, owns, afterOutside);
    return { beforeOutside, afterOutside, owns };
  }

  function setFocusManagerState(node, state) {
    if (!node) return;
    node._templFocusState = state;
    const nonModal = !!state && !state.modal;

    if (nonModal && !node._templFocusListening) {
      node.addEventListener("focusin", onFocus, true);
      node.addEventListener("focusout", onFocus, true);
      node._templFocusListening = true;
    } else if (!nonModal && node._templFocusListening) {
      node.removeEventListener("focusin", onFocus, true);
      node.removeEventListener("focusout", onFocus, true);
      node._templFocusListening = false;
    }
    // Tabbable again before the focus manager's queued initial focus runs.
    if (state?.open && node._templFocusInsideDisabled) {
      t().enableFocusInside(node);
      node._templFocusInsideDisabled = false;
    }

    const shouldRenderGuards = nonModal && state.open;
    if (shouldRenderGuards && !node._templPortalGuards) {
      node._templPortalGuards = createOutsideGuards(node);
    } else if (!shouldRenderGuards && node._templPortalGuards) {
      const { beforeOutside, afterOutside, owns } = node._templPortalGuards;
      beforeOutside.remove();
      owns.remove();
      afterOutside.remove();
      node._templPortalGuards = null;
    }
  }

  window.templ = window.templ || {};
  window.templ.portal = { render, remove, setFocusManagerState, treeParent };
})();
