// Port of @base-ui/react floating-ui-react/utils/markOthers.ts (1.6.0), itself a
// fork of aria-hidden with a conditional aria-hidden. markOthers(avoid, options)
// marks every element outside the avoided subtrees and returns the undo.
//
//   ariaHidden  sets aria-hidden="true" outside (modal popups)
//   inert       sets inert outside
//   mark        sets the data-base-ui-inert marker outside, which useDismiss
//               reads to tell elements injected after opening (default true)
//
// Counted per element, so nested popups and several open ones undo cleanly,
// and elements that were hidden before are left as they were.
(function () {
  "use strict";

  const markerName = "data-base-ui-inert";
  let counters = { inert: new WeakMap(), "aria-hidden": new WeakMap() };
  let uncontrolledElementsSets = { inert: new WeakSet(), "aria-hidden": new WeakSet() };
  let markerCounterMap = new WeakMap();
  let lockCount = 0;

  const isShadowRoot = (node) => typeof ShadowRoot !== "undefined" && node instanceof ShadowRoot;

  function unwrapHost(node) {
    if (!node) return null;
    return isShadowRoot(node) ? node.host : unwrapHost(node.parentNode);
  }

  function correctElements(parent, targets) {
    return targets.map((target) => {
      if (parent.contains(target)) return target;
      const correctedTarget = unwrapHost(target);
      if (parent.contains(correctedTarget)) return correctedTarget;
      return null;
    }).filter((x) => x != null);
  }

  function buildKeepSet(targets) {
    const keep = new Set();
    targets.forEach((target) => {
      let node = target;
      while (node && !keep.has(node)) {
        keep.add(node);
        node = node.parentNode;
      }
    });
    return keep;
  }

  function collectOutsideElements(root, keepElements, stopElements) {
    const outside = [];
    const walk = (parent) => {
      if (!parent || stopElements.has(parent)) return;
      Array.from(parent.children).forEach((node) => {
        if (node.nodeName.toLowerCase() === "script") return;
        if (keepElements.has(node)) walk(node);
        else outside.push(node);
      });
    };
    walk(root);
    return outside;
  }

  function applyAttributeToOthers(uncorrectedAvoidElements, body, ariaHidden, inert, { mark = true }) {
    let controlAttribute = null;
    if (inert) controlAttribute = "inert";
    else if (ariaHidden) controlAttribute = "aria-hidden";
    let counterMap = null;
    let uncontrolledElementsSet = null;
    const avoidElements = correctElements(body, uncorrectedAvoidElements);
    const markerTargets = mark ? collectOutsideElements(body, buildKeepSet(avoidElements), new Set(avoidElements)) : [];
    const hiddenElements = [];
    const markedElements = [];
    if (controlAttribute) {
      const map = counters[controlAttribute];
      uncontrolledElementsSet = uncontrolledElementsSets[controlAttribute];
      counterMap = map;
      const ariaLiveElements = correctElements(body, Array.from(body.querySelectorAll("[aria-live]")));
      const controlElements = avoidElements.concat(ariaLiveElements);
      const controlTargets = collectOutsideElements(body, buildKeepSet(controlElements), new Set(controlElements));
      controlTargets.forEach((node) => {
        const attr = node.getAttribute(controlAttribute);
        const alreadyHidden = attr !== null && attr !== "false";
        const counterValue = (map.get(node) || 0) + 1;
        map.set(node, counterValue);
        hiddenElements.push(node);
        if (counterValue === 1 && alreadyHidden) uncontrolledElementsSet.add(node);
        if (!alreadyHidden) node.setAttribute(controlAttribute, controlAttribute === "inert" ? "" : "true");
      });
    }
    if (mark) {
      markerTargets.forEach((node) => {
        const markerValue = (markerCounterMap.get(node) || 0) + 1;
        markerCounterMap.set(node, markerValue);
        markedElements.push(node);
        if (markerValue === 1) node.setAttribute(markerName, "");
      });
    }
    lockCount += 1;
    return () => {
      if (counterMap) {
        hiddenElements.forEach((element) => {
          const counterValue = (counterMap.get(element) || 0) - 1;
          counterMap.set(element, counterValue);
          if (!counterValue) {
            if (!uncontrolledElementsSet?.has(element) && controlAttribute) element.removeAttribute(controlAttribute);
            uncontrolledElementsSet?.delete(element);
          }
        });
      }
      if (mark) {
        markedElements.forEach((element) => {
          const markerValue = (markerCounterMap.get(element) || 0) - 1;
          markerCounterMap.set(element, markerValue);
          if (!markerValue) element.removeAttribute(markerName);
        });
      }
      lockCount -= 1;
      if (!lockCount) {
        counters = { inert: new WeakMap(), "aria-hidden": new WeakMap() };
        uncontrolledElementsSets = { inert: new WeakSet(), "aria-hidden": new WeakSet() };
        markerCounterMap = new WeakMap();
      }
    };
  }

  function markOthers(avoidElements, options = {}) {
    const { ariaHidden = false, inert = false, mark = true } = options;
    const body = avoidElements[0].ownerDocument.body;
    return applyAttributeToOthers(avoidElements, body, ariaHidden, inert, { mark });
  }

  window.templ = window.templ || {};
  window.templ.markOthers = markOthers;
})();
