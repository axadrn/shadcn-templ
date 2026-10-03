// Port of @base-ui/react toast 1.6.0 (createToastManager, store, Provider,
// Viewport, Root, Content, Title, Description, Action, Close) with shadcn's
// Toaster and ToastList: the Toaster's templates render each toast.
(function () {
  "use strict";

  const VIEWPORT = '[data-slot="toast-viewport"]';

  const SWIPE_THRESHOLD = 40;
  const REVERSE_CANCEL_THRESHOLD = 10;
  const OPPOSITE_DIRECTION_DAMPING_FACTOR = 0.5;
  const MIN_DRAG_THRESHOLD = 1;
  const TOAST_SWIPE_IGNORE_SELECTOR = "[data-base-ui-swipe-ignore],[data-swipe-ignore]";
  // ToastRoot's default swipeDirection.
  const swipeDirections = ["down", "right"];

  let counter = 0;
  function generateId(prefix) {
    counter += 1;
    return `${prefix}-${Math.random().toString(36).slice(2, 6)}-${counter}`;
  }

  const isFocusVisible = (element) => {
    if (!element) return false;
    try {
      return element.matches(":focus-visible");
    } catch {
      return true;
    }
  };
  const contains = (parent, child) => !!parent && !!child && parent.contains(child);

  function createTimeout() {
    let id = 0;
    return {
      start(delay, fn) {
        clearTimeout(id);
        id = setTimeout(fn, delay);
      },
      clear() {
        clearTimeout(id);
      },
    };
  }

  // ----- createToastManager -------------------------------------------------

  function createToastManager() {
    const listeners = new Set();
    function emit(data) {
      listeners.forEach((listener) => listener(data));
    }
    return {
      " subscribe"(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      add(options) {
        const id = options.id || generateId("toast");
        emit({ action: "add", options: { ...options, id, transitionStatus: "starting" } });
        return id;
      },
      close(id) {
        emit({ action: "close", options: { id } });
      },
      update(id, updates) {
        emit({ action: "update", options: { ...updates, id } });
      },
      promise(promiseValue, options) {
        let handledPromise = promiseValue;
        emit({
          action: "promise",
          options: {
            ...options,
            promise: promiseValue,
            setPromise(promise) {
              handledPromise = promise;
            },
          },
        });
        return handledPromise;
      },
    };
  }

  function resolvePromiseOptions(options, result) {
    if (typeof options === "string") return { description: options };
    if (typeof options === "function") {
      const resolvedOptions = options(result);
      return typeof resolvedOptions === "string" ? { description: resolvedOptions } : resolvedOptions;
    }
    return options;
  }

  // ----- store --------------------------------------------------------------

  function createToastMetadata(toasts) {
    const metadata = new Map();
    let visibleIndex = 0;
    let offsetY = 0;
    toasts.forEach((toast, toastIndex) => {
      const isEnding = toast.transitionStatus === "ending";
      metadata.set(toast.id, { value: toast, domIndex: toastIndex, visibleIndex: isEnding ? -1 : visibleIndex, offsetY });
      offsetY += toast.height || 0;
      if (!isEnding) visibleIndex += 1;
    });
    return metadata;
  }

  // Marks the active (non-ending) toasts beyond limit as limited, newest
  // first.
  function applyLimited(toasts, limit) {
    let activeIndex = 0;
    return toasts.map((toast) => {
      if (toast.transitionStatus === "ending") return toast;
      const limited = activeIndex >= limit;
      activeIndex += 1;
      return toast.limited === limited ? toast : { ...toast, limited };
    });
  }

  const selectors = {
    toast: (state, id) => state.toastMetadata.get(id)?.value,
    toastIndex: (state, id) => state.toastMetadata.get(id)?.domIndex ?? -1,
    toastOffsetY: (state, id) => state.toastMetadata.get(id)?.offsetY ?? 0,
    toastVisibleIndex: (state, id) => state.toastMetadata.get(id)?.visibleIndex ?? -1,
    isEmpty: (state) => state.toasts.length === 0,
    expanded: (state) => state.hovering || state.focused,
    expandedOrOutOfFocus: (state) => state.hovering || state.focused || !state.isWindowFocused,
  };

  class ToastStore {
    timers = new Map();
    areTimersPaused = false;

    constructor(initialState, onChange) {
      this.state = { ...initialState, toastMetadata: createToastMetadata(initialState.toasts) };
      this.onChange = onChange;
    }

    set(key, value) {
      this.update({ [key]: value });
    }

    update(updates) {
      this.state = { ...this.state, ...updates };
      this.onChange();
    }

    setFocused(focused) {
      this.set("focused", focused);
    }

    setHovering(hovering) {
      this.set("hovering", hovering);
    }

    setIsWindowFocused(isWindowFocused) {
      this.set("isWindowFocused", isWindowFocused);
    }

    setPrevFocusElement(prevFocusElement) {
      this.set("prevFocusElement", prevFocusElement);
    }

    removeToast(toastId, behavior = {}) {
      const index = selectors.toastIndex(this.state, toastId);
      if (index === -1) return;
      const toast = this.state.toasts[index];
      if (!behavior.skipOnRemove) toast?.onRemove?.();
      const newToasts = [...this.state.toasts];
      newToasts.splice(index, 1);
      this.setToasts(newToasts);
    }

    addToast = (toast) => {
      const { timeout, limit } = this.state;
      const id = toast.id || generateId("toast");
      if (toast.id) {
        const existingToast = selectors.toast(this.state, toast.id);
        if (existingToast) {
          if (existingToast.transitionStatus === "ending") {
            this.removeToast(toast.id, { skipOnRemove: true });
          } else {
            const { id: ignoredId, transitionStatus: ignoredTransitionStatus, ...updates } = toast;
            this.updateToastInternal(toast.id, updates, { resetTimer: true, markUpdated: true });
            return toast.id;
          }
        }
      }
      const toastToAdd = { ...toast, id, updateKey: 0, transitionStatus: "starting" };
      const updatedToasts = [toastToAdd, ...this.state.toasts];
      this.setToasts(applyLimited(updatedToasts, limit));
      const duration = toastToAdd.timeout ?? timeout;
      if (toastToAdd.type !== "loading" && duration > 0) {
        this.scheduleTimer(id, duration, () => this.closeToast(id));
      }
      if (selectors.expandedOrOutOfFocus(this.state)) this.pauseTimers();
      return id;
    };

    updateToast = (id, updates) => {
      this.updateToastInternal(id, updates, { markUpdated: true });
    };

    updateToastInternal = (id, updates, behavior = {}) => {
      const { timeout, toasts } = this.state;
      const prevToast = selectors.toast(this.state, id) ?? null;
      if (!prevToast) return;
      // Ignore updates for toasts that are already closing.
      if (prevToast.transitionStatus === "ending") return;
      const nextToast = {
        ...prevToast,
        ...updates,
        ...(behavior.markUpdated && { updateKey: (prevToast.updateKey ?? 0) + 1 }),
      };
      this.setToasts(toasts.map((toast) => (toast.id === id ? nextToast : toast)));
      const nextTimeout = nextToast.timeout ?? timeout;
      const prevTimeout = prevToast?.timeout ?? timeout;
      const timeoutUpdated = Object.hasOwn(updates, "timeout");
      const shouldHaveTimer = nextToast.transitionStatus !== "ending" && nextToast.type !== "loading" && nextTimeout > 0;
      const hasTimer = this.timers.has(id);
      const timeoutChanged = prevTimeout !== nextTimeout;
      const wasLoading = prevToast?.type === "loading";
      if (!shouldHaveTimer && hasTimer) {
        this.clearTimer(id);
        return;
      }
      if (shouldHaveTimer && (!hasTimer || timeoutChanged || timeoutUpdated || wasLoading || behavior.resetTimer)) {
        this.clearTimer(id);
        this.scheduleTimer(id, nextTimeout, () => this.closeToast(id));
        if (selectors.expandedOrOutOfFocus(this.state)) this.pauseTimers();
      }
    };

    closeToast = (toastId) => {
      const closeAll = toastId === undefined;
      const { limit, toasts } = this.state;
      let toastsToClose;
      if (closeAll) {
        toastsToClose = toasts;
        this.clearTimers();
      } else {
        const toast = selectors.toast(this.state, toastId);
        if (!toast) return;
        toastsToClose = [toast];
        this.clearTimer(toastId);
      }
      const endingToasts = toasts.map((item) =>
        closeAll || item.id === toastId ? { ...item, transitionStatus: "ending", height: 0 } : item,
      );
      const newToasts = applyLimited(endingToasts, limit);
      const updates = { toasts: newToasts, toastMetadata: createToastMetadata(newToasts) };
      const hasActiveToasts = newToasts.some((toast) => toast.transitionStatus !== "ending");
      if (!hasActiveToasts) {
        updates.hovering = false;
        updates.focused = false;
      }
      this.update(updates);
      toastsToClose.forEach((toast) => {
        if (toast.transitionStatus !== "ending") toast.onClose?.();
      });
      this.handleFocusManagement(toastId);
    };

    promiseToast = (promiseValue, options) => {
      // Create a loading toast (which does not auto-dismiss).
      const loadingOptions = resolvePromiseOptions(options.loading);
      const id = this.addToast({ ...loadingOptions, type: "loading" });
      const handledPromise = promiseValue
        .then((result) => {
          const successOptions = resolvePromiseOptions(options.success, result);
          this.updateToast(id, { ...successOptions, type: "success", timeout: successOptions.timeout });
          return result;
        })
        .catch((error) => {
          const errorOptions = resolvePromiseOptions(options.error, error);
          this.updateToast(id, { ...errorOptions, type: "error", timeout: errorOptions.timeout });
          return Promise.reject(error);
        });
      if ({}.hasOwnProperty.call(options, "setPromise")) options.setPromise(handledPromise);
      return handledPromise;
    };

    pauseTimers() {
      if (this.areTimersPaused) return;
      this.areTimersPaused = true;
      this.timers.forEach((timer) => {
        if (timer.timeout) {
          timer.timeout.clear();
          const elapsed = Date.now() - timer.start;
          const remaining = timer.delay - elapsed;
          timer.remaining = remaining > 0 ? remaining : 0;
        }
      });
    }

    resumeTimers() {
      if (!this.areTimersPaused) return;
      this.areTimersPaused = false;
      this.timers.forEach((timer, id) => {
        timer.remaining = timer.remaining > 0 ? timer.remaining : timer.delay;
        timer.timeout ??= createTimeout();
        timer.timeout.start(timer.remaining, () => {
          this.handleTimerFired(id);
          timer.callback();
        });
        timer.start = Date.now();
      });
    }

    restoreFocusToPrevElement() {
      this.state.prevFocusElement?.focus({ preventScroll: true });
    }

    handleDocumentPointerDown = (event) => {
      if (event.pointerType !== "touch") return;
      if (contains(this.state.viewport, event.target)) return;
      // Explicit touch activity outside the viewport ends the paused state.
      this.resumeTimers();
      this.update({ hovering: false, focused: false });
    };

    scheduleTimer(id, delay, callback) {
      const start = Date.now();
      const shouldStartActive = !selectors.expandedOrOutOfFocus(this.state);
      const currentTimeout = shouldStartActive ? createTimeout() : undefined;
      currentTimeout?.start(delay, () => {
        this.handleTimerFired(id);
        callback();
      });
      this.timers.set(id, { timeout: currentTimeout, start: shouldStartActive ? start : 0, delay, remaining: delay, callback });
    }

    clearTimers() {
      this.timers.forEach((timer) => timer.timeout?.clear());
      this.timers.clear();
      this.areTimersPaused = false;
    }

    clearTimer(id) {
      this.timers.get(id)?.timeout?.clear();
      this.timers.delete(id);
      this.resetPausedStateIfNoTimersRemain();
    }

    handleTimerFired(id) {
      this.timers.delete(id);
      this.resetPausedStateIfNoTimersRemain();
    }

    resetPausedStateIfNoTimersRemain() {
      if (this.timers.size === 0) this.areTimersPaused = false;
    }

    setToasts(newToasts) {
      const updates = { toasts: newToasts, toastMetadata: createToastMetadata(newToasts) };
      if (newToasts.length === 0) {
        updates.hovering = false;
        updates.focused = false;
      }
      this.update(updates);
    }

    handleFocusManagement(toastId) {
      const activeEl = document.activeElement;
      if (!this.state.viewport || !contains(this.state.viewport, activeEl) || !isFocusVisible(activeEl)) return;
      if (toastId === undefined) {
        this.restoreFocusToPrevElement();
        return;
      }
      const toasts = this.state.toasts;
      const currentIndex = selectors.toastIndex(this.state, toastId);
      let nextToast = null;
      // Try to find the next toast that isn't animating out
      let index = currentIndex + 1;
      while (index < toasts.length) {
        if (toasts[index].transitionStatus !== "ending") {
          nextToast = toasts[index];
          break;
        }
        index += 1;
      }
      // Go backwards if no next toast is found
      if (!nextToast) {
        index = currentIndex - 1;
        while (index >= 0) {
          if (toasts[index].transitionStatus !== "ending") {
            nextToast = toasts[index];
            break;
          }
          index -= 1;
        }
      }
      if (nextToast) nextToast.ref?.current?.focus();
      else this.restoreFocusToPrevElement();
    }
  }

  // ----- ToastRoot ----------------------------------------------------------

  function applyDirectionalDamping(deltaX, deltaY) {
    const damp = (d) => (d > 0 ? d ** OPPOSITE_DIRECTION_DAMPING_FACTOR : -(Math.abs(d) ** OPPOSITE_DIRECTION_DAMPING_FACTOR));
    let newDeltaX = deltaX;
    let newDeltaY = deltaY;
    if (!swipeDirections.includes("left") && !swipeDirections.includes("right")) {
      newDeltaX = damp(deltaX);
    } else {
      if (!swipeDirections.includes("right") && deltaX > 0) newDeltaX = damp(deltaX);
      if (!swipeDirections.includes("left") && deltaX < 0) newDeltaX = damp(deltaX);
    }
    if (!swipeDirections.includes("up") && !swipeDirections.includes("down")) {
      newDeltaY = damp(deltaY);
    } else {
      if (!swipeDirections.includes("down") && deltaY > 0) newDeltaY = damp(deltaY);
      if (!swipeDirections.includes("up") && deltaY < 0) newDeltaY = damp(deltaY);
    }
    return { x: newDeltaX, y: newDeltaY };
  }

  function getDisplacement(direction, deltaX, deltaY) {
    switch (direction) {
      case "up":
        return -deltaY;
      case "down":
        return deltaY;
      case "left":
        return -deltaX;
      case "right":
        return deltaX;
      default:
        return 0;
    }
  }

  function getElementTransform(element) {
    const transform = getComputedStyle(element).transform;
    let translateX = 0;
    let translateY = 0;
    let scale = 1;
    if (transform && transform !== "none") {
      const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
      if (matrix) {
        const values = matrix[1].split(", ").map(parseFloat);
        if (values.length === 6) {
          translateX = values[4];
          translateY = values[5];
          scale = Math.sqrt(values[0] * values[0] + values[1] * values[1]);
        } else if (values.length === 16) {
          translateX = values[12];
          translateY = values[13];
          scale = values[0];
        }
      }
    }
    return { x: translateX, y: translateY, scale };
  }

  // Mounts one toast of ToastList from the Toaster's template. The element
  // keeps ToastRoot's React state.
  function mountToast(provider, toast) {
    const { store, portal } = provider;
    const el = portal.querySelector("template[data-templ-toast-list]").content.firstElementChild.cloneNode(true);
    const content = el.querySelector('[data-slot="toast-content"]');
    const title = el.querySelector('[data-slot="toast-title"]');
    const description = el.querySelector('[data-slot="toast-description"]');
    const action = el.querySelector('[data-slot="toast-action"]');
    const close = el.querySelector('[data-slot="toast-close"]');
    const r = {
      id: toast.id,
      el,
      content,
      title,
      description,
      action,
      close,
      titleText: title.parentElement,
      icon: null,
      iconType: undefined,
      titleId: undefined,
      descriptionId: undefined,
      ownTitleId: "base-ui-" + generateId("toast-title"),
      ownDescriptionId: "base-ui-" + generateId("toast-description"),
      closeHasFocus: false,
      isSwiping: false,
      isRealSwipe: false,
      currentSwipeDirection: undefined,
      dragDismissed: false,
      dragOffset: { x: 0, y: 0 },
      initialTransform: { x: 0, y: 0, scale: 1 },
      lockedDirection: null,
      dragStartPos: { x: 0, y: 0 },
      intendedSwipeDirection: undefined,
      maxSwipeDisplacement: 0,
      cancelledSwipe: false,
      swipeCancelBaseline: { x: 0, y: 0 },
      isFirstPointerMove: false,
      activePointerId: null,
      dragAbortController: null,
      ending: false,
    };
    title.remove();
    description.remove();
    action.remove();
    const toastOf = () => selectors.toast(store.state, r.id);

    // recalculateHeight
    r.recalculateHeight = () => {
      const previousHeight = el.style.height;
      el.style.height = "auto";
      const height = el.offsetHeight;
      el.style.height = previousHeight;
      const current = toastOf();
      if (!current) return;
      store.updateToastInternal(r.id, {
        ref: { current: el },
        height,
        ...(current.transitionStatus === "starting" ? { transitionStatus: undefined } : {}),
      });
    };

    const setDragOffset = (next) => {
      r.dragOffset = next;
    };

    const handleSwipeEnd = (event) => {
      if (event.pointerId !== r.activePointerId) return;
      r.activePointerId = null;
      r.dragAbortController?.abort();
      r.dragAbortController = null;
      r.isSwiping = false;
      r.isRealSwipe = false;
      r.lockedDirection = null;
      const resolvedInitialTransform = r.initialTransform;
      if (event.type === "pointercancel" || r.cancelledSwipe) {
        setDragOffset({ x: resolvedInitialTransform.x, y: resolvedInitialTransform.y });
        r.currentSwipeDirection = undefined;
        provider.render();
        return;
      }
      let shouldClose = false;
      const deltaX = r.dragOffset.x - resolvedInitialTransform.x;
      const deltaY = r.dragOffset.y - resolvedInitialTransform.y;
      let dismissDirection;
      for (const direction of swipeDirections) {
        if (direction === "right" && deltaX > SWIPE_THRESHOLD) dismissDirection = "right";
        if (direction === "left" && deltaX < -SWIPE_THRESHOLD) dismissDirection = "left";
        if (direction === "down" && deltaY > SWIPE_THRESHOLD) dismissDirection = "down";
        if (direction === "up" && deltaY < -SWIPE_THRESHOLD) dismissDirection = "up";
        if (dismissDirection) {
          shouldClose = true;
          break;
        }
      }
      if (shouldClose) {
        r.currentSwipeDirection = dismissDirection;
        r.dragDismissed = true;
        store.closeToast(r.id);
      } else {
        setDragOffset({ x: resolvedInitialTransform.x, y: resolvedInitialTransform.y });
        r.currentSwipeDirection = undefined;
        provider.render();
      }
    };
    r.handleSwipeEnd = handleSwipeEnd;

    el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch") store.pauseTimers();
      const target = event.target;
      const isInteractiveElement = target
        ? target.closest(`button,a,input,textarea,[role="button"],${TOAST_SWIPE_IGNORE_SELECTOR}`)
        : false;
      if (isInteractiveElement) return;
      r.cancelledSwipe = false;
      r.intendedSwipeDirection = undefined;
      r.maxSwipeDisplacement = 0;
      r.activePointerId = event.pointerId;
      r.dragStartPos = { x: event.clientX, y: event.clientY };
      r.swipeCancelBaseline = r.dragStartPos;
      const transform = getElementTransform(el);
      r.initialTransform = transform;
      setDragOffset({ x: transform.x, y: transform.y });
      r.isSwiping = true;
      r.isRealSwipe = false;
      r.lockedDirection = null;
      r.isFirstPointerMove = true;
      store.setHovering(true);
      r.dragAbortController?.abort();
      const dragAbortController = new AbortController();
      r.dragAbortController = dragAbortController;
      document.addEventListener("pointerup", handleSwipeEnd, { signal: dragAbortController.signal });
      document.addEventListener("pointercancel", handleSwipeEnd, { signal: dragAbortController.signal });
      el.setPointerCapture?.(event.pointerId);
    });

    el.addEventListener("pointermove", (event) => {
      if (event.pointerId !== r.activePointerId) return;
      // Prevent text selection on Safari
      event.preventDefault();
      if (r.isFirstPointerMove) {
        r.dragStartPos = { x: event.clientX, y: event.clientY };
        r.isFirstPointerMove = false;
      }
      const { clientY, clientX, movementX, movementY } = event;
      if ((movementY < 0 && clientY > r.swipeCancelBaseline.y) || (movementY > 0 && clientY < r.swipeCancelBaseline.y)) {
        r.swipeCancelBaseline = { x: r.swipeCancelBaseline.x, y: clientY };
      }
      if ((movementX < 0 && clientX > r.swipeCancelBaseline.x) || (movementX > 0 && clientX < r.swipeCancelBaseline.x)) {
        r.swipeCancelBaseline = { x: clientX, y: r.swipeCancelBaseline.y };
      }
      const deltaX = clientX - r.dragStartPos.x;
      const deltaY = clientY - r.dragStartPos.y;
      const cancelDeltaY = clientY - r.swipeCancelBaseline.y;
      const cancelDeltaX = clientX - r.swipeCancelBaseline.x;
      // React state set in this handler is read on the next event.
      const lockedDirection = r.lockedDirection;
      if (!r.isRealSwipe) {
        const movementDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (movementDistance >= MIN_DRAG_THRESHOLD) {
          r.isRealSwipe = true;
          if (lockedDirection === null) {
            const hasHorizontal = swipeDirections.includes("left") || swipeDirections.includes("right");
            const hasVertical = swipeDirections.includes("up") || swipeDirections.includes("down");
            if (hasHorizontal && hasVertical) {
              r.lockedDirection = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
            }
          }
        }
      }
      let candidate;
      if (!r.intendedSwipeDirection) {
        if (lockedDirection === "vertical") {
          if (deltaY > 0) candidate = "down";
          else if (deltaY < 0) candidate = "up";
        } else if (lockedDirection === "horizontal") {
          if (deltaX > 0) candidate = "right";
          else if (deltaX < 0) candidate = "left";
        } else if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          candidate = deltaX > 0 ? "right" : "left";
        } else {
          candidate = deltaY > 0 ? "down" : "up";
        }
        if (candidate && swipeDirections.includes(candidate)) {
          r.intendedSwipeDirection = candidate;
          r.maxSwipeDisplacement = getDisplacement(candidate, deltaX, deltaY);
          r.currentSwipeDirection = candidate;
        }
      } else {
        const direction = r.intendedSwipeDirection;
        const currentDisplacement = getDisplacement(direction, cancelDeltaX, cancelDeltaY);
        if (currentDisplacement > SWIPE_THRESHOLD) {
          r.cancelledSwipe = false;
          r.currentSwipeDirection = direction;
        } else if (
          !(swipeDirections.includes("left") && swipeDirections.includes("right")) &&
          !(swipeDirections.includes("up") && swipeDirections.includes("down")) &&
          r.maxSwipeDisplacement - currentDisplacement >= REVERSE_CANCEL_THRESHOLD
        ) {
          // Mark that a change-of-mind has occurred
          r.cancelledSwipe = true;
        }
      }
      const dampedDelta = applyDirectionalDamping(deltaX, deltaY);
      let newOffsetX = r.initialTransform.x;
      let newOffsetY = r.initialTransform.y;
      const horizontal = swipeDirections.includes("left") || swipeDirections.includes("right");
      const vertical = swipeDirections.includes("up") || swipeDirections.includes("down");
      if (lockedDirection === "horizontal") {
        if (horizontal) newOffsetX += dampedDelta.x;
      } else if (lockedDirection === "vertical") {
        if (vertical) newOffsetY += dampedDelta.y;
      } else {
        if (horizontal) newOffsetX += dampedDelta.x;
        if (vertical) newOffsetY += dampedDelta.y;
      }
      setDragOffset({ x: newOffsetX, y: newOffsetY });
      provider.render();
    });
    el.addEventListener("pointerup", handleSwipeEnd);
    el.addEventListener("pointercancel", handleSwipeEnd);

    el.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!contains(el, document.activeElement)) return;
        store.closeToast(r.id);
      }
    });

    // React's pointermove preventDefault is not enough on iOS.
    el.addEventListener(
      "touchmove",
      (event) => {
        if (r.activePointerId === null || !contains(el, event.target)) return;
        event.preventDefault();
      },
      { passive: false },
    );

    // ToastAction: the toast's actionProps.
    action.addEventListener("click", (event) => toastOf()?.actionProps?.onClick?.(event));

    // ToastClose
    close.addEventListener("click", () => store.closeToast(r.id));
    close.addEventListener("focus", () => {
      r.closeHasFocus = true;
      provider.render();
    });
    close.addEventListener("blur", () => {
      r.closeHasFocus = false;
      provider.render();
    });

    // ToastContent: recalculate the height when the content changes.
    r.observers = [
      new ResizeObserver(() => r.recalculateHeight()),
      new MutationObserver(() => r.recalculateHeight()),
    ];
    return r;
  }

  function getDragStyles(r) {
    if (
      !r.isSwiping &&
      r.dragOffset.x === r.initialTransform.x &&
      r.dragOffset.y === r.initialTransform.y &&
      !r.dragDismissed
    ) {
      return { transition: "", transform: "", x: "0px", y: "0px" };
    }
    const deltaX = r.dragOffset.x - r.initialTransform.x;
    const deltaY = r.dragOffset.y - r.initialTransform.y;
    return {
      transition: r.isSwiping ? "none" : "",
      // While swiping, freeze the element at its current visual transform.
      transform: r.isSwiping
        ? `translateX(${r.dragOffset.x}px) translateY(${r.dragOffset.y}px) scale(${r.initialTransform.scale})`
        : "",
      x: `${deltaX}px`,
      y: `${deltaY}px`,
    };
  }

  function setAttr(el, name, value) {
    if (value === undefined || value === null || value === false) el.removeAttribute(name);
    else el.setAttribute(name, value === true ? "" : String(value));
  }

  // Renders one toast like ToastRoot and its parts render from the state.
  function renderToast(provider, r, toast) {
    const { store, portal } = provider;
    const state = store.state;
    const el = r.el;
    const expanded = selectors.expanded(state);
    const domIndex = selectors.toastIndex(state, toast.id);
    const visibleIndex = selectors.toastVisibleIndex(state, toast.id);
    const offsetY = selectors.toastOffsetY(state, toast.id);
    const isHighPriority = toast.priority === "high";

    // ToastIcon
    const iconTemplate = toast.type ? portal.querySelector(`template[data-templ-toast-icon="${toast.type}"]`) : null;
    if (r.iconType !== toast.type || (!r.icon && iconTemplate)) {
      r.icon?.remove();
      r.icon = iconTemplate ? iconTemplate.content.firstElementChild.cloneNode(true) : null;
      if (r.icon) r.content.prepend(r.icon);
      r.iconType = toast.type;
    }

    // ToastTitle and ToastDescription render when they have children.
    r.titleId = toast.title ? r.ownTitleId : undefined;
    if (toast.title) {
      if (!r.title.isConnected) r.titleText.prepend(r.title);
      r.title.id = r.ownTitleId;
      if (r.title.textContent !== String(toast.title)) r.title.textContent = toast.title;
      setAttr(r.title, "data-type", toast.type);
    } else {
      r.title.remove();
    }
    r.descriptionId = toast.description ? r.ownDescriptionId : undefined;
    if (toast.description) {
      if (!r.description.isConnected) r.titleText.append(r.description);
      r.description.id = r.ownDescriptionId;
      if (r.description.textContent !== String(toast.description)) r.description.textContent = toast.description;
      setAttr(r.description, "data-type", toast.type);
    } else {
      r.description.remove();
    }

    // ToastAction renders when the toast's actionProps have children.
    const actionChildren = toast.actionProps?.children;
    if (actionChildren) {
      if (!r.action.isConnected) r.content.insertBefore(r.action, r.close);
      if (r.action.textContent !== String(actionChildren)) r.action.textContent = actionChildren;
      setAttr(r.action, "data-type", toast.type);
    } else {
      r.action.remove();
    }

    // ToastClose
    r.close.setAttribute("aria-hidden", String(!expanded && !r.closeHasFocus));
    setAttr(r.close, "data-type", toast.type);

    // ToastContent
    setAttr(r.content, "data-expanded", expanded);
    setAttr(r.content, "data-behind", visibleIndex > 0);

    // ToastRoot
    el.setAttribute("role", isHighPriority ? "alertdialog" : "dialog");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-modal", "false");
    setAttr(el, "aria-labelledby", r.titleId);
    setAttr(el, "aria-describedby", r.descriptionId);
    setAttr(el, "aria-hidden", isHighPriority && !state.focused ? "true" : undefined);
    setAttr(el, "inert", !!toast.limited);
    const drag = getDragStyles(r);
    el.style.transition = drag.transition;
    el.style.transform = drag.transform;
    el.style.setProperty("--toast-swipe-movement-x", drag.x);
    el.style.setProperty("--toast-swipe-movement-y", drag.y);
    el.style.setProperty("--toast-index", String(toast.transitionStatus === "ending" ? domIndex : visibleIndex));
    el.style.setProperty("--toast-offset-y", `${offsetY}px`);
    if (toast.height) el.style.setProperty("--toast-height", `${toast.height}px`);
    else el.style.removeProperty("--toast-height");
    setAttr(el, "data-starting-style", toast.transitionStatus === "starting");
    setAttr(el, "data-ending-style", toast.transitionStatus === "ending");
    setAttr(el, "data-expanded", expanded);
    setAttr(el, "data-limited", !!toast.limited);
    setAttr(el, "data-type", toast.type);
    setAttr(el, "data-swiping", r.isSwiping);
    setAttr(el, "data-swipe-direction", r.currentSwipeDirection);
  }

  // ----- Provider and Viewport ----------------------------------------------

  function createProvider(viewport) {
    const portal = viewport.parentElement;
    const provider = { portal, viewport, toasts: new Map() };
    const store = new ToastStore(
      {
        timeout: parseInt(viewport.getAttribute("data-templ-timeout"), 10) || 5000,
        limit: parseInt(viewport.getAttribute("data-templ-limit"), 10) || 3,
        viewport,
        toasts: [],
        hovering: false,
        focused: false,
        isWindowFocused: true,
        prevFocusElement: null,
      },
      () => provider.render(),
    );
    provider.store = store;

    const windowFocusTimeout = createTimeout();
    let handlingFocusGuard = false;
    let markedReadyForMouseLeave = false;
    let touchActive = false;
    let hadTransitioningToasts = false;
    let listening = false;
    const guards = { outside: null, before: null, after: null };
    let alerts = null;

    function handleFocusGuard(event) {
      handlingFocusGuard = true;
      // Coming off the container, move to the first toast that can hold focus.
      if (event.relatedTarget === viewport) {
        const firstFocusableToast = store.state.toasts.find((t) => t.transitionStatus !== "ending" && !t.limited);
        if (firstFocusableToast) firstFocusableToast.ref?.current?.focus();
        else store.restoreFocusToPrevElement();
      } else {
        store.restoreFocusToPrevElement();
      }
    }

    function flushMouseLeave() {
      const hasEndingToasts = store.state.toasts.some((t) => t.transitionStatus === "ending");
      if (hasEndingToasts || touchActive || !markedReadyForMouseLeave) return;
      if (store.state.isWindowFocused) store.resumeTimers();
      markedReadyForMouseLeave = false;
      store.setHovering(false);
    }

    function handleMouseEnter() {
      store.pauseTimers();
      markedReadyForMouseLeave = false;
      if (!store.state.hovering) store.setHovering(true);
    }

    function resumeTimersIfWindowFocused() {
      if (store.state.isWindowFocused) store.resumeTimers();
    }

    function handleFocus() {
      if (handlingFocusGuard) {
        handlingFocusGuard = false;
        return;
      }
      if (store.state.focused) return;
      // Only set focused when the active element is focus-visible.
      if (isFocusVisible(document.activeElement)) {
        store.setFocused(true);
        store.pauseTimers();
      }
    }

    viewport.addEventListener("mouseenter", handleMouseEnter);
    viewport.addEventListener("mousemove", handleMouseEnter);
    viewport.addEventListener("mouseleave", () => {
      const hasEndingToasts = store.state.toasts.some((t) => t.transitionStatus === "ending");
      if (hasEndingToasts || touchActive) {
        // Wait until the transitions have settled or the touch ends.
        markedReadyForMouseLeave = true;
      } else {
        resumeTimersIfWindowFocused();
        store.setHovering(false);
      }
    });
    viewport.addEventListener("focusin", handleFocus);
    viewport.addEventListener("click", handleFocus);
    viewport.addEventListener("focusout", (event) => {
      if (!store.state.focused || contains(viewport, event.relatedTarget)) return;
      store.setFocused(false);
      resumeTimersIfWindowFocused();
    });
    viewport.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && event.shiftKey && event.target === viewport) {
        event.preventDefault();
        store.restoreFocusToPrevElement();
        store.resumeTimers();
      }
    });
    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") touchActive = true;
    });
    const handlePointerEnd = (event) => {
      if (event.pointerType !== "touch") return;
      touchActive = false;
      flushMouseLeave();
    };
    viewport.addEventListener("pointerup", handlePointerEnd);
    viewport.addEventListener("pointercancel", handlePointerEnd);

    // Listen globally for F6 so we can force-focus the viewport.
    window.addEventListener("keydown", (event) => {
      if (selectors.isEmpty(store.state)) return;
      if (event.key === "F6" && event.target !== viewport) {
        event.preventDefault();
        store.setPrevFocusElement(document.activeElement);
        viewport.focus({ preventScroll: true });
        store.pauseTimers();
        store.setFocused(true);
      }
    });

    // The window and document listeners live while there are toasts.
    function handleWindowBlur(event) {
      if (event.target !== window) return;
      store.setIsWindowFocused(false);
      store.pauseTimers();
    }
    function handleWindowFocus(event) {
      if (event.relatedTarget) return;
      const target = event.target;
      const activeEl = document.activeElement;
      if (target === window || !contains(viewport, target) || !isFocusVisible(activeEl)) store.resumeTimers();
      // Wait for the handleFocus event to fire.
      windowFocusTimeout.start(0, () => store.setIsWindowFocused(true));
    }
    function setListening(next) {
      if (next === listening) return;
      listening = next;
      const method = next ? "addEventListener" : "removeEventListener";
      window[method]("blur", handleWindowBlur, true);
      window[method]("focus", handleWindowFocus, true);
      document[method]("pointerdown", store.handleDocumentPointerDown, true);
    }

    function renderViewport() {
      const state = store.state;
      const isEmpty = selectors.isEmpty(state);
      setListening(!isEmpty);
      setAttr(viewport, "data-expanded", selectors.expanded(state));
      const frontmostHeight = state.toasts[0]?.height ?? 0;
      if (frontmostHeight) viewport.style.setProperty("--toast-frontmost-height", `${frontmostHeight}px`);
      else viewport.style.removeProperty("--toast-frontmost-height");

      // The focus guards around and inside the viewport.
      const showGuards = !isEmpty && !!state.prevFocusElement;
      const { createFocusGuard } = window.templ.focusManager;
      if (showGuards && !guards.outside) {
        guards.outside = createFocusGuard(null, handleFocusGuard);
        guards.before = createFocusGuard(null, handleFocusGuard);
        guards.after = createFocusGuard(null, handleFocusGuard);
        portal.insertBefore(guards.outside, viewport);
      } else if (!showGuards && guards.outside) {
        Object.keys(guards).forEach((k) => {
          guards[k].remove();
          guards[k] = null;
        });
      }

      // High priority toasts announce through a visually hidden alert.
      const highPriorityToasts = state.toasts.filter((t) => t.priority === "high");
      if (!state.focused && highPriorityToasts.length > 0) {
        if (!alerts) {
          alerts = document.createElement("div");
          alerts.style.cssText =
            "clip-path:inset(50%);overflow:hidden;white-space:nowrap;border:0;padding:0;width:1px;height:1px;margin:-1px;position:fixed;top:0;left:0";
        }
        if (alerts.previousElementSibling !== viewport) viewport.after(alerts);
        alerts.replaceChildren(
          ...highPriorityToasts.map((t) => {
            const alert = document.createElement("div");
            alert.setAttribute("role", "alert");
            alert.setAttribute("aria-atomic", "true");
            const titleEl = document.createElement("div");
            titleEl.textContent = t.title ?? "";
            const descriptionEl = document.createElement("div");
            descriptionEl.textContent = t.description ?? "";
            alert.append(titleEl, descriptionEl);
            return alert;
          }),
        );
      } else if (alerts) {
        alerts.remove();
      }
    }

    // ToastList: keyed by toast id, in the store's order.
    function renderList() {
      const state = store.state;
      const ids = new Set(state.toasts.map((t) => t.id));
      provider.toasts.forEach((r, id) => {
        if (ids.has(id)) return;
        r.observers.forEach((o) => o.disconnect());
        r.dragAbortController?.abort();
        r.el.remove();
        provider.toasts.delete(id);
      });
      const mounted = [];
      const desired = state.toasts.map((toast) => {
        let r = provider.toasts.get(toast.id);
        if (!r) {
          r = mountToast(provider, toast);
          provider.toasts.set(toast.id, r);
          mounted.push(r);
        }
        renderToast(provider, r, toast);
        return r.el;
      });
      if (guards.before) desired.unshift(guards.before);
      if (guards.after) desired.push(guards.after);
      let next = viewport.firstChild;
      desired.forEach((node) => {
        if (node === next) next = next.nextSibling;
        else viewport.insertBefore(node, next);
      });
      return mounted;
    }

    function renderOnce() {
      renderViewport();
      const mounted = renderList();
      // useOpenChangeComplete: an ending toast is removed once its exit
      // animations finished.
      provider.toasts.forEach((r, id) => {
        const toast = selectors.toast(store.state, id);
        if (toast?.transitionStatus === "ending" && !r.ending) {
          r.ending = true;
          window.templ.transition.animationsFinished(r.el, () => {
            if (selectors.toast(store.state, id)?.transitionStatus === "ending") store.removeToast(id);
          });
        }
      });
      // ToastContent's layout effect and observers.
      mounted.forEach((r) => {
        r.recalculateHeight();
        r.observers[0].observe(r.content);
        r.observers[1].observe(r.content, { childList: true, subtree: true, characterData: true });
      });
      const hasTransitioningToasts = store.state.toasts.some((t) => t.transitionStatus === "ending");
      if (hasTransitioningToasts !== hadTransitioningToasts) {
        hadTransitioningToasts = hasTransitioningToasts;
        flushMouseLeave();
      }
    }

    // A store update renders after the code that updated it, like React
    // renders after an event handler and runs the layout effects then.
    let scheduled = false;
    provider.render = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        renderOnce();
      });
    };

    // subscribeToToastManager
    provider.unsubscribe = toastManager[" subscribe"](({ action, options }) => {
      const id = options.id;
      if (action === "promise" && options.promise) store.promiseToast(options.promise, options);
      else if (action === "update" && id) store.updateToast(id, options);
      else if (action === "close") store.closeToast(id);
      else store.addToast(options);
    });
    return provider;
  }

  const toastManager = createToastManager();

  window.templ.lifecycle.register(VIEWPORT, {
    init(viewport) {
      viewport._templToastProvider = createProvider(viewport);
    },
    destroy(viewport) {
      const provider = viewport._templToastProvider;
      if (!provider) return;
      provider.unsubscribe();
      provider.store.clearTimers();
    },
  });

  // The server side toast request: toastManager.add with its options.
  window.templ.lifecycle.register("[data-templ-toast]", {
    init(stub) {
      const options = {};
      const title = stub.getAttribute("data-templ-title");
      const description = stub.getAttribute("data-templ-description");
      const type = stub.getAttribute("data-templ-type");
      const timeout = parseInt(stub.getAttribute("data-templ-timeout"), 10);
      if (title) options.title = title;
      if (description) options.description = description;
      if (type) options.type = type;
      if (timeout) options.timeout = timeout;
      stub.remove();
      toastManager.add(options);
    },
  });

  // shadcn's toast export: the toast manager.
  window.templ = window.templ || {};
  window.templ.toast = toastManager;
})();
