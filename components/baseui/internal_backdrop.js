// Port of @base-ui/react utils/InternalBackdrop.tsx (1.6.0), the backdrop a
// modal menu's or select's positioner renders while mounted: fixed over the
// viewport, before the positioner, inert while closing, with a hole over the
// cutout (the trigger) so it stays pressable. useDismiss treats it as an
// outside element (data-base-ui-inert).
(function () {
  "use strict";

  function mount(positioner, cutout) {
    remove(positioner);
    const backdrop = document.createElement("div");
    backdrop.setAttribute("role", "presentation");
    backdrop.setAttribute("data-base-ui-inert", "");
    let clipPath = "";
    if (cutout) {
      const r = cutout.getBoundingClientRect();
      clipPath = "clip-path:polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%," +
        `${r.left}px ${r.top}px,${r.left}px ${r.bottom}px,${r.right}px ${r.bottom}px,` +
        `${r.right}px ${r.top}px,${r.left}px ${r.top}px)`;
    }
    backdrop.style.cssText = "position:fixed;inset:0;user-select:none;-webkit-user-select:none;" + clipPath;
    positioner.before(backdrop);
    positioner._templBackdrop = backdrop;
  }

  // inertValue(!open): the backdrop takes no input once the close started.
  function inert(positioner) {
    if (positioner._templBackdrop) positioner._templBackdrop.inert = true;
  }

  function remove(positioner) {
    positioner._templBackdrop?.remove();
    positioner._templBackdrop = null;
  }

  window.templ = window.templ || {};
  window.templ.internalBackdrop = { mount, inert, remove };
})();
