// Port of @base-ui/react floating-ui-react/utils/tabbable.ts (1.6.0), Base UI's
// own tabbable implementation, with activeElement and contains from
// utils/element.ts and isElementVisible from utils/composite.ts.
(function () {
  "use strict";

  const CANDIDATE_SELECTOR = 'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';

  const nodeName = (element) => (element?.nodeName || "").toLowerCase();
  const isShadowRoot = (node) => typeof ShadowRoot !== "undefined" && node instanceof ShadowRoot;
  const isHTMLElement = (node) => node instanceof HTMLElement;

  // The focused element, through open shadow roots.
  function activeElement(doc) {
    let element = doc.activeElement;
    while (element?.shadowRoot?.activeElement != null) element = element.shadowRoot.activeElement;
    return element;
  }

  function contains(parent, child) {
    if (!parent || !child) return false;
    const rootNode = child.getRootNode?.();
    if (parent.contains(child)) return true;
    if (rootNode && isShadowRoot(rootNode)) {
      let next = child;
      while (next) {
        if (parent === next) return true;
        next = next.parentNode || next.host;
      }
    }
    return false;
  }

  function isHiddenByStyles(styles) {
    return styles.visibility === "hidden" || styles.visibility === "collapse";
  }

  function isElementVisible(element, styles = element ? getComputedStyle(element) : null) {
    if (!element || !element.isConnected || !styles || isHiddenByStyles(styles)) return false;
    if (typeof element.checkVisibility === "function") return element.checkVisibility();
    return styles.display !== "none" && styles.display !== "contents";
  }

  function getParentElement(element) {
    if (element.assignedSlot) return element.assignedSlot;
    if (element.parentElement) return element.parentElement;
    const rootNode = element.getRootNode();
    return isShadowRoot(rootNode) ? rootNode.host : null;
  }

  function getDetailsSummary(details) {
    for (const child of Array.from(details.children)) {
      if (nodeName(child) === "summary") return child;
    }
    return null;
  }

  function isWithinOpenDetailsSummary(element, details) {
    const summary = getDetailsSummary(details);
    return !!summary && (element === summary || contains(summary, element));
  }

  function isFocusableCandidate(element) {
    const name = element ? nodeName(element) : "";
    return element != null && element.matches(CANDIDATE_SELECTOR) &&
      (name !== "summary" || (element.parentElement != null && nodeName(element.parentElement) === "details" && getDetailsSummary(element.parentElement) === element)) &&
      (name !== "details" || getDetailsSummary(element) == null) &&
      (name !== "input" || element.type !== "hidden");
  }

  function isVisibleInTabbableTree(element, isAncestor) {
    const styles = getComputedStyle(element);
    if (!isAncestor) return isElementVisible(element, styles);
    return styles.display !== "none";
  }

  function isFocusableElement(element) {
    if (!isFocusableCandidate(element) || !element.isConnected || element.matches(":disabled")) return false;
    for (let current = element; current; current = getParentElement(current)) {
      const isAncestor = current !== element;
      const isSlot = nodeName(current) === "slot";
      if (current.hasAttribute("inert")) return false;
      if ((isAncestor && nodeName(current) === "details" && !current.open && !isWithinOpenDetailsSummary(element, current)) ||
        current.hasAttribute("hidden") || (!isSlot && !isVisibleInTabbableTree(current, isAncestor))) {
        return false;
      }
    }
    return true;
  }

  function getTabIndex(element) {
    const tabIndex = element.tabIndex;
    if (tabIndex < 0) {
      const name = nodeName(element);
      if (name === "details" || name === "audio" || name === "video" || (isHTMLElement(element) && element.isContentEditable)) return 0;
    }
    return tabIndex;
  }

  function getNamedRadioInput(element) {
    if (nodeName(element) !== "input") return null;
    return element.type === "radio" && element.name !== "" ? element : null;
  }

  function isTabbableRadio(element, candidates) {
    const input = getNamedRadioInput(element);
    if (!input) return true;
    const checkedRadio = candidates.find((candidate) => {
      const radio = getNamedRadioInput(candidate);
      return radio?.name === input.name && radio.form === input.form && radio.checked;
    });
    if (checkedRadio) return checkedRadio === input;
    return candidates.find((candidate) => {
      const radio = getNamedRadioInput(candidate);
      return radio?.name === input.name && radio.form === input.form;
    }) === input;
  }

  function getComposedChildren(container) {
    if (isHTMLElement(container) && nodeName(container) === "slot") {
      const assignedElements = container.assignedElements({ flatten: true });
      if (assignedElements.length > 0) return assignedElements;
    }
    if (isHTMLElement(container) && container.shadowRoot) return Array.from(container.shadowRoot.children);
    return Array.from(container.children);
  }

  function appendCandidates(container, list) {
    getComposedChildren(container).forEach((child) => {
      if (isFocusableCandidate(child)) list.push(child);
      appendCandidates(child, list);
    });
  }

  function appendMatchingElements(container, selector, list) {
    getComposedChildren(container).forEach((child) => {
      if (isHTMLElement(child) && child.matches(selector)) list.push(child);
      appendMatchingElements(child, selector, list);
    });
  }

  function isTabbable(element) {
    return isFocusableElement(element) && getTabIndex(element) >= 0;
  }

  function focusable(container) {
    const candidates = [];
    appendCandidates(container, candidates);
    return candidates.filter(isFocusableElement);
  }

  function tabbable(container) {
    const candidates = focusable(container);
    return candidates.filter((element) => getTabIndex(element) >= 0 && isTabbableRadio(element, candidates));
  }

  function getTabbableIn(container, dir) {
    const list = tabbable(container);
    const len = list.length;
    if (len === 0) return undefined;
    const active = activeElement(container.ownerDocument);
    const index = list.indexOf(active);
    const nextIndex = index === -1 ? (dir === 1 ? 0 : len - 1) : index + dir;
    return list[nextIndex];
  }

  function getNextTabbable(referenceElement) {
    return getTabbableIn(referenceElement.ownerDocument.body, 1) || referenceElement;
  }

  function getPreviousTabbable(referenceElement) {
    return getTabbableIn(referenceElement.ownerDocument.body, -1) || referenceElement;
  }

  function getTabbableNearElement(referenceElement, dir) {
    if (!referenceElement) return null;
    const list = tabbable(referenceElement.ownerDocument.body);
    const elementCount = list.length;
    if (elementCount === 0) return null;
    const index = list.indexOf(referenceElement);
    if (index === -1) return null;
    return list[(index + dir + elementCount) % elementCount];
  }

  function getTabbableAfterElement(referenceElement) {
    return getTabbableNearElement(referenceElement, 1);
  }

  function getTabbableBeforeElement(referenceElement) {
    return getTabbableNearElement(referenceElement, -1);
  }

  function isOutsideEvent(event, container) {
    const containerElement = container || event.currentTarget;
    const relatedTarget = event.relatedTarget;
    return !relatedTarget || !contains(containerElement, relatedTarget);
  }

  // data-tabindex is Base UI's own marker for the tabindex it took away.
  function disableFocusInside(container) {
    tabbable(container).forEach((element) => {
      element.dataset.tabindex = element.getAttribute("tabindex") || "";
      element.setAttribute("tabindex", "-1");
    });
  }

  function enableFocusInside(container) {
    const elements = [];
    appendMatchingElements(container, "[data-tabindex]", elements);
    elements.forEach((element) => {
      const tabindex = element.dataset.tabindex;
      delete element.dataset.tabindex;
      if (tabindex) element.setAttribute("tabindex", tabindex);
      else element.removeAttribute("tabindex");
    });
  }

  window.templ = window.templ || {};
  window.templ.tabbable = {
    activeElement,
    contains,
    isElementVisible,
    isTabbable,
    focusable,
    tabbable,
    getNextTabbable,
    getPreviousTabbable,
    getTabbableAfterElement,
    getTabbableBeforeElement,
    isOutsideEvent,
    disableFocusInside,
    enableFocusInside,
  };
})();
