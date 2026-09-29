// Port of @base-ui/react internals/useTransitionStatus.ts with
// useOpenChangeComplete.ts and useAnimationsFinished.ts (1.6.0).
//
// The popup and its backdrop render the status: data-open or data-closed,
// plus data-starting-style for the first frame of an open and
// data-ending-style while it closes. The positioner and the arrow render only
// data-open or data-closed (popupStateMapping), and the positioner has its
// transitions off while starting (getDisabledMountTransitionStyles) and no
// pointer events while closed (usePositioner's inert). The close
// completes once every animation on the animated element finished, which is
// when Base UI unmounts. Opening again before that cancels the pending close.
//
// status is an array of the parts that render the status, or
// { parts, positioner, stateParts }. parts[0] carries the pending status.
(function () {
  "use strict";

  function set(parts, name, present) {
    parts.forEach((part) => part?.toggleAttribute(name, present));
  }

  function resolve(status) {
    const { parts, positioner = null, stateParts = [] } = Array.isArray(status) ? { parts: status } : status;
    return { parts: parts.filter(Boolean), open: [positioner, ...stateParts].filter(Boolean), positioner };
  }

  // usePositioner's inert: a closed positioner takes no pointer events, also
  // during its exit animation. Opening only takes back that none, so a value
  // safePolygon set stays, as React leaves a style it did not render.
  function setOpen(status, isOpen) {
    const all = [...status.parts, ...status.open];
    set(all, "data-open", isOpen);
    set(all, "data-closed", !isOpen);
    const style = status.positioner?.style;
    if (!style) return;
    if (!isOpen) style.pointerEvents = "none";
    else if (style.pointerEvents === "none") style.pointerEvents = "";
  }

  // useAnimationsFinished: runs fn once every animation on the element
  // finished, as long as isCurrent() still holds. An animation aborted
  // because a property it depends on changed may be followed by a new one,
  // so check again before running fn.
  function whenAnimationsFinish(animated, isCurrent, fn) {
    const exec = () => {
      if (!isCurrent()) return;
      if (typeof animated?.getAnimations !== "function") return fn();
      Promise.all(animated.getAnimations().map((animation) => animation.finished)).then(() => {
        if (isCurrent()) fn();
      }, () => {
        const running = animated.getAnimations().some((a) => a.pending || a.playState !== "finished");
        if (running) exec();
        else if (isCurrent()) fn();
      });
    };
    // One frame, so the new style's animations are registered.
    requestAnimationFrame(exec);
  }

  // onComplete, when given, runs once the open animations on animated
  // finished (useOpenChangeComplete with open true).
  function open(statusParam, animated, onComplete) {
    const status = resolve(statusParam);
    const { parts, positioner } = status;
    const main = parts[0];
    const token = {};
    main._templTransition = token;
    set(parts, "data-ending-style", false);
    setOpen(status, true);
    set(parts, "data-starting-style", true);
    if (positioner) positioner.style.transition = "none";
    // Compute the starting style once, so transitions start from it.
    void main.offsetWidth;
    requestAnimationFrame(() => {
      if (main._templTransition !== token) return;
      set(parts, "data-starting-style", false);
      if (positioner) positioner.style.transition = "";
      if (onComplete) whenAnimationsFinish(animated, () => main._templTransition === token, onComplete);
    });
  }

  // deferEnding sets data-ending-style one frame after data-closed, Base UI's
  // deferEndingState, and calls onEnding then. onEnding returning false
  // completes the close at once.
  function close(statusParam, animated, onComplete, { deferEnding = false, onEnding } = {}) {
    const status = resolve(statusParam);
    const { parts, positioner } = status;
    const main = parts[0];
    const token = {};
    main._templTransition = token;
    set(parts, "data-starting-style", false);
    if (positioner) positioner.style.transition = "";
    setOpen(status, false);

    const done = () => {
      if (main._templTransition !== token) return;
      main._templTransition = null;
      set(parts, "data-ending-style", false);
      onComplete?.();
    };
    const ending = () => {
      set(parts, "data-ending-style", true);
      if (onEnding?.() === false) return done();
      whenAnimationsFinish(animated, () => main._templTransition === token, done);
    };
    if (!deferEnding) return ending();
    requestAnimationFrame(() => {
      if (main._templTransition === token) ending();
    });
  }

  // Sets the state without a transition, like an unmount without exit
  // animation, and cancels one in flight.
  function reset(statusParam, isOpen) {
    const status = resolve(statusParam);
    status.parts[0]._templTransition = null;
    set(status.parts, "data-starting-style", false);
    set(status.parts, "data-ending-style", false);
    if (status.positioner) status.positioner.style.transition = "";
    setOpen(status, isOpen);
  }

  // Whether a close is in flight, Base UI's transitionStatus === "ending".
  function isEnding(element) {
    return !!element?.hasAttribute("data-ending-style");
  }

  // useAnimationsFinished on its own, for parts whose status another store
  // drives, like the toast manager.
  function animationsFinished(element, fn) {
    whenAnimationsFinish(element, () => element.isConnected, fn);
  }

  window.templ = window.templ || {};
  window.templ.transition = { open, close, reset, isEnding, animationsFinished };
})();
