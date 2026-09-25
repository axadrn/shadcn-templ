// Port of @base-ui/react internals/useTransitionStatus.ts with
// useOpenChangeComplete.ts and useAnimationsFinished.ts (1.6.0).
//
// A popup's parts (positioner, popup, arrow, backdrop) render the same status:
// data-open or data-closed, plus data-starting-style for the first frame of an
// open and data-ending-style while it closes. The close completes once every
// animation on the animated element finished, which is when Base UI unmounts.
// Opening again before that cancels the pending close.
(function () {
  "use strict";

  function set(parts, name, present) {
    parts.forEach((part) => part?.toggleAttribute(name, present));
  }

  // parts[0] carries the pending status, so an open cancels a close in flight.
  function open(parts) {
    const main = parts[0];
    const token = {};
    main._templTransition = token;
    set(parts, "data-closed", false);
    set(parts, "data-ending-style", false);
    set(parts, "data-open", true);
    set(parts, "data-starting-style", true);
    // Compute the starting style once, so transitions start from it.
    void main.offsetWidth;
    requestAnimationFrame(() => {
      if (main._templTransition === token) set(parts, "data-starting-style", false);
    });
  }

  function close(parts, animated, onComplete) {
    const main = parts[0];
    const token = {};
    main._templTransition = token;
    set(parts, "data-open", false);
    set(parts, "data-starting-style", false);
    set(parts, "data-closed", true);
    set(parts, "data-ending-style", true);

    const done = () => {
      if (main._templTransition !== token) return;
      main._templTransition = null;
      set(parts, "data-ending-style", false);
      onComplete?.();
    };
    // An animation aborted because a property it depends on changed may be
    // followed by a new one, so check again before completing.
    const exec = () => {
      if (main._templTransition !== token) return;
      if (typeof animated?.getAnimations !== "function") return done();
      Promise.all(animated.getAnimations().map((animation) => animation.finished)).then(done, () => {
        const running = animated.getAnimations().some((a) => a.pending || a.playState !== "finished");
        if (running) exec();
        else done();
      });
    };
    // One frame, so the ending style's animations are registered.
    requestAnimationFrame(exec);
  }

  // Sets the state without a transition, like an unmount without exit
  // animation, and cancels one in flight.
  function reset(parts, isOpen) {
    parts[0]._templTransition = null;
    set(parts, "data-starting-style", false);
    set(parts, "data-ending-style", false);
    set(parts, "data-open", isOpen);
    set(parts, "data-closed", !isOpen);
  }

  // Whether a close is in flight, Base UI's transitionStatus === "ending".
  function isEnding(element) {
    return !!element?.hasAttribute("data-ending-style");
  }

  window.templ = window.templ || {};
  window.templ.transition = { open, close, reset, isEnding };
})();
