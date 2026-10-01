// Port of @base-ui/react floating-ui-react/hooks/useListNavigation.ts (1.6.0)
// with the list helpers of floating-ui-react/utils/composite.ts. Arrow key
// navigation of a list, with real focus or, for a combobox, virtual focus.
//
//   const nav = window.templ.listNavigation.useListNavigation(options)   when the component mounts
//   nav.open()     after the popup opened, the source's open effects
//   nav.close()    when it closes
//   nav.sync()     after the component changed its active index itself
//   nav.cleanup()  when the component unmounts
//
//   floating            the popup, the element that takes focus
//   reference           the trigger, or the input of a combobox
//   items()             the list, in order (listRef)
//   activeIndex()       the component's active index, or null
//   selectedIndex()     the selected index, or null
//   onNavigate(index, event)   sets the component's active index (null for none)
//   onOpenChange(open, reason, event)  opens on an arrow key, closes a nested list
//   isOpen()
//   loopFocus, nested, rtl, virtual, orientation, parentOrientation, allowEscape,
//   focusItemOnOpen ("auto", true, false), focusItemOnHover, openOnArrowKeyDown,
//   resetOnPointerLeave, disabledIndices (an array, a function, or undefined)
//   onVirtualFocus(item)  for virtual lists, the source's virtualfocus event
//
// Left out: grid navigation, which only a grid combobox uses.
(function () {
  "use strict";

  const t = () => window.templ.tabbable;
  const ARROW_UP = "ArrowUp";
  const ARROW_DOWN = "ArrowDown";
  const ARROW_LEFT = "ArrowLeft";
  const ARROW_RIGHT = "ArrowRight";

  function doSwitch(orientation, vertical, horizontal) {
    switch (orientation) {
      case "vertical": return vertical;
      case "horizontal": return horizontal;
      default: return vertical || horizontal;
    }
  }

  function isMainOrientationKey(key, orientation) {
    const vertical = key === ARROW_UP || key === ARROW_DOWN;
    const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
    return doSwitch(orientation, vertical, horizontal);
  }

  function isMainOrientationToEndKey(key, orientation, rtl) {
    const vertical = key === ARROW_DOWN;
    const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
    return doSwitch(orientation, vertical, horizontal) || key === "Enter" || key === " " || key === "";
  }

  function isCrossOrientationOpenKey(key, orientation, rtl) {
    const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
    const horizontal = key === ARROW_DOWN;
    return doSwitch(orientation, vertical, horizontal);
  }

  function isCrossOrientationCloseKey(key, orientation, rtl) {
    const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
    const horizontal = key === ARROW_UP;
    if (orientation === "both") return key === "Escape";
    return doSwitch(orientation, vertical, horizontal);
  }

  // utils/composite.ts, see composite.js.
  const c = () => window.templ.composite;
  const isIndexOutOfListBounds = (...args) => c().isIndexOutOfListBounds(...args);
  const isListIndexDisabled = (...args) => c().isListIndexDisabled(...args);
  const findNonDisabledListIndex = (...args) => c().findNonDisabledListIndex(...args);
  const getMinListIndex = (...args) => c().getMinListIndex(...args);
  const getMaxListIndex = (...args) => c().getMaxListIndex(...args);

  const isTypeableCombobox = (element) => !!element && element.getAttribute("role") === "combobox" &&
    element.matches("input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])");
  const stopEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  function isVirtualClick(event) {
    if (event.pointerType === "" && event.isTrusted) return true;
    return event.detail === 0 && !event.pointerType;
  }

  function isVirtualPointerEvent(event) {
    return (event.width === 0 && event.height === 0) ||
      (event.width < 1 && event.height < 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "touch");
  }

  // ----- useListNavigation -------------------------------------------------------

  function useListNavigation(options) {
    const {
      floating,
      reference = null,
      items,
      activeIndex = () => null,
      selectedIndex = () => null,
      onNavigate: onNavigateProp = () => {},
      onOpenChange = () => {},
      isOpen,
      allowEscape = false,
      loopFocus = false,
      nested = false,
      rtl = false,
      virtual = false,
      focusItemOnOpen = "auto",
      focusItemOnHover = true,
      openOnArrowKeyDown = true,
      disabledIndices,
      orientation = "vertical",
      parentOrientation,
      resetOnPointerLeave = true,
      onVirtualFocus,
    } = options;
    const typeableComboboxReference = isTypeableCombobox(reference);
    let focusItemOnOpenState = focusItemOnOpen;
    let indexRef = selectedIndex() ?? -1;
    let key = null;
    let isPointerModality = true;
    let forceSyncFocus = false;
    let forceScrollIntoView = false;
    let focusFrame = 0;
    let cancelQueuedFocus = null;
    const cleanups = [];

    const list = () => items();
    const onNavigate = (event) => {
      onNavigateProp(indexRef === -1 ? null : indexRef, event);
      sync();
    };

    function focusItem() {
      const runFocus = (item) => {
        if (virtual) onVirtualFocus?.(item);
        else cancelQueuedFocus = window.templ.focusManager.enqueueFocus(item, { sync: forceSyncFocus, preventScroll: true });
      };
      const initialItem = list()[indexRef];
      const scrollIntoView = forceScrollIntoView;
      if (initialItem) runFocus(initialItem);
      const run = () => {
        const waitedItem = list()[indexRef] || initialItem;
        if (!waitedItem) return;
        if (!initialItem) runFocus(waitedItem);
        if (scrollIntoView || !isPointerModality) waitedItem.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      };
      if (forceSyncFocus) {
        run();
      } else {
        cancelAnimationFrame(focusFrame);
        focusFrame = requestAnimationFrame(run);
      }
    }

    // The source's effect on activeIndex: focus the active item while open.
    function sync() {
      if (!isOpen()) {
        forceSyncFocus = false;
        return;
      }
      const active = activeIndex();
      if (active == null) {
        forceSyncFocus = false;
        return;
      }
      if (!isIndexOutOfListBounds(list(), active)) {
        indexRef = active;
        focusItem();
        forceScrollIntoView = false;
      }
    }

    // The source's open effects: start at the selected item, or focus the
    // first or last item when a key or a virtual click opened the list.
    function open() {
      indexRef = selectedIndex() ?? -1;
      if (focusItemOnOpenState && selectedIndex() != null) {
        // The selected item comes into view regardless of the modality.
        forceScrollIntoView = true;
        onNavigate();
        return;
      }
      if (activeIndex() != null) {
        sync();
        return;
      }
      if (focusItemOnOpenState && (key != null || (focusItemOnOpenState === true && key == null))) {
        let runs = 0;
        const waitForListPopulated = () => {
          if (list()[0] == null) {
            if (runs < 2) (runs ? requestAnimationFrame : queueMicrotask)(waitForListPopulated);
            runs += 1;
            return;
          }
          // The first non disabled item, skipping attribute disabled ones
          // even with an empty disabledIndices (mui/base-ui#2604).
          indexRef = key == null || isMainOrientationToEndKey(key, orientation, rtl) || nested
            ? getMinListIndex(list())
            : getMaxListIndex(list());
          key = null;
          onNavigate();
        };
        waitForListPopulated();
      }
    }

    function close() {
      indexRef = -1;
      onNavigateProp(null);
      forceSyncFocus = false;
      key = null;
      focusItemOnOpenState = focusItemOnOpen;
    }

    const on = (target, type, listener, capture) => {
      if (!target) return;
      target.addEventListener(type, listener, !!capture);
      cleanups.push(() => target.removeEventListener(type, listener, !!capture));
    };

    function syncCurrentTarget(event, item) {
      if (!isOpen()) return;
      const index = list().indexOf(item);
      if (index !== -1 && (indexRef !== index || activeIndex() !== index)) {
        indexRef = index;
        onNavigate(event);
      }
    }

    function commonOnKeyDown(event) {
      isPointerModality = false;
      forceSyncFocus = true;
      // Chrome fires ArrowDown twice while composing.
      if (event.which === 229) return;
      // Animating out: ignore navigation.
      if (!isOpen() && event.currentTarget === floating) return;

      if (nested && isCrossOrientationCloseKey(event.key, orientation, rtl)) {
        // The parent navigates with this key too: let it.
        if (!isMainOrientationKey(event.key, parentOrientation)) stopEvent(event);
        onOpenChange(false, "list-navigation", event);
        if (reference instanceof HTMLElement) {
          if (virtual) onVirtualFocus?.(reference);
          else reference.focus();
        }
        return;
      }
      const currentIndex = indexRef;
      const items = list();
      const minIndex = getMinListIndex(items, disabledIndices);
      const maxIndex = getMaxListIndex(items, disabledIndices);
      if (!typeableComboboxReference) {
        if (event.key === "Home") {
          stopEvent(event);
          indexRef = minIndex;
          onNavigate(event);
        }
        if (event.key === "End") {
          stopEvent(event);
          indexRef = maxIndex;
          onNavigate(event);
        }
      }
      if (!isMainOrientationKey(event.key, orientation)) return;
      stopEvent(event);
      // No item focused: start at the end the key points to.
      if (isOpen() && !virtual && t().activeElement(event.currentTarget.ownerDocument) === event.currentTarget) {
        indexRef = isMainOrientationToEndKey(event.key, orientation, rtl) ? minIndex : maxIndex;
        onNavigate(event);
        return;
      }
      if (isMainOrientationToEndKey(event.key, orientation, rtl)) {
        if (loopFocus) {
          if (currentIndex >= maxIndex) {
            if (allowEscape && currentIndex !== items.length) {
              indexRef = -1;
            } else {
              forceSyncFocus = false;
              indexRef = minIndex;
            }
          } else {
            indexRef = findNonDisabledListIndex(items, { startingIndex: currentIndex, disabledIndices });
          }
        } else {
          indexRef = Math.min(maxIndex, findNonDisabledListIndex(items, { startingIndex: currentIndex, disabledIndices }));
        }
      } else if (loopFocus) {
        if (currentIndex <= minIndex) {
          if (allowEscape && currentIndex !== -1) {
            indexRef = items.length;
          } else {
            forceSyncFocus = false;
            indexRef = maxIndex;
          }
        } else {
          indexRef = findNonDisabledListIndex(items, { startingIndex: currentIndex, decrement: true, disabledIndices });
        }
      } else {
        indexRef = Math.max(minIndex, findNonDisabledListIndex(items, { startingIndex: currentIndex, decrement: true, disabledIndices }));
      }
      if (isIndexOutOfListBounds(items, indexRef)) indexRef = -1;
      onNavigate(event);
    }

    // The floating element's props.
    on(floating, "keydown", (event) => {
      // Shift+Tab closes a submenu. An element nested in the popup with its
      // own focus management, like a dialog opened from the menu, keeps it.
      if (event.key === "Tab" && event.shiftKey && isOpen() && !virtual) {
        if (!t().contains(floating, event.composedPath?.()[0] || event.target)) return;
        stopEvent(event);
        onOpenChange(false, "focus-out", event);
        if (reference instanceof HTMLElement) reference.focus();
        return;
      }
      commonOnKeyDown(event);
    });
    on(floating, "pointermove", () => {
      isPointerModality = true;
    });
    if (orientation !== "both") floating?.setAttribute("aria-orientation", orientation);

    // The items' props, delegated since the list changes.
    const itemOf = (target) => {
      const items = list();
      for (let node = target; node && node !== floating; node = node.parentElement) {
        if (items.includes(node)) return node;
      }
      return null;
    };
    on(floating, "focusin", (event) => {
      const item = itemOf(event.target);
      if (!item) return;
      forceSyncFocus = true;
      syncCurrentTarget(event, item);
    });
    on(floating, "click", (event) => {
      itemOf(event.target)?.focus({ preventScroll: true });
    });
    on(floating, "mousemove", (event) => {
      const item = itemOf(event.target);
      if (!item) return;
      forceSyncFocus = true;
      forceScrollIntoView = false;
      if (focusItemOnHover) syncCurrentTarget(event, item);
    });
    on(floating, "pointerout", (event) => {
      const item = itemOf(event.target);
      if (!item || item.contains(event.relatedTarget)) return;
      if (!isOpen() || !isPointerModality || event.pointerType === "touch") return;
      forceSyncFocus = true;
      if (!focusItemOnHover || list().includes(event.relatedTarget) || !resetOnPointerLeave) return;
      cancelQueuedFocus?.();
      cancelQueuedFocus = null;
      indexRef = -1;
      onNavigate(event);
      if (!virtual && t().contains(floating, t().activeElement(floating.ownerDocument))) {
        floating.focus({ preventScroll: true });
      }
    });

    // The trigger's props.
    function openOnNavigationKeyDown(event) {
      onOpenChange(true, "list-navigation", event);
    }
    on(reference, "keydown", (event) => {
      const currentOpen = isOpen();
      isPointerModality = false;
      const isArrowKey = event.key.startsWith("Arrow");
      const isParentCrossOpenKey = isCrossOrientationOpenKey(event.key, parentOrientation, rtl);
      const isMainKey = isMainOrientationKey(event.key, orientation);
      const isNavigationKey = (nested ? isParentCrossOpenKey : isMainKey) || event.key === "Enter" || event.key.trim() === "";
      if (virtual && currentOpen) {
        commonOnKeyDown(event);
        return;
      }
      if (!currentOpen && !openOnArrowKeyDown && isArrowKey) return;
      if (isNavigationKey) {
        const isParentMainKey = isMainOrientationKey(event.key, parentOrientation);
        key = nested && isParentMainKey ? null : event.key;
      }
      if (nested) {
        if (isParentCrossOpenKey) {
          stopEvent(event);
          if (currentOpen) {
            indexRef = getMinListIndex(list(), disabledIndices);
            onNavigate(event);
          } else {
            openOnNavigationKeyDown(event);
          }
        }
        return;
      }
      if (isMainKey) {
        if (selectedIndex() != null) indexRef = selectedIndex();
        stopEvent(event);
        if (!currentOpen && openOnArrowKeyDown) openOnNavigationKeyDown(event);
        else commonOnKeyDown(event);
        if (currentOpen) onNavigate(event);
      }
    });
    on(reference, "focus", (event) => {
      if (isOpen() && !virtual) {
        indexRef = -1;
        onNavigate(event);
      }
    });
    const checkVirtualPointer = (event) => {
      // pointerdown fires first: reset, then check.
      focusItemOnOpenState = focusItemOnOpen;
      if (focusItemOnOpen === "auto" && isVirtualPointerEvent(event)) focusItemOnOpenState = true;
    };
    const checkVirtualMouse = (event) => {
      if (focusItemOnOpen === "auto" && isVirtualClick(event)) focusItemOnOpenState = !virtual;
    };
    on(reference, "pointerdown", checkVirtualPointer);
    on(reference, "pointerenter", checkVirtualPointer);
    on(reference, "mousedown", checkVirtualMouse);
    on(reference, "click", checkVirtualMouse);

    return {
      open,
      close,
      sync,
      cleanup() {
        cancelAnimationFrame(focusFrame);
        cleanups.splice(0).forEach((cleanup) => cleanup());
      },
    };
  }

  window.templ = window.templ || {};
  window.templ.listNavigation = { useListNavigation };
})();
