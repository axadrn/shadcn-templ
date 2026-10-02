(function () {
  "use strict";

  // Port of Base UI's AvatarImage and AvatarFallback: the image mounts once
  // it loaded, the fallback unmounts then. Until it loads, or when it never
  // does, the fallback shows. Mounting is [hidden] here, the browser still
  // loads a hidden image.
  function loaded(img) {
    img.hidden = false;
    img.parentElement
      ?.querySelectorAll(':scope > [data-slot="avatar-fallback"]')
      .forEach((fallback) => (fallback.hidden = true));
  }

  // Images that load after this script runs.
  document.addEventListener(
    "load",
    (e) => {
      const img = e.target;
      if (img.matches && img.matches('[data-slot="avatar-image"]')) loaded(img);
    },
    true,
  );

  // Images that already loaded before this script ran.
  window.templ.lifecycle.register('[data-slot="avatar-image"]', {
    init(img) {
      if (img.complete && img.naturalWidth > 0) loaded(img);
    },
  });
})();
