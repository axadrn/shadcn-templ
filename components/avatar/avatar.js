(function () {
  "use strict";

  // Fade an avatar image in once it has loaded. Until then — or if it never
  // loads — it stays transparent (opacity-0) and the fallback stacked
  // underneath shows through. CSP-safe replacement for inline handlers.
  function reveal(img) {
    img.dataset.loaded = "true";
  }

  // Images that load after this script runs.
  document.addEventListener(
    "load",
    function (e) {
      const img = e.target;
      if (img.matches && img.matches('[data-slot="avatar-image"]')) reveal(img);
    },
    true,
  );

  // Images that already loaded before this script ran.
  document.querySelectorAll('[data-slot="avatar-image"]').forEach(function (img) {
    if (img.complete && img.naturalWidth > 0) reveal(img);
  });
})();
