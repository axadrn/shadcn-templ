// Pendant of FloatingPortal (@base-ui/react floating-ui-react/components/FloatingPortal.tsx).
// The popup renders into <body> while its component stays where it was
// declared. That declaration site is the portal owner, and lifecycle.js
// unmounts the portaled subtree once the owner leaves the document.
(function () {
  "use strict";

  // Appends on every open, so paint order follows open order like the
  // portal nodes React creates on mount.
  function render(element) {
    if (!element._templPortalOwner) element._templPortalOwner = element.parentElement;
    document.body.appendChild(element);
  }

  window.templ = window.templ || {};
  window.templ.portal = { render };
})();
