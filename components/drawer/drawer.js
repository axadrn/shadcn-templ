(function () {
  "use strict";

  // Gesture constants, 1:1 from Base UI (packages/react/src/utils/useSwipeDismiss.ts
  // and packages/react/src/drawer/viewport/DrawerViewport.tsx).
  const MIN_SWIPE_THRESHOLD = 10; // px floor for the dismiss threshold
  const FAST_SWIPE_VELOCITY = 0.5; // px/ms, a flick dismisses regardless of distance
  const SNAP_VELOCITY_THRESHOLD = 0.5;
  const SNAP_VELOCITY_MULTIPLIER = 300;
  const MAX_SNAP_VELOCITY = 4;
  const MIN_VELOCITY_DURATION_MS = 50;
  const MIN_RELEASE_VELOCITY_DURATION_MS = 16;
  const MAX_RELEASE_VELOCITY_AGE_MS = 80;
  const MIN_SWIPE_RELEASE_VELOCITY = 0.2;
  const MAX_SWIPE_RELEASE_VELOCITY = 4;
  const MIN_SWIPE_RELEASE_DURATION_MS = 80;
  const MAX_SWIPE_RELEASE_DURATION_MS = 360;
  const MIN_SWIPE_RELEASE_SCALAR = 0.1;
  const MAX_SWIPE_RELEASE_SCALAR = 1;
  const AXIS_LOCK_SLOP = 6;
  const AXIS_LOCK_BIAS = 2;
  // Base UI's DEFAULT_IGNORE_SELECTOR: mouse swipes never start on these.
  // Touch swipes may (ignoreSelectorWhenTouch: false in DrawerViewport).
  const IGNORE_SELECTOR = 'button,a,input,select,textarea,label,[role="button"]';
  // The ending transition is duration-450, or strength*400ms after a swipe;
  // the fallback timer only fires when no transform transition runs at all.
  const CLOSE_FALLBACK_MS = 500;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // Displacement of (dx, dy) along the dismiss direction (useSwipeDismiss
  // getDisplacement).
  function displacement(direction, dx, dy) {
    switch (direction) {
      case "up":
        return -dy;
      case "down":
        return dy;
      case "left":
        return -dx;
      case "right":
        return dx;
      default:
        return 0;
    }
  }

  // ----- the drawer parts ----------------------------------------------------
  //
  // The <dialog> is the Drawer.Viewport (fullscreen, hosts the listeners),
  // the popup div is Drawer.Popup, the overlay div is DrawerOverlay (only
  // rendered for modal, non-nested drawers). Lifecycle attributes and swipe
  // vars land on popup and overlay, exactly where Base UI puts them.

  function popupOf(dialog) {
    return dialog.querySelector(":scope > [data-tui-drawer-popup]");
  }

  function overlayOf(dialog) {
    return dialog.querySelector(":scope > [data-tui-drawer-overlay]");
  }

  function setPartsAttr(dialog, name, on) {
    const popup = popupOf(dialog);
    const overlay = overlayOf(dialog);
    if (popup) popup.toggleAttribute(name, on);
    if (overlay) overlay.toggleAttribute(name, on);
  }

  function directionOf(dialog) {
    return popupOf(dialog)?.getAttribute("data-swipe-direction") || "down";
  }

  function axisIsY(dialog) {
    const d = directionOf(dialog);
    return d === "down" || d === "up";
  }

  // Current translate/scale from the computed transform matrix
  // (useSwipeDismiss getElementTransform), so a grab during the spring-back
  // continues from the on-screen position instead of jumping.
  function getTransform(element) {
    const transform = window.getComputedStyle(element).transform;
    let x = 0;
    let y = 0;
    let scale = 1;
    if (transform && transform !== "none") {
      const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
      if (matrix) {
        const values = matrix[1].split(", ").map(parseFloat);
        if (values.length === 6) {
          x = values[4];
          y = values[5];
          scale = Math.sqrt(values[0] * values[0] + values[1] * values[1]);
        } else if (values.length === 16) {
          x = values[12];
          y = values[13];
          scale = values[0];
        }
      }
    }
    return { x, y, scale };
  }

  // Resolves a <dialog data-tui-drawer-content> from an id, the element
  // itself, or anything inside it.
  function getDrawer(target) {
    if (!target) return null;
    if (typeof target === "string") {
      const el = document.getElementById(target);
      return el && el.matches("dialog[data-tui-drawer-content]") ? ensureDrawer(el) : null;
    }
    if (target.matches?.("dialog[data-tui-drawer-content]")) return ensureDrawer(target);
    return ensureDrawer(target.closest?.("dialog[data-tui-drawer-content]") || null);
  }

  function drawerFor(element) {
    const id =
      element.getAttribute("aria-controls") || element.getAttribute("data-tui-drawer-target");
    if (id) return getDrawer(id);
    return getDrawer(element);
  }

  function triggersFor(dialog) {
    if (!dialog.id) return [];
    return document.querySelectorAll(
      '[data-tui-drawer-trigger][aria-controls="' + dialog.id + '"]',
    );
  }

  function updateState(dialog, isOpen) {
    triggersFor(dialog).forEach((trigger) => {
      trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  // ----- nested drawers ------------------------------------------------------
  //
  // A Drawer rendered inside another Drawer's subtree carries
  // data-tui-drawer-parent (the SSR pendant of Base UI's context nesting).
  // Everything below is recomputed from the DOM on every state change, so
  // swapped-in or swapped-out drawers never leave stale stacking state.

  function parentOf(dialog) {
    const id = dialog.getAttribute("data-tui-drawer-parent");
    if (!id) return null;
    const el = document.getElementById(id);
    return el && el.matches("dialog[data-tui-drawer-content]") ? el : null;
  }

  function ancestorsOf(dialog) {
    const chain = [];
    let current = parentOf(dialog);
    while (current && !chain.includes(current)) {
      chain.push(current);
      current = parentOf(current);
    }
    return chain;
  }

  function hasOpenNested(dialog) {
    return popupOf(dialog)?.hasAttribute("data-nested-drawer-open") || false;
  }

  // Mirrors the child's swipe progress into every ancestor popup
  // (DrawerRoot's onNestedSwipeProgressChange chain: the var feeds
  // --stack-progress, easing the parent back to the front while the child is
  // dragged away).
  function notifyAncestors(dialog, progress) {
    ancestorsOf(dialog).forEach((ancestor) => {
      const popup = popupOf(ancestor);
      if (popup) popup.style.setProperty("--drawer-swipe-progress", String(progress));
    });
  }

  function setAncestorsSwiping(dialog, on) {
    ancestorsOf(dialog).forEach((ancestor) => {
      const popup = popupOf(ancestor);
      if (popup) popup.toggleAttribute("data-nested-drawer-swiping", on);
    });
  }

  // Recomputes the whole nested-drawer stack: --nested-drawers counts,
  // data-nested-drawer-open, --drawer-frontmost-height and the --drawer-height
  // pin (DrawerPopup keeps the measured height while a nested drawer is
  // present or the popup is animating out; otherwise the height stays auto).
  function syncStack() {
    const dialogs = Array.from(document.querySelectorAll("dialog[data-tui-drawer-content]"));
    if (!dialogs.length) return;

    const info = new Map();
    dialogs.forEach((d) => {
      info.set(d, { openDesc: 0, present: false, frontmost: 0, frontmostDepth: -1 });
    });

    for (const d of dialogs) {
      const popup = popupOf(d);
      if (!popup) continue;
      const closing = popup.hasAttribute("data-ending-style");
      if (!d.open && !closing) continue;
      const chain = ancestorsOf(d);
      // A closing drawer no longer counts as open (Base UI flips `open`
      // before the exit transition) but still pins the parents' heights
      // (`present`: open || transitionStatus === 'ending').
      for (const ancestor of chain) {
        const ai = info.get(ancestor);
        if (!ai) continue;
        ai.present = true;
        if (d.open && !closing) {
          ai.openDesc += 1;
          // The frontmost drawer of the stack is the deepest open one.
          const depth = chain.length; // distance of d below the root, relative depth works per ancestor
          if (depth > ai.frontmostDepth) {
            ai.frontmostDepth = depth;
            ai.frontmost = d._tuiHeight || popup.offsetHeight;
          }
        }
      }
    }

    for (const d of dialogs) {
      const popup = popupOf(d);
      if (!popup || !d.open) continue;
      const i = info.get(d);
      const closing = popup.hasAttribute("data-ending-style");
      if (i.openDesc === 0 && !closing) {
        // Measure while unobstructed; the cached value is what gets pinned
        // once a nested drawer opens (DrawerPopup keepHeightWhileNested).
        d._tuiHeight = popup.offsetHeight;
      }
      popup.style.setProperty("--nested-drawers", String(i.openDesc));
      popup.toggleAttribute("data-nested-drawer-open", i.openDesc > 0);
      if (i.openDesc > 0 && i.frontmost > 0) {
        popup.style.setProperty("--drawer-frontmost-height", i.frontmost + "px");
      } else {
        popup.style.removeProperty("--drawer-frontmost-height");
      }
      if (i.present && d._tuiHeight > 0) {
        popup.style.setProperty("--drawer-height", d._tuiHeight + "px");
      } else if (!closing) {
        popup.style.removeProperty("--drawer-height");
      }
      if (i.openDesc === 0) {
        popup.removeAttribute("data-nested-drawer-swiping");
        popup.style.setProperty("--drawer-swipe-progress", "0");
      }
    }
  }

  // ----- snap points ---------------------------------------------------------
  //
  // Port of packages/react/src/drawer/root/useDrawerSnapPoints.ts plus the
  // snap branches of DrawerViewport. Snap points apply to vertical drawers;
  // the config is read once from data-tui-drawer-snap-points (JSON, the SSR
  // pendant of the snapPoints prop) and kept on the element itself so
  // swapped-out drawers take their state with them.

  function snapStateOf(dialog) {
    if (dialog._tuiSnap !== undefined) return dialog._tuiSnap;
    const raw = dialog.getAttribute("data-tui-drawer-snap-points");
    let points = null;
    if (raw) {
      try {
        points = JSON.parse(raw);
      } catch {
        points = null;
      }
    }
    if (!Array.isArray(points) || points.length === 0) {
      dialog._tuiSnap = null;
      return null;
    }
    dialog._tuiSnap = {
      points,
      resolved: [],
      active: points[0],
      popupHeight: 0,
      sequential: dialog.hasAttribute("data-tui-drawer-snap-sequential"),
    };
    return dialog._tuiSnap;
  }

  // Resolves the vertical swipe movement for a snap point, damping the drag
  // once it overshoots the fully-open edge (useDrawerSnapPoints
  // getSnapPointSwipeMovement).
  function getSnapPointSwipeMovement(baseOffset, movementValue) {
    const nextOffset = baseOffset + movementValue;
    if (nextOffset >= 0) return movementValue;
    return -Math.sqrt(-nextOffset) - baseOffset;
  }

  // Numbers <= 1 are viewport fractions, > 1 pixels; strings take px/rem
  // (useDrawerSnapPoints resolveSnapPointValue).
  function resolveSnapValue(value, viewportHeight, rootFontSize) {
    if (!isFinite(viewportHeight) || viewportHeight <= 0) return null;
    if (typeof value === "number") {
      if (!isFinite(value)) return null;
      if (value <= 1) return clamp(value, 0, 1) * viewportHeight;
      return value;
    }
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.endsWith("px")) {
      const parsed = Number.parseFloat(trimmed);
      return isFinite(parsed) ? parsed : null;
    }
    if (trimmed.endsWith("rem")) {
      const parsed = Number.parseFloat(trimmed);
      return isFinite(parsed) ? parsed * rootFontSize : null;
    }
    return null;
  }

  function closestSnapPointIndex(values, target) {
    let closestIndex = -1;
    let closestDistance = Infinity;
    for (let index = 0; index < values.length; index += 1) {
      const distance = Math.abs(values[index] - target);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    return closestIndex;
  }

  // Resolves the configured snap points against the current viewport and
  // popup size (useDrawerSnapPoints resolvedSnapPoints, including the
  // last-wins dedupe of near-equal heights).
  function resolveSnapPoints(dialog) {
    const snap = snapStateOf(dialog);
    if (!snap) return;
    const popup = popupOf(dialog);
    const viewportHeight = dialog.clientHeight || document.documentElement.clientHeight;
    const rootFontSize =
      parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    const popupHeight = popup ? popup.offsetHeight : 0;
    snap.popupHeight = popupHeight;
    if (viewportHeight <= 0 || popupHeight <= 0) {
      snap.resolved = [];
      return;
    }
    const maxHeight = Math.min(popupHeight, viewportHeight);
    const resolved = [];
    for (const value of snap.points) {
      const height = resolveSnapValue(value, viewportHeight, rootFontSize);
      if (height === null) continue;
      const clamped = clamp(height, 0, maxHeight);
      resolved.push({ value, height: clamped, offset: Math.max(0, popupHeight - clamped) });
    }
    const deduped = [];
    const seenHeights = [];
    for (let index = resolved.length - 1; index >= 0; index -= 1) {
      const point = resolved[index];
      if (seenHeights.some((height) => Math.abs(height - point.height) <= 1)) continue;
      seenHeights.push(point.height);
      deduped.push(point);
    }
    deduped.reverse();
    snap.resolved = deduped;
  }

  // The offset of the active snap point; falls back to the closest resolved
  // point when the active value has no exact match (useDrawerSnapPoints
  // resolvedActiveSnapPoint).
  function activeSnapOffset(dialog, snap) {
    if (snap.active === null || snap.active === undefined) return null;
    const exact = snap.resolved.find((point) => Object.is(point.value, snap.active));
    if (exact) return exact.offset;
    if (!snap.resolved.length) return null;
    const viewportHeight = dialog.clientHeight || document.documentElement.clientHeight;
    const rootFontSize =
      parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    const resolvedHeight = resolveSnapValue(snap.active, viewportHeight, rootFontSize);
    if (resolvedHeight === null) return null;
    const clamped = clamp(resolvedHeight, 0, Math.min(snap.popupHeight, viewportHeight));
    const index = closestSnapPointIndex(
      snap.resolved.map((point) => point.height),
      clamped,
    );
    return index === -1 ? null : snap.resolved[index].offset;
  }

  // The offset range between the two lowest snap points, used for the
  // overlay progress with snap points (DrawerViewport snapPointRange).
  function snapRangeOf(dialog, snap) {
    if (!snap || snap.points.length < 2 || snap.resolved.length < 2 || !axisIsY(dialog)) {
      return null;
    }
    const offsets = snap.resolved.map((point) => point.offset).sort((a, b) => a - b);
    return { minOffset: offsets[0], range: offsets[1] - offsets[0] };
  }

  // Applies the active snap point: --drawer-snap-point-offset on the popup
  // (negative for `up`, DrawerPopup snapPointOffsetValue), data-expanded at
  // the full snap point (activeSnapPoint === 1) and the steady-state overlay
  // progress between snap points.
  function applySnapState(dialog) {
    const snap = snapStateOf(dialog);
    const popup = popupOf(dialog);
    if (!snap || !popup || !axisIsY(dialog)) return;
    const offset = activeSnapOffset(dialog, snap);
    const direction = directionOf(dialog);
    popup.style.setProperty(
      "--drawer-snap-point-offset",
      offset === null ? "0px" : (direction === "up" ? -offset : offset) + "px",
    );
    popup.toggleAttribute("data-expanded", snap.active === 1);
    const overlay = overlayOf(dialog);
    const range = snapRangeOf(dialog, snap);
    if (overlay && range && range.range > 0 && offset !== null) {
      overlay.style.setProperty(
        "--drawer-swipe-progress",
        String(clamp((offset - range.minOffset) / range.range, 0, 1)),
      );
    }
  }

  // Re-resolve snap offsets when the viewport resizes (the reference
  // observes the viewport and popup with a ResizeObserver).
  function watchSnapResize(dialog) {
    if (dialog._tuiSnapRO || typeof ResizeObserver !== "function") return;
    if (!snapStateOf(dialog)) return;
    dialog._tuiSnapRO = new ResizeObserver(() => {
      if (!dialog.open || popupOf(dialog)?.hasAttribute("data-swiping")) return;
      resolveSnapPoints(dialog);
      applySnapState(dialog);
    });
    dialog._tuiSnapRO.observe(dialog);
  }

  function unwatchSnapResize(dialog) {
    if (dialog._tuiSnapRO) {
      dialog._tuiSnapRO.disconnect();
      delete dialog._tuiSnapRO;
    }
  }

  function resetSwipeVars(dialog) {
    const popup = popupOf(dialog);
    const overlay = overlayOf(dialog);
    if (popup) {
      popup.style.setProperty("--drawer-swipe-movement-x", "0px");
      popup.style.setProperty("--drawer-swipe-movement-y", "0px");
      popup.style.setProperty("--drawer-swipe-progress", "0");
      popup.style.setProperty("--drawer-swipe-strength", "1");
    }
    if (overlay) {
      overlay.style.setProperty("--drawer-swipe-progress", "0");
      overlay.style.setProperty("--drawer-swipe-strength", "1");
    }
  }

  function cleanupClosed(dialog) {
    setPartsAttr(dialog, "data-ending-style", false);
    setPartsAttr(dialog, "data-starting-style", false);
    setPartsAttr(dialog, "data-swiping", false);
    const popup = popupOf(dialog);
    if (popup) {
      popup.style.removeProperty("transform");
      popup.style.removeProperty("transition");
      popup.style.removeProperty("--drawer-height");
      popup.style.removeProperty("--drawer-frontmost-height");
      popup.style.setProperty("--nested-drawers", "0");
      popup.style.setProperty("--drawer-snap-point-offset", "0px");
      popup.removeAttribute("data-nested-drawer-open");
      popup.removeAttribute("data-nested-drawer-swiping");
      popup.removeAttribute("data-expanded");
    }
    resetSwipeVars(dialog);
    // Closing resets the snap point to the default (DrawerRoot
    // handleOpenChange), ready for the next open.
    const snap = snapStateOf(dialog);
    if (snap) snap.active = snap.points[0];
    unwatchSnapResize(dialog);
    updateState(dialog, false);
    dialog._tuiReleaseScroll?.();
    dialog._tuiReleaseScroll = null;
    syncInert();
    // Return focus to where the drawer was opened from, if focus is still
    // ours to give back.
    if (
      dialog._tuiPreviousFocus?.isConnected &&
      (dialog.contains(document.activeElement) || document.activeElement === document.body)
    ) {
      dialog._tuiPreviousFocus.focus({ preventScroll: true });
    }
    delete dialog._tuiPreviousFocus;
    syncStack();
  }

  // The hand-built half of showModal's modality: while a modal drawer is
  // open, every body-level sibling is inert - except the surfaces carrying
  // the shared data-tui-portal marker (floating popups, dialogs, the
  // toaster). inert removes the rest from tab order and the accessibility
  // tree: floating-ui's markOthers-with-inert pendant, without knowing any
  // component by name.
  function syncInert() {
    const anyModalOpen = Array.from(
      document.querySelectorAll("body > dialog[data-tui-drawer-content]"),
    ).some(
      (d) =>
        d.open &&
        d.getAttribute("data-modal") === "true" &&
        // A closing drawer no longer counts (Base UI removes markOthers at
        // dismiss start, not after the exit transition).
        !popupOf(d)?.hasAttribute("data-ending-style"),
    );
    for (const node of document.body.children) {
      if (node.localName === "script" || node.matches("[data-tui-portal]")) continue;
      node.toggleAttribute("inert", anyModalOpen);
    }
  }

  const escapeTargets = new WeakSet();
  function listenForEscape(element) {
    if (!element || escapeTargets.has(element)) return;
    element.addEventListener("keydown", closeOnEscapeKeyDown);
    escapeTargets.add(element);
  }

  // useDismiss: the focused popup or reference handles Escape before document.
  function closeOnEscapeKeyDown(event) {
    if (event.key !== "Escape") return;
    const drawer = event.currentTarget === document
      ? [...document.querySelectorAll("body > dialog[data-tui-drawer-content]")].find(
        (dialog) => dialog.open && !dialog.hasAttribute("data-tui-drawer-disable-dismissible") && !hasOpenNested(dialog),
      )
      : drawerFor(event.currentTarget);
    if (!drawer?.open || drawer.hasAttribute("data-tui-drawer-disable-dismissible") || hasOpenNested(drawer)) return;
    if (requestOpenChange(drawer, false)) event.preventDefault();
    event.stopPropagation();
    return true;
  }

  document.addEventListener("keydown", closeOnEscapeKeyDown);

  function openDrawer(target) {
    const dialog = getDrawer(target);
    if (!dialog) return;
    const popup = popupOf(dialog);
    if (!popup) return;

    window.clearTimeout(dialog._tuiCloseTimer);
    delete dialog._tuiCloseTimer;
    setPartsAttr(dialog, "data-ending-style", false);

    if (!dialog.open) {
      resetSwipeVars(dialog);
      // Base UI mounts the popup with its starting style (the off-screen
      // --closed-transform); painting that state first makes the removal
      // below transition the panel in (450ms cubic-bezier(0.22,1,0.36,1)).
      setPartsAttr(dialog, "data-starting-style", true);
      try {
        // Modal drawers open non-modally too: shadcn/Base UI never use the
        // native top layer (it would stack above the z-index portaled
        // popups). Modality - scroll lock, inert siblings, focus - is
        // built by hand, like Base UI does.
        portal(dialog);
        dialog.show();
        if (dialog.getAttribute("data-tui-dialog-show-modal") === "true") {
          dialog._tuiReleaseScroll = window.tui.scrollLock.acquire(dialog);
          dialog._tuiPreviousFocus = document.activeElement;
          syncInert();
          (popupOf(dialog) || dialog).focus({ preventScroll: true });
        }
      } catch {
        setPartsAttr(dialog, "data-starting-style", false);
        return;
      }
      // With layout available, resolve the snap points and seed the default
      // snap offset so the enter transition lands on the first snap point.
      if (snapStateOf(dialog) && axisIsY(dialog)) {
        resolveSnapPoints(dialog);
        applySnapState(dialog);
        watchSnapResize(dialog);
      }
    }

    void popup.offsetWidth;
    setPartsAttr(dialog, "data-starting-style", false);
    updateState(dialog, true);
    syncStack();
  }

  // strength is Base UI's --drawer-swipe-strength scalar: the ending
  // transition runs for strength*400ms. 1 for non-swipe closes.
  function closeDrawer(target, strength) {
    const dialog = getDrawer(target);
    if (!dialog) return;
    const popup = popupOf(dialog);

    if (!dialog.open || !popup) {
      updateState(dialog, false);
      return;
    }
    if (popup.hasAttribute("data-ending-style")) return;

    // Pin the measured height for the exit (DrawerPopup sets --drawer-height
    // while transitionStatus is 'ending'), so the panel cannot collapse
    // mid-transition.
    const height = popup.offsetHeight;
    if (height > 0) popup.style.setProperty("--drawer-height", height + "px");

    const value =
      typeof strength === "number" && isFinite(strength) && strength > 0 ? strength : 1;
    popup.style.setProperty("--drawer-swipe-strength", String(value));
    const overlay = overlayOf(dialog);
    if (overlay) overlay.style.setProperty("--drawer-swipe-strength", String(value));
    setPartsAttr(dialog, "data-ending-style", true);
    updateState(dialog, false);
    syncInert();
    if (
      dialog._tuiPreviousFocus?.isConnected &&
      (dialog.contains(document.activeElement) || document.activeElement === document.body)
    ) {
      dialog._tuiPreviousFocus.focus({ preventScroll: true });
    }
    delete dialog._tuiPreviousFocus;
    // The stack treats a closing drawer as closed (Base UI flips `open`
    // before the exit transition), so the parent starts scaling forward now.
    syncStack();

    const finish = () => {
      popup.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(dialog._tuiCloseTimer);
      delete dialog._tuiCloseTimer;
      if (dialog.open) dialog.close(); // the close handler runs cleanupClosed
      else cleanupClosed(dialog);
    };
    const onTransitionEnd = (event) => {
      if (event.target === popup && event.propertyName === "transform") finish();
    };
    popup.addEventListener("transitionend", onTransitionEnd);
    dialog._tuiCloseTimer = window.setTimeout(finish, CLOSE_FALLBACK_MS);
  }

  function isDrawerOpen(target) {
    return getDrawer(target)?.open || false;
  }

  function requestOpenChange(target, nextOpen, strength) {
    const dialog = getDrawer(target);
    if (!dialog || dialog.open === nextOpen) return false;
    const accepted = dialog.dispatchEvent(
      new CustomEvent("drawer-open-change", {
        bubbles: true,
        cancelable: true,
        detail: { open: nextOpen },
      }),
    );
    if (!accepted || dialog.hasAttribute("data-tui-drawer-controlled")) return false;
    if (nextOpen) openDrawer(dialog);
    else closeDrawer(dialog, strength);
    return true;
  }

  function toggleDrawer(target) {
    requestOpenChange(target, !isDrawerOpen(target));
  }

  // Sets the active snap point (the pendant of the controlled snapPoint
  // prop) and animates the popup to it.
  function setSnapPoint(target, value) {
    const dialog = getDrawer(target);
    if (!dialog) return;
    const snap = snapStateOf(dialog);
    if (!snap) return;
    snap.active = value;
    if (dialog.open) {
      resolveSnapPoints(dialog);
      applySnapState(dialog);
    }
  }

  function getSnapPoint(target) {
    const dialog = getDrawer(target);
    const snap = dialog ? snapStateOf(dialog) : null;
    return snap ? snap.active : null;
  }

  // ----- swipe to dismiss ----------------------------------------------------
  //
  // Port of the Base UI drawer gesture (useSwipeDismiss + DrawerViewport):
  // - the <dialog> viewport hosts the listeners, exactly like DrawerViewport
  // - mouse swipes start on the panel chrome (popup minus [data-slot=
  //   drawer-content] minus interactive elements), touch swipes anywhere in
  //   the popup: the reference's isDrawerContentTarget /
  //   ignoreSelectorWhenTouch behavior
  // - with snap points, both vertical directions are legal (directions
  //   ['down','up']) and the release snaps instead of dismissing
  // - swiping is disabled while a nested drawer is open on top (enabled:
  //   mounted && !nestedDrawerOpen)
  // - scroll arbitration keeps the reference's rules (claim the gesture at the
  //   scroller's dismiss edge, yield to cross-axis scrolling past a 6px slop)
  //   but drops iOS pinch/text-selection special cases

  function findScrollable(start, boundary, vertical) {
    let el = start instanceof Element ? start : null;
    while (el && el !== boundary) {
      if (el instanceof HTMLElement) {
        const overflow = window.getComputedStyle(el)[vertical ? "overflowY" : "overflowX"];
        const scrollable = overflow === "auto" || overflow === "scroll";
        const overflows = vertical
          ? el.scrollHeight > el.clientHeight
          : el.scrollWidth > el.clientWidth;
        if (scrollable && overflows) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // Dismissing toward down/right swipes from the scroller's start edge,
  // up/left from its end edge (DrawerViewport isAtSwipeStartEdge).
  function atDismissEdge(scroller, direction) {
    if (direction === "down") return scroller.scrollTop <= 0;
    if (direction === "up")
      return scroller.scrollTop >= Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (direction === "right") return scroller.scrollLeft <= 0;
    return scroller.scrollLeft >= Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  }

  function movingTowardDismiss(direction, delta) {
    return direction === "down" || direction === "right" ? delta > 0 : delta < 0;
  }

  // Maps release velocity to Base UI's --drawer-swipe-strength scalar
  // (DrawerViewport resolveSwipeRelease): the faster the flick and the
  // shorter the remaining distance, the shorter the exit transition. With
  // snap points, the active snap offset already shifted the popup along the
  // dismiss direction and counts toward the travelled distance.
  function resolveSwipeStrength(dialog, size, disp, releaseVelocity, overallVelocity) {
    let base = 0;
    const snap = snapStateOf(dialog);
    if (snap && axisIsY(dialog) && snap.resolved.length > 0) {
      const offset = activeSnapOffset(dialog, snap);
      if (offset !== null) base = offset;
    }
    const remaining = Math.max(0, size - (base + disp));
    if (size <= 0 || remaining <= 0) return 1;
    const velocity = Math.abs(releaseVelocity) > 0 ? releaseVelocity : overallVelocity;
    if (velocity <= MIN_SWIPE_RELEASE_VELOCITY) return 1;
    const clamped = clamp(velocity, MIN_SWIPE_RELEASE_VELOCITY, MAX_SWIPE_RELEASE_VELOCITY);
    const durationMs = clamp(
      remaining / clamped,
      MIN_SWIPE_RELEASE_DURATION_MS,
      MAX_SWIPE_RELEASE_DURATION_MS,
    );
    const normalized =
      (durationMs - MIN_SWIPE_RELEASE_DURATION_MS) /
      (MAX_SWIPE_RELEASE_DURATION_MS - MIN_SWIPE_RELEASE_DURATION_MS);
    return MIN_SWIPE_RELEASE_SCALAR + normalized * (MAX_SWIPE_RELEASE_SCALAR - MIN_SWIPE_RELEASE_SCALAR);
  }

  function attachSwipe(dialog) {
    const state = {
      swiping: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startTime: 0,
      initial: { x: 0, y: 0, scale: 1 },
      offsetX: 0,
      offsetY: 0,
      size: 0,
      lastSample: null,
      lastVelX: 0,
      lastVelY: 0,
      nestedActive: false,
      touch: null,
    };

    function startSwipe(x, y, time) {
      const popup = popupOf(dialog);
      if (!popup) return;
      state.swiping = true;
      state.startX = x;
      state.startY = y;
      state.startTime = time;
      state.initial = getTransform(popup);
      state.offsetX = state.initial.x;
      state.offsetY = state.initial.y;
      state.size = axisIsY(dialog) ? popup.offsetHeight : popup.offsetWidth;
      state.lastSample = { x: state.initial.x, y: state.initial.y, time };
      state.lastVelX = 0;
      state.lastVelY = 0;
      state.nestedActive = false;
      setPartsAttr(dialog, "data-swiping", true);
      // Freeze the element under the pointer (useSwipeDismiss syncDragStyles).
      popup.style.transition = "none";
      // A mouse drag with an expanded selection inside the popup would drag
      // the selection instead (useDrawerSwipe onSwipeStart clears it).
      const selection = document.getSelection?.();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
    }

    function moveSwipe(x, y, time) {
      if (!state.swiping) return;
      const popup = popupOf(dialog);
      if (!popup) return;
      const direction = directionOf(dialog);
      const vertical = axisIsY(dialog);
      const rawDX = x - state.startX;
      const rawDY = y - state.startY;
      const snap = snapStateOf(dialog);
      const snapActive = Boolean(snap && vertical && snap.resolved.length > 0);

      // Directional damping (useSwipeDismiss applyDirectionalDamping):
      // movement toward dismiss passes 1:1, movement past the resting point
      // is damped to sign(d)*|d|^0.5. Only the drawer axis translates. With
      // snap points both vertical directions are allowed, so no damping
      // applies on the axis (directions ['down','up']).
      const damp = (v) => Math.sign(v) * Math.sqrt(Math.abs(v));
      let dx = 0;
      let dy = 0;
      if (vertical) {
        dy = snapActive || movingTowardDismiss(direction, rawDY) ? rawDY : damp(rawDY);
      } else {
        dx = movingTowardDismiss(direction, rawDX) ? rawDX : damp(rawDX);
      }

      state.offsetX = state.initial.x + dx;
      state.offsetY = state.initial.y + dy;
      const deltaX = state.offsetX - state.initial.x;
      const deltaY = state.offsetY - state.initial.y;
      const baseOffset = snapActive ? (activeSnapOffset(dialog, snap) ?? 0) : 0;

      if (snapActive && direction === "down") {
        // Snap-point drag (DrawerViewport onProgress with snap points): the
        // movement var drives the CSS translate, overshoot past fully open
        // is square-root damped (getSnapPointSwipeMovement); no frozen
        // inline transform.
        popup.style.removeProperty("transform");
        popup.style.setProperty("--drawer-swipe-movement-x", "0px");
        popup.style.setProperty(
          "--drawer-swipe-movement-y",
          getSnapPointSwipeMovement(baseOffset, deltaY) + "px",
        );
      } else {
        popup.style.transform =
          "translate3d(" +
          state.offsetX +
          "px," +
          state.offsetY +
          "px,0) scale(" +
          state.initial.scale +
          ")";
        popup.style.setProperty("--drawer-swipe-movement-x", deltaX + "px");
        popup.style.setProperty("--drawer-swipe-movement-y", deltaY + "px");
      }

      // Progress drives the overlay fade. With a snap point range, progress
      // maps the current offset between the two lowest snap points
      // (DrawerViewport offsetToProgress); otherwise it is displacement over
      // the panel size.
      let progress = 0;
      const range = snapActive ? snapRangeOf(dialog, snap) : null;
      if (range && range.range > 0 && snap.popupHeight > 0) {
        progress = clamp(
          (clamp(baseOffset + deltaY, 0, snap.popupHeight) - range.minOffset) / range.range,
          0,
          1,
        );
      } else {
        const disp = displacement(direction, deltaX, deltaY);
        const scale = state.initial.scale || 1;
        progress = state.size > 0 && disp > 0 ? clamp(disp / (state.size * scale), 0, 1) : 0;
      }
      const overlay = overlayOf(dialog);
      if (overlay) overlay.style.setProperty("--drawer-swipe-progress", String(progress));

      // Nested drawer: mirror the progress into the ancestor popups and flag
      // them as nested-swiping once the gesture passes the 10px threshold
      // (DrawerViewport updateNestedSwipeActive).
      if (dialog.getAttribute("data-tui-drawer-parent")) {
        notifyAncestors(dialog, progress);
        if (
          !state.nestedActive &&
          Math.abs(displacement(direction, deltaX, deltaY)) >= MIN_SWIPE_THRESHOLD
        ) {
          state.nestedActive = true;
          setAncestorsSwiping(dialog, true);
        }
      }

      if (state.lastSample && time > state.lastSample.time) {
        const durationMs = Math.max(
          time - state.lastSample.time,
          MIN_RELEASE_VELOCITY_DURATION_MS,
        );
        state.lastVelX = (state.offsetX - state.lastSample.x) / durationMs;
        state.lastVelY = (state.offsetY - state.lastSample.y) / durationMs;
      }
      state.lastSample = { x: state.offsetX, y: state.offsetY, time };
    }

    function finishNestedSwipe(progress) {
      if (dialog.getAttribute("data-tui-drawer-parent")) {
        notifyAncestors(dialog, progress);
      }
      state.nestedActive = false;
      setAncestorsSwiping(dialog, false);
    }

    function endSwipe(time) {
      if (!state.swiping) return;
      state.swiping = false;
      state.pointerId = null;
      setPartsAttr(dialog, "data-swiping", false);
      const popup = popupOf(dialog);
      if (!popup) return;

      const direction = directionOf(dialog);
      const vertical = axisIsY(dialog);
      const deltaX = state.offsetX - state.initial.x;
      const deltaY = state.offsetY - state.initial.y;
      const disp = displacement(direction, deltaX, deltaY);

      // Overall gesture velocity, floored at 50ms (useSwipeDismiss handleEnd).
      const durationMs =
        time > state.startTime ? Math.max(time - state.startTime, MIN_VELOCITY_DURATION_MS) : 0;
      const overallVelocity = durationMs > 0 ? disp / durationMs : 0;
      const overallVelY = durationMs > 0 ? deltaY / durationMs : 0;

      // Release velocity from the last drag sample, discarded when stale
      // (pointer rested >80ms before release).
      let relVelX = state.lastVelX;
      let relVelY = state.lastVelY;
      if (state.lastSample && time - state.lastSample.time > MAX_RELEASE_VELOCITY_AGE_MS) {
        relVelX = 0;
        relVelY = 0;
      }
      const releaseVelocity = displacement(direction, relVelX, relVelY);

      popup.style.removeProperty("transition");
      popup.style.removeProperty("transform");

      const snap = snapStateOf(dialog);
      const snapActive = Boolean(snap && vertical && snap.resolved.length > 0);

      if (snapActive && snap.popupHeight > 0) {
        // DrawerViewport onRelease with snap points: the release picks the
        // next snap point (or close) from drag distance plus a velocity
        // offset.
        const popupHeight = snap.popupHeight;
        const dragDelta = direction === "down" ? deltaY : -deltaY;
        const dragDirection = Math.sign(dragDelta);
        const releaseDirectional = direction === "down" ? relVelY : -relVelY;
        const fallbackDirectional = direction === "down" ? overallVelY : -overallVelY;
        let resolvedVelocity = releaseDirectional;
        if (dragDirection !== 0 && Math.abs(dragDelta) >= MIN_SWIPE_THRESHOLD) {
          const velocityDirection = Math.sign(resolvedVelocity);
          if (velocityDirection !== 0 && velocityDirection !== dragDirection) {
            // Ignore touch reversals that would otherwise flip the snap
            // decision.
            resolvedVelocity = fallbackDirectional;
          }
        }

        const currentOffset = activeSnapOffset(dialog, snap) ?? 0;
        const dragTargetOffset = clamp(currentOffset + dragDelta, 0, popupHeight);
        const velocityOffset =
          Math.abs(resolvedVelocity) >= SNAP_VELOCITY_THRESHOLD
            ? clamp(resolvedVelocity, -MAX_SNAP_VELOCITY, MAX_SNAP_VELOCITY) *
              SNAP_VELOCITY_MULTIPLIER
            : 0;
        const targetOffset = snap.sequential
          ? dragTargetOffset
          : clamp(dragTargetOffset + velocityOffset, 0, popupHeight);

        const closeFromSnapPoints = () => {
          // Compute the strength while the active snap offset still counts
          // toward the travelled distance (resolveSwipeRelease reads it
          // before setActiveSnapPoint(null) flushes).
          const strength = resolveSwipeStrength(
            dialog,
            popupHeight,
            disp,
            releaseVelocity,
            overallVelocity,
          );
          const previousActive = snap.active;
          snap.active = null;
          finishNestedSwipe(0);
          if (!requestOpenChange(dialog, false, strength)) {
            snap.active = previousActive;
            applySnapState(dialog);
            popup.style.setProperty("--drawer-swipe-movement-x", "0px");
            popup.style.setProperty("--drawer-swipe-movement-y", "0px");
          }
        };
        const settle = (point) => {
          snap.active = point.value;
          applySnapState(dialog);
          void popup.offsetWidth;
          popup.style.setProperty("--drawer-swipe-movement-x", "0px");
          popup.style.setProperty("--drawer-swipe-movement-y", "0px");
          finishNestedSwipe(0);
        };

        if (snap.sequential) {
          // snapToSequentialPoints: drag distance decides, velocity only
          // advances to the adjacent point.
          const ordered = [...snap.resolved].sort((a, b) => a.offset - b.offset);
          const offsets = ordered.map((point) => point.offset);
          const currentIndex = closestSnapPointIndex(offsets, currentOffset);
          let targetSnapPoint = ordered[closestSnapPointIndex(offsets, targetOffset)];
          const velocityDirection = Math.sign(resolvedVelocity);
          const shouldAdvance =
            dragDirection !== 0 &&
            velocityDirection !== 0 &&
            velocityDirection === dragDirection &&
            Math.abs(resolvedVelocity) >= SNAP_VELOCITY_THRESHOLD;
          let effectiveTargetOffset = targetOffset;
          if (shouldAdvance) {
            const adjacentIndex = clamp(currentIndex + dragDirection, 0, ordered.length - 1);
            if (adjacentIndex !== currentIndex) {
              const adjacentPoint = ordered[adjacentIndex];
              const shouldForceAdjacent =
                dragDirection > 0
                  ? targetOffset < adjacentPoint.offset
                  : targetOffset > adjacentPoint.offset;
              if (shouldForceAdjacent) {
                targetSnapPoint = adjacentPoint;
                effectiveTargetOffset = adjacentPoint.offset;
              }
            } else if (dragDirection > 0) {
              closeFromSnapPoints();
              return;
            }
          }
          const closeDistance = Math.abs(effectiveTargetOffset - popupHeight);
          const snapDistance = Math.abs(effectiveTargetOffset - targetSnapPoint.offset);
          if (closeDistance < snapDistance) {
            closeFromSnapPoints();
            return;
          }
          settle(targetSnapPoint);
          return;
        }

        if (resolvedVelocity >= FAST_SWIPE_VELOCITY && dragDelta > 0) {
          closeFromSnapPoints();
          return;
        }
        const closestSnapPoint =
          snap.resolved[
            closestSnapPointIndex(
              snap.resolved.map((point) => point.offset),
              targetOffset,
            )
          ];
        const closeDistance = Math.abs(targetOffset - popupHeight);
        if (closeDistance < Math.abs(targetOffset - closestSnapPoint.offset)) {
          closeFromSnapPoints();
          return;
        }
        settle(closestSnapPoint);
        return;
      }

      // Dismiss on a flick (>=0.5px/ms) or past half the panel's size
      // (DrawerViewport onRelease + getBaseSwipeThreshold).
      const threshold = Math.max(state.size * 0.5, MIN_SWIPE_THRESHOLD);
      const shouldClose = disp > 0 && (overallVelocity >= FAST_SWIPE_VELOCITY || disp > threshold);

      if (shouldClose) {
        finishNestedSwipe(0);
        const closed = requestOpenChange(
          dialog,
          false,
          resolveSwipeStrength(dialog, state.size, disp, releaseVelocity, overallVelocity),
        );
        if (closed) return;
      }

      // Spring back: hand the transform to the movement vars at the released
      // position, then zero them so the 450ms transform transition returns
      // the panel (the reference does the same through getDragStyles).
      void popup.offsetWidth;
      popup.style.setProperty("--drawer-swipe-movement-x", "0px");
      popup.style.setProperty("--drawer-swipe-movement-y", "0px");
      const overlay = overlayOf(dialog);
      if (overlay) overlay.style.setProperty("--drawer-swipe-progress", "0");
      finishNestedSwipe(0);
    }

    // Mouse and pen: swipes start on the panel chrome (swipe handle, bleed,
    // padding) but not inside the content wrapper or on interactive elements
    // (DrawerViewport onPointerDown: isSwipeIgnoredTarget/isDrawerContentTarget).
    // A press outside the popup is a backdrop dismiss, handled below.
    dialog.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      if (event.button !== 0) return;
      const popup = popupOf(dialog);
      if (!popup || popup.hasAttribute("data-ending-style") || hasOpenNested(dialog)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !popup.contains(target)) return;
      if (target.closest(IGNORE_SELECTOR) || target.closest('[data-slot="drawer-content"]')) {
        return;
      }
      startSwipe(event.clientX, event.clientY, event.timeStamp);
      state.pointerId = event.pointerId;
      try {
        dialog.setPointerCapture(event.pointerId);
      } catch {
        /* no capture, moves still bubble */
      }
    });

    dialog.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      if (!state.swiping || state.pointerId !== event.pointerId) return;
      event.preventDefault(); // prevent text selection while dragging
      moveSwipe(event.clientX, event.clientY, event.timeStamp);
    });

    const onPointerEnd = (event) => {
      if (event.pointerType === "touch") return;
      if (state.pointerId !== event.pointerId) return;
      try {
        dialog.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      endSwipe(event.timeStamp);
    };
    dialog.addEventListener("pointerup", onPointerEnd);
    dialog.addEventListener("pointercancel", onPointerEnd);

    // Touch: swipes can start anywhere in the panel, arbitrated against
    // scrollable content (DrawerViewport onTouchStart/processTouchMove).
    dialog.addEventListener(
      "touchstart",
      (event) => {
        const popup = popupOf(dialog);
        if (!popup || popup.hasAttribute("data-ending-style") || hasOpenNested(dialog)) return;
        if (event.touches.length !== 1) {
          state.touch = null;
          return;
        }
        const touch = event.touches[0];
        const target = event.target instanceof Element ? event.target : popup;
        if (!popup.contains(target) || target.closest('input[type="range"]')) {
          state.touch = null;
          return;
        }
        const vertical = axisIsY(dialog);
        const scrollTarget = findScrollable(target, popup, vertical);
        const crossScrollable = !!findScrollable(target, popup, !vertical);
        state.touch = {
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY,
          scrollTarget,
          crossScrollable,
          // null: undecided, claim on a move toward dismiss from the edge.
          allowSwipe: scrollTarget
            ? atDismissEdge(scrollTarget, directionOf(dialog))
              ? null
              : false
            : null,
          yieldToScroll: false,
          attributed: false,
        };
      },
      { passive: true },
    );

    dialog.addEventListener(
      "touchmove",
      (event) => {
        const touchState = state.touch;
        if (!touchState || event.touches.length !== 1) return;
        const touch = event.touches[0];
        const vertical = axisIsY(dialog);
        const direction = directionOf(dialog);
        const snap = snapStateOf(dialog);
        const snapActive = Boolean(snap && vertical && snap.resolved.length > 0);
        const axisDelta = vertical
          ? touch.clientY - touchState.lastY
          : touch.clientX - touchState.lastX;
        touchState.lastX = touch.clientX;
        touchState.lastY = touch.clientY;

        if (touchState.yieldToScroll) return;

        // A non-cancelable move means the browser committed to a native
        // scroll (shouldYieldTouchMove).
        if (!event.cancelable && !state.swiping) {
          touchState.yieldToScroll = true;
          return;
        }

        // Axis arbitration against cross-axis scrollable content: yield once
        // the cross axis wins the slop race, claim once the drawer axis does.
        if (!touchState.attributed && touchState.allowSwipe !== true && touchState.crossScrollable) {
          const dAxis = vertical
            ? touch.clientY - touchState.startY
            : touch.clientX - touchState.startX;
          const dCross = vertical
            ? touch.clientX - touchState.startX
            : touch.clientY - touchState.startY;
          if (
            Math.abs(dCross) >= AXIS_LOCK_SLOP &&
            Math.abs(dCross) > Math.abs(dAxis) + AXIS_LOCK_BIAS
          ) {
            touchState.yieldToScroll = true;
            return;
          }
          if (Math.abs(dAxis) >= AXIS_LOCK_SLOP) touchState.attributed = true;
          else return; // unattributed: leave the event to the browser
        }

        if (touchState.scrollTarget) {
          // Scrolling content owns the gesture until the scroller sits at the
          // dismiss edge and the finger moves toward dismiss; then the drawer
          // claims it (canSwipeFromScrollEdgeOnMove). With snap points, any
          // vertical move from the edge may snap, so both directions claim.
          if (touchState.allowSwipe !== true && axisDelta !== 0) {
            touchState.allowSwipe =
              event.cancelable &&
              (snapActive || movingTowardDismiss(direction, axisDelta)) &&
              atDismissEdge(touchState.scrollTarget, direction);
          }
          if (touchState.allowSwipe !== true) return;
        }

        if (event.cancelable) event.preventDefault();
        event.stopPropagation();

        if (!state.swiping) {
          // Absorb the press-to-first-move gap so the panel doesn't jump
          // (useSwipeDismiss isFirstPointerMoveRef note).
          startSwipe(touch.clientX, touch.clientY, event.timeStamp);
        }
        moveSwipe(touch.clientX, touch.clientY, event.timeStamp);
      },
      { passive: false },
    );

    const onTouchEnd = (event) => {
      state.touch = null;
      endSwipe(event.timeStamp);
    };
    dialog.addEventListener("touchend", onTouchEnd);
    dialog.addEventListener("touchcancel", onTouchEnd);
  }

  // ----- lifecycle -----------------------------------------------------------

  function ensureDrawer(dialog) {
    if (!dialog || dialog.dataset.tuiDrawerInitialized === "true") return dialog;
    dialog.dataset.tuiDrawerInitialized = "true";
    listenForEscape(dialog);

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      requestOpenChange(dialog, false);
    });

    dialog.addEventListener("close", () => {
      window.clearTimeout(dialog._tuiCloseTimer);
      delete dialog._tuiCloseTimer;
      cleanupClosed(dialog);
    });

    // A press anywhere outside the popup (on the viewport or the overlay) is
    // an outside press and dismisses the drawer (Base UI outside press). For
    // non-modal drawers the viewport is pointer-events-none, so outside
    // presses reach the page instead — same as before.
    dialog.addEventListener("pointerdown", (event) => {
      if (!dialog.open) return;
      if (dialog.hasAttribute("data-tui-drawer-disable-dismissible")) return;
      const popup = popupOf(dialog);
      const target = event.target instanceof Element ? event.target : null;
      if (popup && target && !popup.contains(target)) requestOpenChange(dialog, false);
    });

    attachSwipe(dialog);

    return dialog;
  }

  // Moves the drawer to <body>, the pendant of the reference's DrawerPortal.
  function portal(dialog) {
    if (dialog.parentElement !== document.body) {
      if (!dialog._tuiPortalOwner) dialog._tuiPortalOwner = dialog.parentElement;
      document.body.appendChild(dialog);
    }
  }

  function init(root = document) {
    root.querySelectorAll("[data-tui-drawer-trigger]").forEach(listenForEscape);
    // Self-healing modality: recompute the inert siblings on every DOM
    // change, so a swap or a missed close event never leaves stale inert.
    syncInert();
    // The unmount half of the React portal pendant: a drawer lives as long
    // as its SSR declaration site (_tuiPortalOwner) stays in the document.
    // Ownership keeps programmatic drawers (window.tui.drawer.open) alive
    // and judges swaps without mid-swap trigger heuristics.
    document.querySelectorAll("body > dialog[data-tui-drawer-content]").forEach((dialog) => {
      if (dialog._tuiPortalOwner && !dialog._tuiPortalOwner.isConnected) {
        unwatchSnapResize(dialog);
        dialog._tuiReleaseScroll?.();
        dialog._tuiReleaseScroll = null;
        dialog.remove();
      }
    });
    root.querySelectorAll("dialog[data-tui-drawer-content]").forEach((dialog) => {
      if (dialog.dataset.tuiDrawerInitialized === "true") return;
      ensureDrawer(dialog);

      if (dialog.getAttribute("data-tui-drawer-initial-open") === "true") {
        // One-shot: consume the attribute so a later re-init never re-opens
        // a closed drawer.
        dialog.removeAttribute("data-tui-drawer-initial-open");
        openDrawer(dialog);
      } else {
        updateState(dialog, dialog.open);
      }
    });
    syncStack();
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest("[data-tui-drawer-trigger]");
    if (trigger) {
      toggleDrawer(drawerFor(trigger));
      return;
    }
    const closeButton = event.target.closest("[data-tui-drawer-close]");
    if (closeButton) {
      requestOpenChange(drawerFor(closeButton), false);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }

  // Initialize drawers added later (e.g. swapped in via htmx), so a
  // server-rendered drawer with Open true still opens. Also
  // release the scroll lock if an open drawer got swapped out of the DOM.
  new MutationObserver(() => {
    init();
  }).observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.tui = window.tui || {};
  window.tui.drawer = {
    open: openDrawer,
    close: closeDrawer,
    toggle: toggleDrawer,
    isOpen: isDrawerOpen,
    setSnapPoint: setSnapPoint,
    getSnapPoint: getSnapPoint,
  };
})();
