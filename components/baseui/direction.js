// Port of @base-ui/react internals/direction-context (1.6.0): useDirection.
// The direction comes from the nearest DirectionProvider, "ltr" without
// one, never from CSS: a dir="rtl" attribute alone changes the layout, not
// Base UI's keyboard and positioning logic. DirectionProvider renders no
// element; the parts below one carry its value as data-templ-direction (a
// context React keeps in memory), and portaled parts reach it through their
// portal owner.
//
//   window.templ.direction.useDirection(element)   "ltr" or "rtl"
(function () {
  "use strict";

  function useDirection(element) {
    for (let node = element; node; node = window.templ.portal?.treeParent(node) ?? node.parentElement) {
      const direction = node.getAttribute?.("data-templ-direction");
      if (direction) return direction === "rtl" ? "rtl" : "ltr";
    }
    return "ltr";
  }

  window.templ = window.templ || {};
  window.templ.direction = { useDirection };
})();
