// Port of @base-ui/react internals/composite (1.6.0): useCompositeRoot.ts,
// useCompositeItem.ts and composite.ts, with floating-ui-react's
// utils/composite.ts list helpers, which use_list_navigation.js shares. One tab stop for a group of items,
// the arrow keys move it by orientation, optionally Home and End, with loop.
//
//   const composite = window.templ.composite.useCompositeRoot(root, options)
//   composite.highlight(index)   onHighlightedIndexChange from the component
//   composite.index()            the highlighted index
//   composite.cleanup()
//
//   items()                the items in order (elementsRef)
//   loopFocus              default true
//   orientation            "horizontal", "vertical" or "both" (default)
//   rtl()                  the direction
//   enableHomeAndEndKeys   default false
//   stopEventPropagation   default true, CompositeRoot's
//   disabledIndices        an array, a function, or undefined for the DOM
//   modifierKeys           modifiers that do not cancel the navigation
//   highlightItemOnHover   default false
//   onHighlightedIndexChange(index)   after the highlight moved
//
// The root sets the default tab stop once on creation (onMapChange): the item
// with data-composite-item-active, or the first enabled one when the first
// is disabled. The items' tabIndex follows the highlight.
(function () {
  "use strict";

  const ACTIVE_COMPOSITE_ITEM = "data-composite-item-active";
  const ARROW_UP = "ArrowUp";
  const ARROW_DOWN = "ArrowDown";
  const ARROW_LEFT = "ArrowLeft";
  const ARROW_RIGHT = "ArrowRight";
  const HOME = "Home";
  const END = "End";
  const HORIZONTAL_KEYS = new Set([ARROW_LEFT, ARROW_RIGHT]);
  const HORIZONTAL_KEYS_WITH_EXTRA_KEYS = new Set([ARROW_LEFT, ARROW_RIGHT, HOME, END]);
  const VERTICAL_KEYS = new Set([ARROW_UP, ARROW_DOWN]);
  const VERTICAL_KEYS_WITH_EXTRA_KEYS = new Set([ARROW_UP, ARROW_DOWN, HOME, END]);
  const ARROW_KEYS = new Set([...HORIZONTAL_KEYS, ...VERTICAL_KEYS]);
  const COMPOSITE_KEYS = new Set([...ARROW_KEYS, HOME, END]);
  const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

  const t = () => window.templ.tabbable;

  // ----- utils/composite.ts: the list helpers, shared with use_list_navigation.js

  function isIndexOutOfListBounds(list, index) {
    return index < 0 || index >= list.length;
  }

  function isListIndexDisabled(list, index, disabledIndices) {
    const isExplicitlyDisabled = typeof disabledIndices === "function"
      ? disabledIndices(index)
      : disabledIndices?.includes(index) ?? false;
    if (isExplicitlyDisabled) return true;
    const element = list[index];
    if (!element) return false;
    if (!t().isElementVisible(element)) return true;
    return !disabledIndices && (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true");
  }

  function findNonDisabledListIndex(list, { startingIndex = -1, decrement = false, disabledIndices, amount = 1 } = {}) {
    let index = startingIndex;
    do {
      index += decrement ? -amount : amount;
    } while (index >= 0 && index <= list.length - 1 && isListIndexDisabled(list, index, disabledIndices));
    return index;
  }

  function getMinListIndex(list, disabledIndices) {
    return findNonDisabledListIndex(list, { disabledIndices });
  }

  function getMaxListIndex(list, disabledIndices) {
    return findNonDisabledListIndex(list, { decrement: true, startingIndex: list.length, disabledIndices });
  }

  const list = () => ({ isIndexOutOfListBounds, isListIndexDisabled, findNonDisabledListIndex, getMinListIndex, getMaxListIndex });

  function isNativeInput(element) {
    if (element instanceof HTMLElement && element.tagName === "INPUT" && element.selectionStart != null) return true;
    return element instanceof HTMLElement && element.tagName === "TEXTAREA";
  }

  function isElementDisabled(element) {
    return element == null || element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
  }

  function getOffset(ancestor, element, side) {
    const propName = side === "left" ? "offsetLeft" : "offsetTop";
    let result = 0;
    while (element.offsetParent) {
      result += element[propName];
      if (element.offsetParent === ancestor) break;
      element = element.offsetParent;
    }
    return result;
  }

  function getStyles(element) {
    const styles = getComputedStyle(element);
    return {
      scrollMarginTop: parseFloat(styles.scrollMarginTop) || 0,
      scrollMarginRight: parseFloat(styles.scrollMarginRight) || 0,
      scrollMarginBottom: parseFloat(styles.scrollMarginBottom) || 0,
      scrollMarginLeft: parseFloat(styles.scrollMarginLeft) || 0,
      scrollPaddingTop: parseFloat(styles.scrollPaddingTop) || 0,
      scrollPaddingRight: parseFloat(styles.scrollPaddingRight) || 0,
      scrollPaddingBottom: parseFloat(styles.scrollPaddingBottom) || 0,
      scrollPaddingLeft: parseFloat(styles.scrollPaddingLeft) || 0,
    };
  }

  function scrollIntoViewIfNeeded(scrollContainer, element, direction, orientation) {
    if (!scrollContainer || !element || !element.scrollTo) return;
    let targetX = scrollContainer.scrollLeft;
    let targetY = scrollContainer.scrollTop;
    const isOverflowingX = scrollContainer.clientWidth < scrollContainer.scrollWidth;
    const isOverflowingY = scrollContainer.clientHeight < scrollContainer.scrollHeight;
    if (isOverflowingX && orientation !== "vertical") {
      const elementOffsetLeft = getOffset(scrollContainer, element, "left");
      const containerStyles = getStyles(scrollContainer);
      const elementStyles = getStyles(element);
      const overflowsRight = elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight >
        scrollContainer.scrollLeft + scrollContainer.clientWidth - containerStyles.scrollPaddingRight;
      const alignRight = elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight -
        scrollContainer.clientWidth + containerStyles.scrollPaddingRight;
      const alignLeft = elementOffsetLeft - elementStyles.scrollMarginLeft - containerStyles.scrollPaddingLeft;
      if (direction === "ltr") {
        if (overflowsRight) targetX = alignRight;
        else if (elementOffsetLeft - elementStyles.scrollMarginLeft < scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft) targetX = alignLeft;
      }
      if (direction === "rtl") {
        if (elementOffsetLeft - elementStyles.scrollMarginRight < scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft) targetX = alignLeft;
        else if (overflowsRight) targetX = alignRight;
      }
    }
    if (isOverflowingY && orientation !== "horizontal") {
      const elementOffsetTop = getOffset(scrollContainer, element, "top");
      const containerStyles = getStyles(scrollContainer);
      const elementStyles = getStyles(element);
      if (elementOffsetTop - elementStyles.scrollMarginTop < scrollContainer.scrollTop + containerStyles.scrollPaddingTop) {
        targetY = elementOffsetTop - elementStyles.scrollMarginTop - containerStyles.scrollPaddingTop;
      } else if (elementOffsetTop + element.offsetHeight + elementStyles.scrollMarginBottom >
        scrollContainer.scrollTop + scrollContainer.clientHeight - containerStyles.scrollPaddingBottom) {
        targetY = elementOffsetTop + element.offsetHeight + elementStyles.scrollMarginBottom -
          scrollContainer.clientHeight + containerStyles.scrollPaddingBottom;
      }
    }
    scrollContainer.scrollTo({ left: targetX, top: targetY, behavior: "auto" });
  }

  function isModifierKeySet(event, ignoredModifierKeys) {
    for (const key of MODIFIER_KEYS.values()) {
      if (ignoredModifierKeys.includes(key)) continue;
      if (event.getModifierState(key)) return true;
    }
    return false;
  }

  function useCompositeRoot(root, options) {
    const {
      items,
      loopFocus = true,
      orientation = "both",
      rtl = () => false,
      enableHomeAndEndKeys = false,
      stopEventPropagation = true,
      disabledIndices,
      modifierKeys = [],
      highlightItemOnHover = false,
      onHighlightedIndexChange: onChange,
    } = options;
    let highlightedIndex = 0;
    const direction = () => (rtl() ? "rtl" : "ltr");

    // useCompositeItem's tabIndex on every item.
    function applyTabIndex() {
      items().forEach((item, index) => {
        item.tabIndex = index === highlightedIndex ? 0 : -1;
      });
    }

    function onHighlightedIndexChange(index, shouldScrollIntoView = false) {
      highlightedIndex = index;
      applyTabIndex();
      if (shouldScrollIntoView) scrollIntoViewIfNeeded(root, items()[index], direction(), orientation);
      onChange?.(index);
    }

    // onMapChange: the first population sets the default tab stop.
    const elements = items();
    const activeItem = elements.find((element) => element.hasAttribute(ACTIVE_COMPOSITE_ITEM)) ?? null;
    const activeIndex = activeItem ? elements.indexOf(activeItem) : -1;
    if (activeIndex !== -1) {
      highlightedIndex = activeIndex;
    } else if (list().isListIndexDisabled(elements, highlightedIndex, disabledIndices)) {
      // A disabled item does not hold the single tab stop: move it to the
      // first enabled one, or keep it when every item is disabled.
      const firstEnabledIndex = list().findNonDisabledListIndex(elements, { disabledIndices });
      if (!list().isIndexOutOfListBounds(elements, firstEnabledIndex)) highlightedIndex = firstEnabledIndex;
    }
    applyTabIndex();
    scrollIntoViewIfNeeded(root, activeItem, direction(), orientation);

    function onKeyDown(event) {
      const RELEVANT_KEYS = enableHomeAndEndKeys ? COMPOSITE_KEYS : ARROW_KEYS;
      if (!RELEVANT_KEYS.has(event.key)) return;
      if (isModifierKeySet(event, modifierKeys)) return;
      const elementsList = items();
      const isRtl = rtl();
      const horizontalForwardKey = isRtl ? ARROW_LEFT : ARROW_RIGHT;
      const horizontalBackwardKey = isRtl ? ARROW_RIGHT : ARROW_LEFT;
      const forwardKey = { horizontal: horizontalForwardKey, vertical: ARROW_DOWN, both: horizontalForwardKey }[orientation];
      const backwardKey = { horizontal: horizontalBackwardKey, vertical: ARROW_UP, both: horizontalBackwardKey }[orientation];
      const target = event.target;
      if (target != null && isNativeInput(target) && !isElementDisabled(target)) {
        const selectionStart = target.selectionStart;
        const selectionEnd = target.selectionEnd;
        const textContent = target.value ?? "";
        // Native textbox behavior: a text selection, arrowing forward before
        // the end, or backward after the start.
        if (selectionStart == null || event.shiftKey || selectionStart !== selectionEnd) return;
        if (event.key !== backwardKey && selectionStart < textContent.length) return;
        if (event.key !== forwardKey && selectionStart > 0) return;
      }
      let nextIndex = highlightedIndex;
      const minIndex = list().getMinListIndex(elementsList, disabledIndices);
      const maxIndex = list().getMaxListIndex(elementsList, disabledIndices);
      const forwardKeys = { horizontal: [horizontalForwardKey], vertical: [ARROW_DOWN], both: [horizontalForwardKey, ARROW_DOWN] }[orientation];
      const backwardKeys = { horizontal: [horizontalBackwardKey], vertical: [ARROW_UP], both: [horizontalBackwardKey, ARROW_UP] }[orientation];
      const preventedKeys = {
        horizontal: enableHomeAndEndKeys ? HORIZONTAL_KEYS_WITH_EXTRA_KEYS : HORIZONTAL_KEYS,
        vertical: enableHomeAndEndKeys ? VERTICAL_KEYS_WITH_EXTRA_KEYS : VERTICAL_KEYS,
        both: RELEVANT_KEYS,
      }[orientation];
      if (enableHomeAndEndKeys) {
        if (event.key === HOME) nextIndex = minIndex;
        else if (event.key === END) nextIndex = maxIndex;
      }
      if (nextIndex === highlightedIndex && (forwardKeys.includes(event.key) || backwardKeys.includes(event.key))) {
        if (loopFocus && nextIndex === maxIndex && forwardKeys.includes(event.key)) {
          nextIndex = minIndex;
        } else if (loopFocus && nextIndex === minIndex && backwardKeys.includes(event.key)) {
          nextIndex = maxIndex;
        } else {
          nextIndex = list().findNonDisabledListIndex(elementsList, {
            startingIndex: nextIndex,
            decrement: backwardKeys.includes(event.key),
            disabledIndices,
          });
        }
      }
      if (nextIndex !== highlightedIndex && !list().isIndexOutOfListBounds(elementsList, nextIndex)) {
        if (stopEventPropagation) event.stopPropagation();
        if (preventedKeys.has(event.key)) event.preventDefault();
        onHighlightedIndexChange(nextIndex, true);
        // After a focus manager's return focus.
        queueMicrotask(() => items()[nextIndex]?.focus());
      }
    }

    // The root's onFocus: a native input selects its text.
    function onFocus(event) {
      if (isNativeInput(event.target)) event.target.setSelectionRange(0, event.target.value.length ?? 0);
    }

    // useCompositeItem's onFocus and onMouseMove, delegated.
    function itemOf(target) {
      return items().find((item) => item === target || item.contains(target)) ?? null;
    }

    function onItemFocus(event) {
      const item = itemOf(event.target);
      if (item) onHighlightedIndexChange(items().indexOf(item));
    }

    function onItemMouseMove(event) {
      if (!highlightItemOnHover) return;
      const item = itemOf(event.target);
      if (!item) return;
      const disabled = item.hasAttribute("disabled") || item.getAttribute("aria-disabled") === "true";
      if (items().indexOf(item) !== highlightedIndex && !disabled) item.focus();
    }

    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("focusin", onFocus);
    root.addEventListener("focusin", onItemFocus);
    root.addEventListener("mousemove", onItemMouseMove);

    return {
      highlight: (index) => onHighlightedIndexChange(index),
      index: () => highlightedIndex,
      cleanup() {
        root.removeEventListener("keydown", onKeyDown);
        root.removeEventListener("focusin", onFocus);
        root.removeEventListener("focusin", onItemFocus);
        root.removeEventListener("mousemove", onItemMouseMove);
      },
    };
  }

  window.templ = window.templ || {};
  window.templ.composite = {
    useCompositeRoot,
    ACTIVE_COMPOSITE_ITEM,
    isIndexOutOfListBounds,
    isListIndexDisabled,
    findNonDisabledListIndex,
    getMinListIndex,
    getMaxListIndex,
  };
})();
