// Pendant of React mount and unmount. A Base UI part mounts when React renders
// it and unmounts when React removes it, and a portaled part stays mounted as
// long as the element that rendered it. Here one MutationObserver does that
// for every component: init(el) runs once when an element matching the
// selector appears, destroy(el) once when it is gone.
(function () {
  "use strict";

  const components = [];

  // A portaled subtree lives as long as its declaration site (portal owner),
  // like React unmounts a portal with the component that rendered it.
  function mounted(el) {
    if (!el.isConnected) return false;
    for (let node = el; node; node = node.parentElement) {
      if (node._templPortalOwner && !mounted(node._templPortalOwner)) return false;
    }
    return true;
  }

  function sync(component) {
    for (const el of component.elements) {
      if (mounted(el)) continue;
      component.elements.delete(el);
      component.destroy?.(el);
    }
    for (const el of document.querySelectorAll(component.selector)) {
      if (component.elements.has(el) || !mounted(el)) continue;
      component.elements.add(el);
      component.init?.(el);
    }
  }

  // register(selector, { init, destroy }) wires every matching element that
  // is in the document now and every one that appears later.
  function register(selector, { init, destroy } = {}) {
    const component = { selector, init, destroy, elements: new Set() };
    components.push(component);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => sync(component));
    else sync(component);
  }

  new MutationObserver(() => components.forEach(sync))
    .observe(document.documentElement, { childList: true, subtree: true });

  window.templ = window.templ || {};
  window.templ.lifecycle = { register };
})();
