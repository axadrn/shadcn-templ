// Port of @base-ui/react floating-ui-react/hooks/useTypeahead.ts (1.6.0).
// Typing a character moves to the next item whose label starts with what was
// typed, until the typing pauses for resetMs.
//
//   const typeahead = window.templ.typeahead.useTypeahead(options)
//   typeahead.reset()     when the popup opens or closes, the source's effect
//   typeahead.cleanup()
//
//   elements        the reference and the floating element, which listen
//   labels()        the items' labels, in list order (listRef)
//   items()         the items, for the visibility check (elementsRef)
//   activeIndex()   selectedIndex()   isOpen()
//   onMatch(index)  onTyping(typing)
//   disabledIndices an array, a function, or undefined
//   resetMs         default 750, Base UI's menus and selects pass 500
(function () {
  "use strict";

  const t = () => window.templ.tabbable;

  function useTypeahead(options) {
    const {
      elements,
      labels,
      items = () => [],
      activeIndex = () => null,
      selectedIndex = () => null,
      isOpen,
      onMatch,
      onTyping,
      disabledIndices,
      resetMs = 750,
    } = options;
    let string = "";
    let prevIndex = selectedIndex() ?? activeIndex() ?? -1;
    let matchIndex = null;
    let timer = 0;
    const cleanups = [];
    const stopEvent = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    function isItemAvailable(index) {
      const element = items()[index];
      if (element && !t().isElementVisible(element)) return false;
      return disabledIndices == null || !window.templ.composite.isListIndexDisabled([], index, disabledIndices);
    }

    function getMatchingIndex(list, value, startIndex = 0) {
      if (list.length === 0) return -1;
      const normalizedStartIndex = ((startIndex % list.length) + list.length) % list.length;
      const lowerString = value.toLowerCase();
      for (let offset = 0; offset < list.length; offset += 1) {
        const index = (normalizedStartIndex + offset) % list.length;
        const text = list[index];
        if (!text?.toLowerCase().startsWith(lowerString) || !isItemAvailable(index)) continue;
        return index;
      }
      return -1;
    }

    function onKeyDown(event) {
      const listContent = labels();
      // Space continues a typeahead session in progress.
      if (string.length > 0 && event.key === " ") {
        stopEvent(event);
        onTyping?.(true);
      }
      if (string.length > 0 && string[0] !== " ") {
        if (getMatchingIndex(listContent, string) === -1 && event.key !== " ") onTyping?.(false);
      }
      if (listContent == null || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isOpen() && event.key !== " ") {
        stopEvent(event);
        onTyping?.(true);
      }
      const isNewSession = string === "";
      if (isNewSession) prevIndex = selectedIndex() ?? activeIndex() ?? -1;
      // Rapid presses of one letter cycle through the items starting with it,
      // unless a label repeats its first letter, like "llama".
      const allowRapidSuccessionOfFirstLetter = listContent.every((text, index) =>
        text && isItemAvailable(index) ? text[0]?.toLowerCase() !== text[1]?.toLowerCase() : true);
      if (allowRapidSuccessionOfFirstLetter && string === event.key) {
        string = "";
        prevIndex = matchIndex;
      }
      string += event.key;
      clearTimeout(timer);
      timer = setTimeout(() => {
        string = "";
        prevIndex = matchIndex;
        onTyping?.(false);
      }, resetMs);
      const start = (isNewSession ? selectedIndex() ?? activeIndex() ?? -1 : prevIndex) ?? 0;
      const index = getMatchingIndex(listContent, string, start + 1);
      if (index !== -1) {
        onMatch?.(index);
        matchIndex = index;
      } else if (event.key !== " ") {
        string = "";
        onTyping?.(false);
      }
    }

    // Leaving the reference and the popup ends the session.
    function onBlur(event) {
      const next = event.relatedTarget;
      if (elements.some((element) => t().contains(element, next))) return;
      clearTimeout(timer);
      string = "";
      prevIndex = matchIndex;
      onTyping?.(false);
    }

    elements.filter(Boolean).forEach((element) => {
      element.addEventListener("keydown", onKeyDown);
      element.addEventListener("focusout", onBlur);
      cleanups.push(() => {
        element.removeEventListener("keydown", onKeyDown);
        element.removeEventListener("focusout", onBlur);
      });
    });

    return {
      // The source's effects on open and selectedIndex.
      reset() {
        clearTimeout(timer);
        matchIndex = null;
        string = "";
        prevIndex = selectedIndex() ?? activeIndex() ?? -1;
      },
      cleanup() {
        clearTimeout(timer);
        cleanups.splice(0).forEach((cleanup) => cleanup());
      },
    };
  }

  window.templ = window.templ || {};
  window.templ.typeahead = { useTypeahead };
})();
