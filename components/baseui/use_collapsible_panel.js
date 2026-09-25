// Port of @base-ui/react collapsible/panel/useCollapsiblePanel.ts (1.6.0), the
// panel of Collapsible and Accordion. How a panel opens and closes depends on
// its motion, read from its computed style:
// - none: open and close at once, no starting or ending style.
// - CSS transition or keyframe animation: measured to pixels, starting style
//   for one frame on open, ending style one frame after close, hidden once the
//   animations finished, then back to auto.
// The size is exposed as <prefix>-height and <prefix>-width, for example
// --collapsible-panel-height or --accordion-panel-height.
//
// Left out: hidden="until-found" with find in page, which no shadcn panel
// uses, and React.Activity.
(function () {
  "use strict";

  const transition = () => window.templ.transition;

  function getAnimationType(panel, hasSuppressedMountAnimation) {
    const style = getComputedStyle(panel);
    const nonZero = (value) => value.split(",").some((part) => Number.parseFloat(part) > 0);
    const hasAnimation = (style.animationName.split(",").some((name) => name.trim() !== "none" && name.trim() !== "") ||
      hasSuppressedMountAnimation) && nonZero(style.animationDuration);
    const hasTransition = nonZero(style.transitionDuration);
    if (hasTransition) return "css-transition";
    if (hasAnimation) return "css-animation";
    return "none";
  }

  function setDimensions(panel, prefix, dimensions) {
    const px = (value) => (value === undefined ? "auto" : value + "px");
    panel.style.setProperty(prefix + "-height", px(dimensions?.height));
    panel.style.setProperty(prefix + "-width", px(dimensions?.width));
  }

  function getDimensions(panel) {
    return { height: panel.scrollHeight, width: panel.scrollWidth };
  }

  // Resets alignment styles that distort scroll sizes while measuring.
  function measureWithoutLayoutStyles(panel) {
    const keys = ["justify-content", "align-items", "align-content", "justify-items"];
    const original = keys.map((key) => panel.style.getPropertyValue(key));
    keys.forEach((key) => panel.style.setProperty(key, "initial", "important"));
    const dimensions = getDimensions(panel);
    requestAnimationFrame(() => keys.forEach((key, i) => {
      if (original[i] === "") panel.style.removeProperty(key);
      else panel.style.setProperty(key, original[i]);
    }));
    return dimensions;
  }

  // A panel that renders open skips its keyframe mount animation until it has
  // been closed once, so the server rendered first paint does not shift.
  function mount(panel, prefix, isOpen) {
    setDimensions(panel, prefix, null);
    if (!isOpen) return;
    panel._templPreventMountAnimation = true;
    panel.style.setProperty("animation-name", "none");
  }

  // The type is read after the new state applied, since the motion classes
  // hang on data-open and data-closed, like the source's layout effect after
  // the render with the new state.
  function open(panel, prefix) {
    panel.hidden = false;
    transition().open([panel], panel, () => setDimensions(panel, prefix, null));
    const type = getAnimationType(panel, false);
    if (type === "none") {
      transition().reset([panel], true);
      setDimensions(panel, prefix, null);
      return;
    }
    setDimensions(panel, prefix, type === "css-transition" ? measureWithoutLayoutStyles(panel) : getDimensions(panel));
  }

  function close(panel, prefix) {
    const hasSuppressedMountAnimation = !!panel._templPreventMountAnimation;
    if (hasSuppressedMountAnimation) {
      panel._templPreventMountAnimation = false;
      panel.style.removeProperty("animation-name");
    }
    const unmount = () => {
      panel.hidden = true;
      setDimensions(panel, prefix, null);
    };
    transition().close([panel], panel, unmount, {
      deferEnding: true,
      onEnding() {
        const dimensions = getDimensions(panel);
        if (!dimensions.height && !dimensions.width) return false;
        setDimensions(panel, prefix, dimensions);
      },
    });
    const type = getAnimationType(panel, hasSuppressedMountAnimation);
    if (type === "none") {
      transition().reset([panel], false);
      unmount();
      return;
    }
    // Measured as soon as the close is requested, before the ending style
    // applies, so an interrupted open closes from its current size.
    setDimensions(panel, prefix, getDimensions(panel));
  }

  window.templ = window.templ || {};
  window.templ.collapsiblePanel = { mount, open, close };
})();
