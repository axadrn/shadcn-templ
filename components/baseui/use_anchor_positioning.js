// Port of @base-ui/react utils/useAnchorPositioning.ts (1.6.0) over
// window.FloatingUIDOM from components/floatingui, with the floatingStyles of
// @floating-ui/react's useFloating.
//
// useAnchorPositioning(options) runs while the popup is mounted: it positions
// the positioner against the anchor and keeps it there (autoUpdate), and
// returns { cleanup, positioned }, where positioned resolves after the first
// position.
//
//   anchor              element, or a virtual element with getBoundingClientRect
//   positioner          the element that is positioned
//   parts               elements that render data-side and data-align (positioner, popup, arrow)
//   arrow               the arrow element, if any
//   positionMethod      "absolute" or "fixed"
//   side                top, right, bottom, left, inline-start, inline-end
//   align               start, center, end
//   sideOffset, alignOffset, collisionPadding, arrowPadding, sticky
//   collisionAvoidance  { side, align, fallbackAxisSide }
//   shiftCrossAxis, lazyFlip, disableAnchorTracking
//   inline              an extra middleware placed first, like the source
//   applyPosition       a function; while it returns false the positioner keeps
//                       its own position (select aligned with its trigger), the
//                       variables are still set
//   onPosition(result)  called after every position
//
//   adaptiveOrigin      true for popups with a viewport part (NavigationMenu):
//                       left/top (right/bottom on the top and left sides) in
//                       place of the transform, so the size and position can
//                       transition together while it stays anchored
//
// The returned setAnchor(element) moves it to another anchor without
// unpositioning it, like refs.setPositionReference.
(function () {
  "use strict";

  const getSide = (placement) => placement.split("-")[0];
  const getAlignment = (placement) => placement.split("-")[1];
  const getSideAxis = (side) => (side === "top" || side === "bottom" ? "y" : "x");

  function getLogicalSide(sideParam, renderedSide, isRtl) {
    const isLogicalSideParam = sideParam === "inline-start" || sideParam === "inline-end";
    const logicalRight = isRtl ? "inline-start" : "inline-end";
    const logicalLeft = isRtl ? "inline-end" : "inline-start";
    return {
      top: "top",
      right: isLogicalSideParam ? logicalRight : "right",
      bottom: "bottom",
      left: isLogicalSideParam ? logicalLeft : "left",
    }[renderedSide];
  }

  // DirectionProvider pendant: the nearest dir attribute.
  function isRtlAt(element) {
    const el = element?.closest ? element : element?.contextElement;
    return window.templ.direction.useDirection(el) === "rtl";
  }

  // utils/hideMiddleware.ts: an anchor with an empty rect counts as hidden too.
  function hideMiddleware() {
    const nativeHideFn = window.FloatingUIDOM.hide().fn;
    return {
      name: "hide",
      async fn(state) {
        const { width, height, x, y } = state.rects.reference;
        const anchorHidden = width === 0 && height === 0 && x === 0 && y === 0;
        const nativeHideResult = await nativeHideFn(state);
        return { data: { referenceHidden: nativeHideResult.data?.referenceHidden || anchorHidden } };
      },
    };
  }

  // floating-ui-react/middleware/arrow.ts: Base UI's fork of arrow() that
  // measures against the positioner, not the arrow's offset parent.
  function arrowMiddleware({ element, padding = 0 }) {
    return {
      name: "arrow",
      async fn(state) {
        const { x, y, placement, rects, platform, elements, middlewareData } = state;
        const paddingObject = typeof padding === "number"
          ? { top: padding, right: padding, bottom: padding, left: padding }
          : { top: 0, right: 0, bottom: 0, left: 0, ...padding };
        const coords = { x, y };
        const axis = getSideAxis(getSide(placement)) === "y" ? "x" : "y";
        const length = axis === "y" ? "height" : "width";
        const arrowDimensions = await platform.getDimensions(element);
        const isYAxis = axis === "y";
        const minProp = isYAxis ? "top" : "left";
        const maxProp = isYAxis ? "bottom" : "right";
        const clientProp = isYAxis ? "clientHeight" : "clientWidth";
        const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
        const startDiff = coords[axis] - rects.reference[axis];
        const clientSize = elements.floating[clientProp] || rects.floating[length];
        const centerToReference = endDiff / 2 - startDiff / 2;
        // Padding large enough to push the arrow off center is reduced.
        const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
        const minPadding = Math.min(paddingObject[minProp], largestPossiblePadding);
        const maxPadding = Math.min(paddingObject[maxProp], largestPossiblePadding);
        const min = minPadding;
        const max = clientSize - arrowDimensions[length] - maxPadding;
        const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
        const offset = Math.min(Math.max(min, center), max);
        // A reference too small for an aligned arrow moves the popup itself,
        // with one reset so shift() still runs.
        const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset &&
          rects.reference[length] / 2 - (center < min ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
        const alignmentOffset = shouldAddOffset ? (center < min ? center - min : center - max) : 0;
        return {
          [axis]: coords[axis] + alignmentOffset,
          data: {
            [axis]: offset,
            centerOffset: center - offset - alignmentOffset,
            ...(shouldAddOffset && { alignmentOffset }),
          },
          reset: shouldAddOffset,
        };
      },
    };
  }

  // @floating-ui/react roundByDPR
  function roundByDPR(element, value) {
    const dpr = element.ownerDocument.defaultView.devicePixelRatio || 1;
    return Math.round(value * dpr) / dpr;
  }

  // utils/adaptiveOriginMiddleware.ts
  const DEFAULT_SIDES = { sideX: "left", sideY: "top" };
  const adaptiveOriginMiddleware = {
    name: "adaptiveOrigin",
    async fn(state) {
      const { x: rawX, y: rawY, rects: { floating: floatRect }, elements: { floating }, platform, strategy, placement } = state;
      const win = floating.ownerDocument.defaultView;
      const styles = win.getComputedStyle(floating);
      const hasTransition = styles.transitionDuration !== "0s" && styles.transitionDuration !== "";
      if (!hasTransition) return { x: rawX, y: rawY, data: DEFAULT_SIDES };
      const offsetParent = await platform.getOffsetParent?.(floating);
      let offsetDimensions = { width: 0, height: 0 };
      if (strategy === "fixed" && win?.visualViewport) {
        offsetDimensions = { width: win.visualViewport.width, height: win.visualViewport.height };
      } else if (offsetParent === win) {
        const doc = floating.ownerDocument;
        offsetDimensions = { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight };
      } else if (await platform.isElement?.(offsetParent)) {
        offsetDimensions = await platform.getDimensions(offsetParent);
      }
      const currentSide = getSide(placement);
      let x = rawX;
      let y = rawY;
      if (currentSide === "left") x = offsetDimensions.width - (rawX + floatRect.width);
      if (currentSide === "top") y = offsetDimensions.height - (rawY + floatRect.height);
      return {
        x,
        y,
        data: { sideX: currentSide === "left" ? "right" : DEFAULT_SIDES.sideX, sideY: currentSide === "top" ? "bottom" : DEFAULT_SIDES.sideY },
      };
    },
  };

  function useAnchorPositioning(options) {
    let {
      anchor,
    } = options;
    const {
      positioner,
      arrow: arrowEl = null,
      positionMethod = "absolute",
      side: sideParam = "bottom",
      sideOffset = 0,
      align = "center",
      alignOffset = 0,
      collisionPadding: collisionPaddingParam = 5,
      sticky = false,
      arrowPadding = 5,
      disableAnchorTracking = false,
      inline: inlineMiddleware,
      collisionAvoidance = {},
      shiftCrossAxis = false,
      lazyFlip = false,
      applyPosition = () => true,
      adaptiveOrigin = false,
      onPosition,
    } = options;
    const parts = (options.parts || [positioner]).filter(Boolean);
    const { computePosition, autoUpdate, offset, flip, shift, limitShift, size } = window.FloatingUIDOM;

    const collisionAvoidanceSide = collisionAvoidance.side || "flip";
    const collisionAvoidanceAlign = collisionAvoidance.align || "flip";
    const collisionAvoidanceFallbackAxisSide = collisionAvoidance.fallbackAxisSide || "end";
    // Base UI reads useDirection in the positioner.
    const isRtl = isRtlAt(positioner);
    let mountSide = null;

    // Create a bias to the preferred side. On iOS, when the software keyboard
    // opens, the input is exactly centered and could flip to the top.
    const bias = 1;
    const biasTop = sideParam === "bottom" ? bias : 0;
    const biasBottom = sideParam === "top" ? bias : 0;
    const biasLeft = sideParam === "right" ? bias : 0;
    const biasRight = sideParam === "left" ? bias : 0;
    const padding = typeof collisionPaddingParam === "number"
      ? { top: collisionPaddingParam, right: collisionPaddingParam, bottom: collisionPaddingParam, left: collisionPaddingParam }
      : collisionPaddingParam;
    const collisionPadding = {
      top: (padding.top || 0) + biasTop,
      right: (padding.right || 0) + biasRight,
      bottom: (padding.bottom || 0) + biasBottom,
      left: (padding.left || 0) + biasLeft,
    };
    const commonCollisionProps = { boundary: "clippingAncestors", padding: collisionPadding };

    function getOffsetData(state) {
      return {
        side: getLogicalSide(sideParam, getSide(state.placement), isRtl),
        align: getAlignment(state.placement) || "center",
        anchor: { width: state.rects.reference.width, height: state.rects.reference.height },
        positioner: { width: state.rects.floating.width, height: state.rects.floating.height },
      };
    }
    const resolveOffset = (value, state) => (typeof value === "function" ? value(getOffsetData(state)) : value);

    const shiftDisabled = collisionAvoidanceAlign === "none" && collisionAvoidanceSide !== "shift";
    const crossAxisShiftEnabled = !shiftDisabled && (sticky || shiftCrossAxis || collisionAvoidanceSide === "shift");

    function middleware() {
      const list = [];
      if (inlineMiddleware) list.push(inlineMiddleware);
      list.push(offset((state) => {
        const sideAxis = resolveOffset(sideOffset, state);
        const alignAxis = resolveOffset(alignOffset, state);
        return { mainAxis: sideAxis, crossAxis: alignAxis, alignmentAxis: alignAxis };
      }));
      const flipMiddleware = collisionAvoidanceSide === "none" ? null : flip({
        ...commonCollisionProps,
        // The popup flips once it was limited by its --available-height and
        // resizes, since the size() padding is smaller than this one.
        padding: {
          top: collisionPadding.top + bias,
          right: collisionPadding.right + bias,
          bottom: collisionPadding.bottom + bias,
          left: collisionPadding.left + bias,
        },
        mainAxis: !shiftCrossAxis && collisionAvoidanceSide === "flip",
        crossAxis: collisionAvoidanceAlign === "flip" ? "alignment" : false,
        fallbackAxisSideDirection: collisionAvoidanceFallbackAxisSide,
      });
      const shiftMiddleware = shiftDisabled ? null : shift((data) => {
        const html = data.elements.floating.ownerDocument.documentElement;
        return {
          ...commonCollisionProps,
          // The layout viewport, so pinch zooming does not shift context menus.
          rootBoundary: shiftCrossAxis ? { x: 0, y: 0, width: html.clientWidth, height: html.clientHeight } : undefined,
          mainAxis: collisionAvoidanceAlign !== "none",
          crossAxis: crossAxisShiftEnabled,
          limiter: sticky || shiftCrossAxis ? undefined : limitShift((limitData) => {
            if (!arrowEl) return {};
            const { width, height } = arrowEl.getBoundingClientRect();
            const sideAxis = getSideAxis(getSide(limitData.placement));
            const arrowSize = sideAxis === "y" ? width : height;
            const offsetAmount = sideAxis === "y"
              ? collisionPadding.left + collisionPadding.right
              : collisionPadding.top + collisionPadding.bottom;
            return { offset: arrowSize / 2 + offsetAmount / 2 };
          }),
        };
      });
      // https://floating-ui.com/docs/flip#combining-with-shift
      if (collisionAvoidanceSide === "shift" || collisionAvoidanceAlign === "shift" || align === "center") {
        list.push(shiftMiddleware, flipMiddleware);
      } else {
        list.push(flipMiddleware, shiftMiddleware);
      }
      list.push(
        size({
          ...commonCollisionProps,
          apply({ elements: { floating }, availableWidth, availableHeight, rects }) {
            const style = floating.style;
            style.setProperty("--available-width", `${availableWidth}px`);
            style.setProperty("--available-height", `${availableHeight}px`);
            // Snap the anchor size to device pixels, so the popup's visual
            // width matches the anchor's.
            const dpr = floating.ownerDocument.defaultView.devicePixelRatio || 1;
            const { x, y, width, height } = rects.reference;
            const anchorWidth = (Math.round((x + width) * dpr) - Math.round(x * dpr)) / dpr;
            const anchorHeight = (Math.round((y + height) * dpr) - Math.round(y * dpr)) / dpr;
            style.setProperty("--anchor-width", `${anchorWidth}px`);
            style.setProperty("--anchor-height", `${anchorHeight}px`);
          },
        }),
        // transform-origin relies on an arrow element, a detached one when
        // the popup has none.
        arrowMiddleware({ element: arrowEl || document.createElement("div"), padding: arrowPadding }),
        {
          name: "transformOrigin",
          fn(state) {
            const { elements, middlewareData, placement: renderedPlacement, rects, y } = state;
            const currentRenderedSide = getSide(renderedPlacement);
            const currentRenderedAxis = getSideAxis(currentRenderedSide);
            const arrowX = middlewareData.arrow?.x || 0;
            const arrowY = middlewareData.arrow?.y || 0;
            const arrowWidth = arrowEl?.clientWidth || 0;
            const arrowHeight = arrowEl?.clientHeight || 0;
            const transformX = arrowX + arrowWidth / 2;
            const transformY = arrowY + arrowHeight / 2;
            const shiftY = Math.abs(middlewareData.shift?.y || 0);
            const halfAnchorHeight = rects.reference.height / 2;
            const sideOffsetValue = resolveOffset(sideOffset, state);
            const isOverlappingAnchor = shiftY > sideOffsetValue;
            const adjacentTransformOrigin = {
              top: `${transformX}px calc(100% + ${sideOffsetValue}px)`,
              bottom: `${transformX}px ${-sideOffsetValue}px`,
              left: `calc(100% + ${sideOffsetValue}px) ${transformY}px`,
              right: `${-sideOffsetValue}px ${transformY}px`,
            }[currentRenderedSide];
            const overlapTransformOrigin = `${transformX}px ${rects.reference.y + halfAnchorHeight - y}px`;
            elements.floating.style.setProperty(
              "--transform-origin",
              crossAxisShiftEnabled && currentRenderedAxis === "y" && isOverlappingAnchor
                ? overlapTransformOrigin
                : adjacentTransformOrigin,
            );
            return {};
          },
        },
        hideMiddleware(),
        adaptiveOrigin ? adaptiveOriginMiddleware : null,
      );
      return list.filter(Boolean);
    }

    function placement() {
      const side = mountSide || {
        top: "top",
        right: "right",
        bottom: "bottom",
        left: "left",
        "inline-end": isRtl ? "left" : "right",
        "inline-start": isRtl ? "right" : "left",
      }[sideParam];
      return align === "center" ? side : `${side}-${align}`;
    }

    // Not positioned yet: fixed, so autoFocus does not scroll, and invisible.
    positioner.style.position = "fixed";
    positioner.style.opacity = "0";

    let active = true;
    let resolvePositioned;
    const positioned = new Promise((resolve) => {
      resolvePositioned = resolve;
    });

    function update() {
      return computePosition(anchor, positioner, {
        placement: placement(),
        strategy: positionMethod,
        middleware: middleware(),
      }).then((result) => {
        if (!active) return;
        const style = positioner.style;
        const renderedSide = getSide(result.placement);
        const renderedAlign = getAlignment(result.placement) || "center";
        const logicalSide = getLogicalSide(sideParam, renderedSide, isRtl);
        style.opacity = "";
        if (applyPosition()) {
          style.position = positionMethod;
          if (adaptiveOrigin) {
            // { position, [sideX]: x, [sideY]: y }
            const { sideX, sideY } = result.middlewareData.adaptiveOrigin || DEFAULT_SIDES;
            ["left", "top", "right", "bottom"].forEach((prop) => {
              if (prop !== sideX && prop !== sideY) style[prop] = "";
            });
            style[sideX] = `${result.x}px`;
            style[sideY] = `${result.y}px`;
          } else {
            // floatingStyles of useFloating with transform: true
            style.left = "0px";
            style.top = "0px";
            style.transform = `translate(${roundByDPR(positioner, result.x)}px, ${roundByDPR(positioner, result.y)}px)`;
            if ((positioner.ownerDocument.defaultView.devicePixelRatio || 1) >= 1.5) style.willChange = "transform";
          }
          parts.forEach((part) => part.setAttribute("data-side", logicalSide));
        }
        parts.forEach((part) => part.setAttribute("data-align", renderedAlign));
        positioner.toggleAttribute("data-anchor-hidden", !!result.middlewareData.hide?.referenceHidden);
        if (arrowEl) {
          arrowEl.style.position = "absolute";
          arrowEl.style.left = result.middlewareData.arrow?.x != null ? `${result.middlewareData.arrow.x}px` : "";
          arrowEl.style.top = result.middlewareData.arrow?.y != null ? `${result.middlewareData.arrow.y}px` : "";
          arrowEl.toggleAttribute("data-uncentered", result.middlewareData.arrow?.centerOffset !== 0);
        }
        // lazyFlip locks the side once positioned, so a filtered list that
        // resizes does not flip back and forth.
        if (lazyFlip) mountSide = renderedSide;
        onPosition?.(result, logicalSide);
        resolvePositioned();
      });
    }

    const autoUpdateOptions = {
      elementResize: !disableAnchorTracking && typeof ResizeObserver !== "undefined",
      layoutShift: !disableAnchorTracking && typeof IntersectionObserver !== "undefined",
    };
    let stopAutoUpdate = autoUpdate(anchor, positioner, update, autoUpdateOptions);

    return {
      positioned,
      update,
      setAnchor(next) {
        if (!active || next === anchor) return;
        stopAutoUpdate();
        anchor = next;
        stopAutoUpdate = autoUpdate(anchor, positioner, update, autoUpdateOptions);
      },
      cleanup() {
        active = false;
        stopAutoUpdate();
        resolvePositioned();
      },
    };
  }

  window.templ = window.templ || {};
  window.templ.anchorPositioning = { useAnchorPositioning };
})();
