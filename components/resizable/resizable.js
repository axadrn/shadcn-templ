/*
 * Layout and interaction behavior ported from react-resizable-panels.
 * UI behavior baseline: 4.5.8 (the version resolved by shadcn/ui).
 * The MIT License (MIT), Copyright (c) 2018 Brian Vaughn.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function () {
  "use strict";

  // react-resizable-panels' own markers: Group, Panel and Separator.
  const GROUP = "[data-group]";
  const PANEL = "[data-panel]";
  const HANDLE = "[data-separator]";
  const CURSOR_FLAG_HORIZONTAL_MIN = 0b0001;
  const CURSOR_FLAG_HORIZONTAL_MAX = 0b0010;
  const CURSOR_FLAG_VERTICAL_MIN = 0b0100;
  const CURSOR_FLAG_VERTICAL_MAX = 0b1000;
  const CURSOR_FLAGS_HORIZONTAL = 0b0011;
  const CURSOR_FLAGS_VERTICAL = 0b1100;
  const mounted = new Map();
  const byElement = new WeakMap();
  let interaction = { state: "inactive", hitRegions: [], cursorFlags: 0 };
  let cursorStyleElement = null;
  let coarsePointer;
  let advancedCursorStyles;

  function formatLayoutNumber(number) {
    return Number.parseFloat(number.toFixed(3));
  }

  function layoutNumbersEqual(actual, expected, minimumDelta = 0) {
    return Math.abs(formatLayoutNumber(actual) - formatLayoutNumber(expected)) <= minimumDelta;
  }

  function compareLayoutNumbers(actual, expected) {
    return layoutNumbersEqual(actual, expected) ? 0 : actual > expected ? 1 : -1;
  }

  function layoutsEqual(a, b) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(b, key) && layoutNumbersEqual(a[key], b[key]));
  }

  function arraysEqual(a, b) {
    return a.length === b.length && a.every((value, index) => layoutNumbersEqual(value, b[index]));
  }

  function orientationOf(group) {
    return group.dataset.templOrientation === "vertical" ? "vertical" : "horizontal";
  }

  function directChildren(group, selector) {
    return [...group.children].filter((element) => element.matches(selector));
  }

  function sortByElementOffset(orientation, records) {
    return [...records].sort((a, b) => {
      if (orientation === "horizontal") {
        return a.element.offsetLeft - b.element.offsetLeft || a.element.offsetWidth - b.element.offsetWidth;
      }
      return a.element.offsetTop - b.element.offsetTop || a.element.offsetHeight - b.element.offsetHeight;
    });
  }

  function calculateAvailableGroupSize(state) {
    return state.panels.reduce((total, panel) => total +
      (state.orientation === "horizontal" ? panel.element.offsetWidth : panel.element.offsetHeight), 0);
  }

  function parseSizeAndUnit(size) {
    if (typeof size === "number") return [size, "px"];
    const numeric = Number.parseFloat(size);
    if (size.endsWith("%")) return [numeric, "%"];
    if (size.endsWith("px")) return [numeric, "px"];
    if (size.endsWith("rem")) return [numeric, "rem"];
    if (size.endsWith("em")) return [numeric, "em"];
    if (size.endsWith("vh")) return [numeric, "vh"];
    if (size.endsWith("vw")) return [numeric, "vw"];
    return [numeric, "%"];
  }

  function sizeStyleToPixels(state, panel, styleProp) {
    const groupSize = calculateAvailableGroupSize(state);
    const [size, unit] = parseSizeAndUnit(styleProp);
    const view = panel.element.ownerDocument.defaultView || window;
    switch (unit) {
      case "%": return (size / 100) * groupSize;
      case "px": return size;
      case "rem": return size * Number.parseFloat(view.getComputedStyle(panel.element.ownerDocument.documentElement).fontSize);
      case "em": return size * Number.parseFloat(view.getComputedStyle(panel.element).fontSize);
      case "vh": return (size / 100) * view.innerHeight;
      case "vw": return (size / 100) * view.innerWidth;
      default: return 0;
    }
  }

  function calculatePanelConstraints(state) {
    const groupSize = calculateAvailableGroupSize(state);
    if (groupSize === 0) {
      return state.panels.map((panel) => ({
        panelId: panel.id,
        groupResizeBehavior: panel.raw.groupResizeBehavior,
        collapsedSize: 0,
        collapsible: panel.raw.collapsible,
        defaultSize: undefined,
        disabled: panel.raw.disabled,
        minSize: 0,
        maxSize: 100,
      }));
    }
    const percentage = (panel, value, fallback) => value === undefined
      ? fallback
      : formatLayoutNumber((sizeStyleToPixels(state, panel, value) / groupSize) * 100);
    return state.panels.map((panel) => ({
      panelId: panel.id,
      groupResizeBehavior: panel.raw.groupResizeBehavior,
      collapsedSize: percentage(panel, panel.raw.collapsedSize, 0),
      collapsible: panel.raw.collapsible,
      defaultSize: percentage(panel, panel.raw.defaultSize, undefined),
      disabled: panel.raw.disabled,
      minSize: percentage(panel, panel.raw.minSize, 0),
      maxSize: percentage(panel, panel.raw.maxSize, 100),
    }));
  }

  function calculateDefaultLayout(constraints) {
    let explicitCount = 0;
    let total = 0;
    const layout = {};
    for (const current of constraints) {
      if (current.defaultSize !== undefined) {
        explicitCount++;
        const size = formatLayoutNumber(current.defaultSize);
        total += size;
        layout[current.panelId] = size;
      } else {
        layout[current.panelId] = undefined;
      }
    }
    const remaining = constraints.length - explicitCount;
    if (remaining !== 0) {
      const size = formatLayoutNumber((100 - total) / remaining);
      for (const current of constraints) {
        if (current.defaultSize === undefined) layout[current.panelId] = size;
      }
    }
    return layout;
  }

  function validatePanelSize({ overrideDisabledPanels = false, panelConstraints, prevSize, size }) {
    const collapsedSize = panelConstraints.collapsedSize ?? 0;
    const minSize = panelConstraints.minSize ?? 0;
    const maxSize = panelConstraints.maxSize ?? 100;
    if (panelConstraints.disabled && !overrideDisabledPanels) return prevSize;
    if (compareLayoutNumbers(size, minSize) < 0) {
      if (panelConstraints.collapsible) {
        const halfwayPoint = (collapsedSize + minSize) / 2;
        size = compareLayoutNumbers(size, halfwayPoint) < 0 ? collapsedSize : minSize;
      } else {
        size = minSize;
      }
    }
    return formatLayoutNumber(Math.min(maxSize, size));
  }

  function validatePanelGroupLayout(layout, constraints) {
    const keys = Object.keys(layout);
    const prevLayout = Object.values(layout);
    const nextLayout = [...prevLayout];
    const total = nextLayout.reduce((sum, current) => sum + current, 0);
    if (nextLayout.length !== constraints.length) {
      throw new Error(`Invalid ${constraints.length} panel layout`);
    }
    if (!layoutNumbersEqual(total, 100) && nextLayout.length > 0) {
      for (let index = 0; index < constraints.length; index++) {
        nextLayout[index] = (100 / total) * nextLayout[index];
      }
    }
    let remainingSize = 0;
    for (let index = 0; index < constraints.length; index++) {
      const unsafeSize = nextLayout[index];
      const safeSize = validatePanelSize({
        overrideDisabledPanels: true,
        panelConstraints: constraints[index],
        prevSize: prevLayout[index],
        size: unsafeSize,
      });
      if (unsafeSize !== safeSize) {
        remainingSize += unsafeSize - safeSize;
        nextLayout[index] = safeSize;
      }
    }
    if (!layoutNumbersEqual(remainingSize, 0)) {
      for (let index = 0; index < constraints.length; index++) {
        const prevSize = nextLayout[index];
        const safeSize = validatePanelSize({
          overrideDisabledPanels: true,
          panelConstraints: constraints[index],
          prevSize,
          size: prevSize + remainingSize,
        });
        if (prevSize !== safeSize) {
          remainingSize -= safeSize - prevSize;
          nextLayout[index] = safeSize;
          if (layoutNumbersEqual(remainingSize, 0)) break;
        }
      }
    }
    return nextLayout.reduce((result, current, index) => {
      result[keys[index]] = current;
      return result;
    }, {});
  }

  // Direct port of react-resizable-panels adjustLayoutByDelta.
  function adjustLayoutByDelta({ delta, initialLayout: initialObject, panelConstraints, pivotIndices, prevLayout: prevObject, trigger }) {
    if (layoutNumbersEqual(delta, 0)) return initialObject;
    const overrideDisabledPanels = trigger === "imperative-api";
    const initialLayout = Object.values(initialObject);
    const prevLayout = Object.values(prevObject);
    const nextLayout = [...initialLayout];
    const [firstPivotIndex, secondPivotIndex] = pivotIndices;
    let deltaApplied = 0;

    if (trigger === "keyboard") {
      let index = delta < 0 ? secondPivotIndex : firstPivotIndex;
      let c = panelConstraints[index];
      if (c?.collapsible && layoutNumbersEqual(initialLayout[index], c.collapsedSize ?? 0)) {
        const localDelta = (c.minSize ?? 0) - initialLayout[index];
        if (compareLayoutNumbers(localDelta, Math.abs(delta)) > 0) delta = delta < 0 ? -localDelta : localDelta;
      }
      index = delta < 0 ? firstPivotIndex : secondPivotIndex;
      c = panelConstraints[index];
      if (c?.collapsible && layoutNumbersEqual(initialLayout[index], c.minSize ?? 0)) {
        const localDelta = initialLayout[index] - (c.collapsedSize ?? 0);
        if (compareLayoutNumbers(localDelta, Math.abs(delta)) > 0) delta = delta < 0 ? -localDelta : localDelta;
      }
    } else {
      const index = delta < 0 ? secondPivotIndex : firstPivotIndex;
      const c = panelConstraints[index];
      const prevSize = initialLayout[index];
      if (c?.collapsible && compareLayoutNumbers(prevSize, c.minSize) < 0) {
        const gapSize = c.minSize - c.collapsedSize;
        if (delta > 0) {
          const nextSize = prevSize + delta;
          if (compareLayoutNumbers(nextSize, c.minSize) < 0) {
            delta = compareLayoutNumbers(delta, gapSize / 2) <= 0 ? 0 : gapSize;
          }
        } else {
          const nextSize = prevSize - delta;
          if (compareLayoutNumbers(nextSize, c.minSize) < 0) {
            delta = compareLayoutNumbers(100 + delta, 100 - gapSize / 2) > 0 ? 0 : -gapSize;
          }
        }
      }
    }

    {
      const increment = delta < 0 ? 1 : -1;
      let index = delta < 0 ? secondPivotIndex : firstPivotIndex;
      let maxAvailableDelta = 0;
      while (index >= 0 && index < panelConstraints.length) {
        const prevSize = initialLayout[index];
        const maxSafeSize = validatePanelSize({
          overrideDisabledPanels,
          panelConstraints: panelConstraints[index],
          prevSize,
          size: 100,
        });
        maxAvailableDelta += maxSafeSize - prevSize;
        index += increment;
      }
      const minAbsDelta = Math.min(Math.abs(delta), Math.abs(maxAvailableDelta));
      delta = delta < 0 ? -minAbsDelta : minAbsDelta;
    }

    {
      let index = delta < 0 ? firstPivotIndex : secondPivotIndex;
      while (index >= 0 && index < panelConstraints.length) {
        const deltaRemaining = Math.abs(delta) - Math.abs(deltaApplied);
        const prevSize = initialLayout[index];
        const safeSize = validatePanelSize({
          overrideDisabledPanels,
          panelConstraints: panelConstraints[index],
          prevSize,
          size: prevSize - deltaRemaining,
        });
        if (!layoutNumbersEqual(prevSize, safeSize)) {
          deltaApplied += prevSize - safeSize;
          nextLayout[index] = safeSize;
          if (compareLayoutNumbers(deltaApplied, Math.abs(delta)) >= 0) break;
        }
        index += delta < 0 ? -1 : 1;
      }
    }

    if (arraysEqual(prevLayout, nextLayout)) return prevObject;

    {
      const pivotIndex = delta < 0 ? secondPivotIndex : firstPivotIndex;
      const prevSize = initialLayout[pivotIndex];
      const unsafeSize = prevSize + deltaApplied;
      const safeSize = validatePanelSize({
        overrideDisabledPanels,
        panelConstraints: panelConstraints[pivotIndex],
        prevSize,
        size: unsafeSize,
      });
      nextLayout[pivotIndex] = safeSize;
      if (!layoutNumbersEqual(safeSize, unsafeSize)) {
        let deltaRemaining = unsafeSize - safeSize;
        let index = pivotIndex;
        while (index >= 0 && index < panelConstraints.length) {
          const current = nextLayout[index];
          const next = validatePanelSize({
            overrideDisabledPanels,
            panelConstraints: panelConstraints[index],
            prevSize: current,
            size: current + deltaRemaining,
          });
          if (!layoutNumbersEqual(current, next)) {
            deltaRemaining -= next - current;
            nextLayout[index] = next;
          }
          if (layoutNumbersEqual(deltaRemaining, 0)) break;
          index += delta > 0 ? -1 : 1;
        }
      }
    }

    const total = nextLayout.reduce((sum, size) => sum + size, 0);
    if (!layoutNumbersEqual(total, 100, 0.1)) return prevObject;
    const keys = Object.keys(prevObject);
    return nextLayout.reduce((result, current, index) => {
      result[keys[index]] = current;
      return result;
    }, {});
  }

  function preserveFixedPanelSizes(state, nextGroupSize, prevGroupSize, prevLayout) {
    if (prevGroupSize <= 0 || nextGroupSize <= 0 || prevGroupSize === nextGroupSize) return prevLayout;
    let fixedTotal = 0;
    let flexiblePrevTotal = 0;
    let hasFixed = false;
    const fixed = new Map();
    const flexible = [];
    for (const panel of state.panels) {
      const prev = prevLayout[panel.id] ?? 0;
      if (panel.raw.groupResizeBehavior === "preserve-pixel-size") {
        hasFixed = true;
        const next = formatLayoutNumber((((prev / 100) * prevGroupSize) / nextGroupSize) * 100);
        fixed.set(panel.id, next);
        fixedTotal += next;
      } else {
        flexible.push(panel.id);
        flexiblePrevTotal += prev;
      }
    }
    if (!hasFixed || flexible.length === 0) return prevLayout;
    const remaining = 100 - fixedTotal;
    const nextLayout = { ...prevLayout };
    fixed.forEach((size, id) => { nextLayout[id] = size; });
    for (const id of flexible) {
      nextLayout[id] = flexiblePrevTotal > 0
        ? formatLayoutNumber((prevLayout[id] / flexiblePrevTotal) * remaining)
        : formatLayoutNumber(remaining / flexible.length);
    }
    return nextLayout;
  }

  function panelRecord(element) {
    return {
      element,
      id: element.id,
      expandToSize: undefined,
      prevSize: undefined,
      raw: {
        collapsedSize: element.dataset.templCollapsedSize || "0%",
        collapsible: element.hasAttribute("data-templ-collapsible"),
        defaultSize: element.dataset.templDefaultSize,
        disabled: element.hasAttribute("data-disabled"),
        groupResizeBehavior: element.dataset.templGroupResizeBehavior || "preserve-relative-size",
        maxSize: element.dataset.templMaxSize || "100%",
        minSize: element.dataset.templMinSize || "0%",
      },
    };
  }

  function separatorRecord(element) {
    return {
      element,
      id: element.id,
      disabled: element.getAttribute("aria-disabled") === "true",
      disableDoubleClick: element.hasAttribute("data-templ-disable-double-click"),
    };
  }

  function parseDefaultLayout(group) {
    if (!group.dataset.templDefaultLayout) return undefined;
    try { return JSON.parse(group.dataset.templDefaultLayout); } catch (_) { return undefined; }
  }

  function stateFor(group) {
    if (!group) return null;
    let state = byElement.get(group);
    const panelElements = directChildren(group, PANEL);
    const separatorElements = directChildren(group, HANDLE);
    const signature = panelElements.map((element) => element.id).join(",") + "|" + separatorElements.map((element) => element.id).join(",");
    if (state?.signature === signature) return state;
    if (state) unmount(state);
    const orientation = orientationOf(group);
    state = {
      element: group,
      id: group.id,
      orientation,
      disabled: group.hasAttribute("data-templ-disabled"),
      disableCursor: group.hasAttribute("data-templ-disable-cursor"),
      resizeTargetMinimumSize: {
        coarse: Number.parseFloat(group.dataset.templResizeTargetMinimumSizeCoarse) || 20,
        fine: Number.parseFloat(group.dataset.templResizeTargetMinimumSizeFine) || 10,
      },
      panels: sortByElementOffset(orientation, panelElements.map(panelRecord)),
      separators: sortByElementOffset(orientation, separatorElements.map(separatorRecord)),
      expandedPanelSizes: {},
      signature,
      resizeObserver: null,
    };
    state.groupSize = calculateAvailableGroupSize(state);
    state.constraints = calculatePanelConstraints(state);
    const incoming = parseDefaultLayout(group);
    const validIncoming = incoming && Object.keys(incoming).length === state.panels.length && state.panels.every((panel) => incoming[panel.id] !== undefined);
    const unsafe = validIncoming ? state.panels.reduce((layout, panel) => {
      layout[panel.id] = incoming[panel.id]; return layout;
    }, {}) : calculateDefaultLayout(state.constraints);
    state.layout = validatePanelGroupLayout(unsafe, state.constraints);
    state.defaultLayoutDeferred = state.groupSize === 0;
    byElement.set(group, state);
    mounted.set(state.id, state);
    if (!state.defaultLayoutDeferred) render(state);
    observe(state);
    return state;
  }

  function unmount(state) {
    state.resizeObserver?.disconnect();
    mounted.delete(state.id);
    byElement.delete(state.element);
  }

  function panelSize(state, panel) {
    return {
      asPercentage: state.layout[panel.id],
      inPixels: state.orientation === "horizontal" ? panel.element.offsetWidth : panel.element.offsetHeight,
    };
  }

  function dispatchPanelResize(state, panel) {
    const next = panelSize(state, panel);
    const prev = panel.prevSize;
    if (!prev || !layoutNumbersEqual(prev.asPercentage, next.asPercentage) || prev.inPixels !== next.inPixels) {
      panel.prevSize = next;
      panel.element.dispatchEvent(new CustomEvent("resizable-panel-resize", {
        bubbles: true,
        detail: { panelSize: next, id: panel.id, prevPanelSize: prev },
      }));
    }
  }

  function pairForSeparator(state, separator) {
    const children = sortByElementOffset(state.orientation,
      [...state.element.children].map((element) => ({ element })));
    const index = children.findIndex((record) => record.element === separator.element);
    let before;
    let after;
    for (let i = index - 1; i >= 0; i--) {
      before = state.panels.find((panel) => panel.element === children[i].element);
      if (before) break;
    }
    for (let i = index + 1; i < children.length; i++) {
      after = state.panels.find((panel) => panel.element === children[i].element);
      if (after) break;
    }
    return before && after ? [before, after] : null;
  }

  function calculateSeparatorAriaValues(state, panel, panelIndex) {
    const constraints = state.constraints.find((current) => current.panelId === panel.id);
    const panelSizeValue = state.layout[panel.id];
    if (!constraints) return {};
    const minSize = constraints.collapsible ? constraints.collapsedSize : constraints.minSize;
    const pivots = [panelIndex, panelIndex + 1];
    const minLayout = validatePanelGroupLayout(adjustLayoutByDelta({
      delta: minSize - panelSizeValue,
      initialLayout: state.layout,
      panelConstraints: state.constraints,
      pivotIndices: pivots,
      prevLayout: state.layout,
    }), state.constraints);
    const maxLayout = validatePanelGroupLayout(adjustLayoutByDelta({
      delta: constraints.maxSize - panelSizeValue,
      initialLayout: state.layout,
      panelConstraints: state.constraints,
      pivotIndices: pivots,
      prevLayout: state.layout,
    }), state.constraints);
    return { controls: panel.id, min: minLayout[panel.id], max: maxLayout[panel.id], now: panelSizeValue };
  }

  function render(state) {
    const active = interaction.state === "active" && interaction.hitRegions.some((region) => region.state === state);
    state.panels.forEach((panel) => {
      panel.element.style.flexGrow = String(state.layout[panel.id] ?? 1);
      panel.element.style.flexBasis = "0px";
      panel.element.style.flexShrink = "1";
      panel.element.style.pointerEvents = active ? "none" : "";
      panel.element.dataset.panelSize = String(formatLayoutNumber(state.layout[panel.id]));
      dispatchPanelResize(state, panel);
    });
    state.separators.forEach((separator) => {
      const pair = pairForSeparator(state, separator);
      if (!pair) return;
      const primary = pair[0];
      const values = calculateSeparatorAriaValues(state, primary, state.panels.indexOf(primary));
      separator.element.setAttribute("aria-controls", values.controls);
      separator.element.setAttribute("aria-valuemin", String(values.min));
      separator.element.setAttribute("aria-valuemax", String(values.max));
      separator.element.setAttribute("aria-valuenow", String(values.now));
    });
  }

  function emitLayout(state, changed, isUserInteraction) {
    state.element.dispatchEvent(new CustomEvent(changed ? "resizable-layout-changed" : "resizable-layout-change", {
      bubbles: true,
      detail: { layout: { ...state.layout }, ...(changed ? { isUserInteraction } : {}) },
    }));
  }

  function updateLayout(state, nextLayout, { commit = false, isUserInteraction = false } = {}) {
    const prevLayout = state.layout;
    if (!layoutsEqual(prevLayout, nextLayout)) {
      state.constraints.forEach((constraints) => {
        if (constraints.collapsible && layoutNumbersEqual(nextLayout[constraints.panelId], constraints.collapsedSize) &&
            !layoutNumbersEqual(prevLayout[constraints.panelId], constraints.collapsedSize)) {
          state.expandedPanelSizes[constraints.panelId] = prevLayout[constraints.panelId];
        }
      });
      state.layout = nextLayout;
      render(state);
      emitLayout(state, false, isUserInteraction);
    }
    if (commit) emitLayout(state, true, isUserInteraction);
  }

  function observe(state) {
    const ResizeObserverClass = state.element.ownerDocument.defaultView?.ResizeObserver;
    if (!ResizeObserverClass) return;
    state.resizeObserver = new ResizeObserverClass(() => {
      const nextGroupSize = calculateAvailableGroupSize(state);
      if (nextGroupSize === 0) return;
      const nextConstraints = calculatePanelConstraints(state);
      const unsafe = state.defaultLayoutDeferred
        ? calculateDefaultLayout(nextConstraints)
        : preserveFixedPanelSizes(state, nextGroupSize, state.groupSize, state.layout);
      const nextLayout = validatePanelGroupLayout(unsafe, nextConstraints);
      state.constraints = nextConstraints;
      state.groupSize = nextGroupSize;
      state.defaultLayoutDeferred = false;
      updateLayout(state, nextLayout);
      render(state);
    });
    state.resizeObserver.observe(state.element);
    state.panels.forEach((panel) => state.resizeObserver.observe(panel.element));
  }

  function isCoarsePointer() {
    if (coarsePointer === undefined) coarsePointer = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
    return coarsePointer;
  }

  function expandedRect(rect, minimum) {
    let { x, y, width, height } = rect;
    if (width < minimum) {
      const delta = minimum - width;
      x -= delta / 2;
      width += delta;
    }
    if (height < minimum) {
      const delta = minimum - height;
      y -= delta / 2;
      height += delta;
    }
    return { x, y, width, height, left: x, right: x + width, top: y, bottom: y + height };
  }

  function rectFrom(x, y, width, height) {
    return { x, y, width, height, left: x, right: x + width, top: y, bottom: y + height };
  }

  function findClosestRect(orientation, rects, targetRect) {
    const point = { x: targetRect.x + targetRect.width / 2, y: targetRect.y + targetRect.height / 2 };
    let closest;
    let minDistance = Number.MAX_VALUE;
    for (const rect of rects) {
      const distance = distanceFromPoint(rect, point);
      const value = orientation === "horizontal" ? distance.x : distance.y;
      if (value < minDistance) {
        minDistance = value;
        closest = rect;
      }
    }
    return closest;
  }

  function calculateHitRegions(state) {
    const children = sortByElementOffset(state.orientation,
      [...state.element.children].map((element) => ({ element })));
    const regions = [];

    let disabledSeparator = false;
    let hasInterleavedStaticContent = false;
    let firstEnabledPanelIndex = -1;
    let lastEnabledPanelIndex = -1;
    let numEnabledPanels = 0;
    let previousPanel;
    let pendingSeparators = [];

    let currentPanelIndex = -1;
    for (const child of children) {
      const panel = state.panels.find((current) => current.element === child.element);
      if (panel) {
        currentPanelIndex++;
        if (!panel.raw.disabled) {
          numEnabledPanels++;
          if (firstEnabledPanelIndex === -1) firstEnabledPanelIndex = currentPanelIndex;
          lastEnabledPanelIndex = currentPanelIndex;
        }
      }
    }

    if (numEnabledPanels <= 1) return regions;

    currentPanelIndex = -1;
    for (const child of children) {
      const panel = state.panels.find((current) => current.element === child.element);
      if (panel) {
        currentPanelIndex++;
        if (previousPanel) {
          const beforeRect = previousPanel.element.getBoundingClientRect();
          const afterRect = panel.element.getBoundingClientRect();

          let candidates;
          if (hasInterleavedStaticContent) {
            const firstPanelEdgeRect = state.orientation === "horizontal"
              ? rectFrom(beforeRect.right, beforeRect.top, 0, beforeRect.height)
              : rectFrom(beforeRect.left, beforeRect.bottom, beforeRect.width, 0);
            const secondPanelEdgeRect = state.orientation === "horizontal"
              ? rectFrom(afterRect.left, afterRect.top, 0, afterRect.height)
              : rectFrom(afterRect.left, afterRect.top, afterRect.width, 0);
            if (pendingSeparators.length === 0) {
              candidates = [firstPanelEdgeRect, secondPanelEdgeRect];
            } else if (pendingSeparators.length === 1) {
              const separator = pendingSeparators[0];
              const closestRect = findClosestRect(
                state.orientation,
                [beforeRect, afterRect],
                separator.element.getBoundingClientRect(),
              );
              candidates = [separator, closestRect === beforeRect ? secondPanelEdgeRect : firstPanelEdgeRect];
            } else {
              candidates = pendingSeparators;
            }
          } else if (pendingSeparators.length) {
            candidates = pendingSeparators;
          } else {
            candidates = [state.orientation === "horizontal"
              ? rectFrom(beforeRect.right, afterRect.top, afterRect.left - beforeRect.right, afterRect.height)
              : rectFrom(afterRect.left, beforeRect.bottom, afterRect.width, afterRect.top - beforeRect.bottom)];
          }

          for (const rectOrSeparator of candidates) {
            const separator = rectOrSeparator.element ? rectOrSeparator : undefined;
            let rect = separator ? separator.element.getBoundingClientRect() : rectOrSeparator;
            const minimum = isCoarsePointer() ? state.resizeTargetMinimumSize.coarse : state.resizeTargetMinimumSize.fine;
            rect = expandedRect(rect, minimum);
            const skip = currentPanelIndex <= firstEnabledPanelIndex || currentPanelIndex > lastEnabledPanelIndex;
            if (!disabledSeparator && !skip) {
              regions.push({
                state,
                groupSize: calculateAvailableGroupSize(state),
                panels: [previousPanel, panel],
                separator,
                rect,
              });
            }
            disabledSeparator = false;
          }
        }
        hasInterleavedStaticContent = false;
        previousPanel = panel;
        pendingSeparators = [];
        continue;
      }
      const separator = state.separators.find((current) => current.element === child.element);
      if (separator) {
        if (separator.disabled) disabledSeparator = true;
        pendingSeparators.push(separator);
      } else if (child.element.hasAttribute("data-separator")) {
        previousPanel = undefined;
        pendingSeparators = [];
      } else {
        hasInterleavedStaticContent = true;
      }
    }
    return regions;
  }

  function distanceFromPoint(rect, point) {
    return {
      x: point.x >= rect.left && point.x <= rect.right ? 0 : Math.min(Math.abs(point.x - rect.left), Math.abs(point.x - rect.right)),
      y: point.y >= rect.top && point.y <= rect.bottom ? 0 : Math.min(Math.abs(point.y - rect.top), Math.abs(point.y - rect.bottom)),
    };
  }

  function rectsIntersect(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function stackingParent(node) {
    const parent = node.parentNode;
    return parent && parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? parent.host : parent;
  }

  function stackingAncestors(node) {
    const ancestors = [];
    while (node) {
      ancestors.push(node);
      node = stackingParent(node);
    }
    return ancestors;
  }

  function isFlexItem(node) {
    const parent = stackingParent(node) || node;
    const display = getComputedStyle(parent).display;
    return display === "flex" || display === "inline-flex";
  }

  function createsStackingContext(node) {
    const style = getComputedStyle(node);
    if (style.position === "fixed") return true;
    if (style.zIndex !== "auto" && (style.position !== "static" || isFlexItem(node))) return true;
    if (+style.opacity < 1) return true;
    if ("transform" in style && style.transform !== "none") return true;
    if ("webkitTransform" in style && style.webkitTransform !== "none") return true;
    if ("mixBlendMode" in style && style.mixBlendMode !== "normal") return true;
    if ("filter" in style && style.filter !== "none") return true;
    if ("webkitFilter" in style && style.webkitFilter !== "none") return true;
    if ("isolation" in style && style.isolation === "isolate") return true;
    if (/\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/.test(style.willChange)) return true;
    if (style.webkitOverflowScrolling === "touch") return true;
    return false;
  }

  function findStackingContext(nodes) {
    let index = nodes.length;
    while (index--) {
      const node = nodes[index];
      if (node && createsStackingContext(node)) return node;
    }
    return null;
  }

  function stackingZIndex(node) {
    return (node && Number(getComputedStyle(node).zIndex)) || 0;
  }

  // Forked from stacking-order@2.0.0, matching react-resizable-panels.
  function compareStackingOrder(a, b) {
    if (a === b) throw new Error("Cannot compare node with itself");
    const ancestors = { a: stackingAncestors(a), b: stackingAncestors(b) };
    let commonAncestor;
    while (ancestors.a.at(-1) === ancestors.b.at(-1)) {
      commonAncestor = ancestors.a.pop();
      ancestors.b.pop();
    }
    if (!commonAncestor) throw new Error("Stacking order can only be calculated for elements with a common ancestor");
    const zIndexes = {
      a: stackingZIndex(findStackingContext(ancestors.a)),
      b: stackingZIndex(findStackingContext(ancestors.b)),
    };
    if (zIndexes.a === zIndexes.b) {
      const children = commonAncestor.childNodes;
      const furthestAncestors = { a: ancestors.a.at(-1), b: ancestors.b.at(-1) };
      let index = children.length;
      while (index--) {
        const child = children[index];
        if (child === furthestAncestors.a) return 1;
        if (child === furthestAncestors.b) return -1;
      }
    }
    return Math.sign(zIndexes.a - zIndexes.b);
  }

  function isElement(value) {
    return value !== null && typeof value === "object" && "nodeType" in value && value.nodeType === Node.ELEMENT_NODE;
  }

  function isViableHitTarget(groupElement, hitRegion, pointerEventTarget) {
    if (!isElement(pointerEventTarget) || pointerEventTarget.contains(groupElement) || groupElement.contains(pointerEventTarget)) {
      return true;
    }
    if (compareStackingOrder(pointerEventTarget, groupElement) > 0) {
      let currentElement = pointerEventTarget;
      while (currentElement) {
        if (currentElement.contains(groupElement)) return true;
        if (rectsIntersect(currentElement.getBoundingClientRect(), hitRegion)) return false;
        currentElement = currentElement.parentElement;
      }
    }
    return true;
  }

  function matchingHitRegions(event) {
    const matches = [];
    mounted.forEach((state) => {
      if (state.disabled) return;
      let closest;
      let closestDistance = Infinity;
      calculateHitRegions(state).forEach((region) => {
        const distance = distanceFromPoint(region.rect, { x: event.clientX, y: event.clientY });
        const primary = state.orientation === "horizontal" ? distance.x : distance.y;
        if (primary <= closestDistance) {
          closest = { region, distance };
          closestDistance = primary;
        }
      });
      if (closest && closest.distance.x <= 0 && closest.distance.y <= 0) {
        if (isViableHitTarget(state.element, closest.region.rect, event.target)) {
          matches.push(closest.region);
        }
      }
    });
    return matches;
  }

  function setSeparatorStates() {
    mounted.forEach((state) => state.separators.forEach((separator) => {
      let value = separator.disabled ? "disabled" : separator.element === separator.element.ownerDocument.activeElement ? "focus" : "inactive";
      if (!separator.disabled) {
        const matched = interaction.hitRegions.some((region) => region.separator === separator);
        if (matched) value = interaction.state === "active" ? "active" : interaction.state === "hover" ? "hover" : value;
      }
      separator.element.setAttribute("data-separator", value);
    }));
  }

  function supportsAdvancedCursorStyles() {
    if (advancedCursorStyles === undefined) {
      advancedCursorStyles = navigator.userAgent.includes("Chrome") || navigator.userAgent.includes("Firefox");
    }
    return advancedCursorStyles;
  }

  function cursorForInteraction() {
    if (interaction.state !== "hover" && interaction.state !== "active") return undefined;
    let horizontal = 0;
    let vertical = 0;
    interaction.hitRegions.forEach((region) => {
      if (region.state.disableCursor) return;
      if (region.state.orientation === "horizontal") horizontal++;
      else vertical++;
    });
    if (interaction.state === "active" && interaction.cursorFlags && supportsAdvancedCursorStyles()) {
      const horizontalMin = (interaction.cursorFlags & CURSOR_FLAG_HORIZONTAL_MIN) !== 0;
      const horizontalMax = (interaction.cursorFlags & CURSOR_FLAG_HORIZONTAL_MAX) !== 0;
      const verticalMin = (interaction.cursorFlags & CURSOR_FLAG_VERTICAL_MIN) !== 0;
      const verticalMax = (interaction.cursorFlags & CURSOR_FLAG_VERTICAL_MAX) !== 0;
      if (horizontalMin) return verticalMin ? "se-resize" : verticalMax ? "ne-resize" : "e-resize";
      if (horizontalMax) return verticalMin ? "sw-resize" : verticalMax ? "nw-resize" : "w-resize";
      if (verticalMin) return "s-resize";
      if (verticalMax) return "n-resize";
    }
    if (supportsAdvancedCursorStyles()) {
      if (horizontal && vertical) return "move";
      if (horizontal) return "ew-resize";
      if (vertical) return "ns-resize";
    } else {
      if (horizontal && vertical) return "grab";
      if (horizontal) return "col-resize";
      if (vertical) return "row-resize";
    }
    return undefined;
  }

  function updateCursor() {
    const cursor = cursorForInteraction();
    if (!cursorStyleElement) {
      cursorStyleElement = document.createElement("style");
      cursorStyleElement.dataset.templResizableCursor = "";
      document.head.appendChild(cursorStyleElement);
    }
    cursorStyleElement.textContent = cursor ? `*, *:hover { cursor: ${cursor} !important; }` : "";
  }

  function setInteraction(next) {
    const previouslyActive = interaction.state === "active";
    interaction = next;
    setSeparatorStates();
    updateCursor();
    if (previouslyActive || next.state === "active") mounted.forEach(render);
  }

  function updateActiveRegions(event, pointerDownAtPoint = interaction.pointerDownAtPoint) {
    let nextCursorFlags = 0;
    for (const region of interaction.hitRegions) {
      const state = region.state;
      let delta = 0;
      if (pointerDownAtPoint) {
        delta = state.orientation === "horizontal"
          ? ((event.clientX - pointerDownAtPoint.x) / region.groupSize) * 100
          : ((event.clientY - pointerDownAtPoint.y) / region.groupSize) * 100;
      } else {
        delta = state.orientation === "horizontal"
          ? event.clientX < 0 ? -100 : 100
          : event.clientY < 0 ? -100 : 100;
      }
      const initialLayout = interaction.initialLayoutMap.get(state);
      if (!initialLayout) continue;
      const next = adjustLayoutByDelta({
        delta,
        initialLayout,
        panelConstraints: state.constraints,
        pivotIndices: region.panels.map((panel) => state.panels.indexOf(panel)),
        prevLayout: state.layout,
        trigger: "mouse-or-touch",
      });
      if (layoutsEqual(next, state.layout)) {
        if (delta !== 0 && !state.disableCursor) {
          if (state.orientation === "horizontal") {
            nextCursorFlags |= delta < 0 ? CURSOR_FLAG_HORIZONTAL_MIN : CURSOR_FLAG_HORIZONTAL_MAX;
          } else {
            nextCursorFlags |= delta < 0 ? CURSOR_FLAG_VERTICAL_MIN : CURSOR_FLAG_VERTICAL_MAX;
          }
        }
      } else {
        updateLayout(state, next, { isUserInteraction: true });
      }
      if (region.separator && !region.separator.element.hasPointerCapture?.(event.pointerId)) {
        region.separator.element.setPointerCapture?.(event.pointerId);
      }
    }

    let cursorFlags = 0;
    if (event.movementX === 0) cursorFlags |= interaction.cursorFlags & CURSOR_FLAGS_HORIZONTAL;
    else cursorFlags |= nextCursorFlags & CURSOR_FLAGS_HORIZONTAL;
    if (event.movementY === 0) cursorFlags |= interaction.cursorFlags & CURSOR_FLAGS_VERTICAL;
    else cursorFlags |= nextCursorFlags & CURSOR_FLAGS_VERTICAL;
    interaction.cursorFlags = cursorFlags;
    updateCursor();
  }

  function completePointerResize(event) {
    if (interaction.state !== "active") return false;
    const regions = interaction.hitRegions;
    regions.forEach((region) => {
      if (event?.pointerId !== undefined && region.separator?.element.hasPointerCapture?.(event.pointerId)) {
        region.separator.element.releasePointerCapture(event.pointerId);
      }
    });
    setInteraction({ state: "inactive", hitRegions: [], cursorFlags: 0 });
    new Set(regions.map((region) => region.state)).forEach((state) => {
      render(state);
      emitLayout(state, true, true);
    });
    return regions.length > 0;
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.defaultPrevented || (event.pointerType === "mouse" && event.button > 0)) return;
    const hitRegions = matchingHitRegions(event);
    const initialLayoutMap = new Map();
    hitRegions.forEach((region, index) => {
      // react-resizable-panels 4.5.8 calls focus() without suppressing the
      // focus-visible indicator; this is the behavior shipped by shadcn/ui.
      if (index === 0 && region.separator) region.separator.element.focus();
      initialLayoutMap.set(region.state, { ...region.state.layout });
    });
    setInteraction({
      state: "active",
      hitRegions,
      cursorFlags: 0,
      initialLayoutMap,
      pointerDownAtPoint: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
    });
    if (hitRegions.length) event.preventDefault();
  }, true);

  document.addEventListener("pointermove", (event) => {
    if (event.defaultPrevented) return;
    if (interaction.state === "active") {
      if (event.buttons === 0) {
        completePointerResize(event);
        return;
      }
      updateActiveRegions(event);
      return;
    }
    const hitRegions = matchingHitRegions(event);
    setInteraction(hitRegions.length
      ? { state: "hover", hitRegions, cursorFlags: 0 }
      : { state: "inactive", hitRegions: [], cursorFlags: 0 });
  });

  document.addEventListener("pointerleave", (event) => {
    if (interaction.state === "active") updateActiveRegions(event, null);
  });

  document.addEventListener("pointerout", (event) => {
    const IFrame = event.currentTarget.defaultView?.HTMLIFrameElement;
    if (IFrame && event.relatedTarget instanceof IFrame && interaction.state === "hover") {
      setInteraction({ state: "inactive", hitRegions: [], cursorFlags: 0 });
    }
  });

  document.addEventListener("pointerup", (event) => {
    if (event.defaultPrevented || (event.pointerType === "mouse" && event.button > 0)) return;
    if (completePointerResize(event)) event.preventDefault();
  }, true);
  document.addEventListener("pointercancel", completePointerResize, true);
  document.addEventListener("contextmenu", (event) => {
    if (!event.defaultPrevented) completePointerResize(event);
  }, true);

  document.addEventListener("focusin", (event) => {
    if (event.target instanceof Element && event.target.matches(HANDLE)) setSeparatorStates();
  });
  document.addEventListener("focusout", (event) => {
    if (event.target instanceof Element && event.target.matches(HANDLE)) queueMicrotask(setSeparatorStates);
  });

  function adjustForSeparator(state, separator, delta) {
    const pair = pairForSeparator(state, separator);
    if (!pair) return;
    const next = validatePanelGroupLayout(adjustLayoutByDelta({
      delta,
      initialLayout: state.layout,
      panelConstraints: state.constraints,
      pivotIndices: pair.map((panel) => state.panels.indexOf(panel)),
      prevLayout: state.layout,
      trigger: "keyboard",
    }), state.constraints);
    updateLayout(state, next, { commit: true, isUserInteraction: true });
  }

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (!(event.target instanceof Element) || !event.target.matches(HANDLE)) return;
    const state = stateFor(event.target.closest(GROUP));
    const separator = state?.separators.find((current) => current.element === event.target);
    if (!state || !separator || state.disabled || separator.disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (state.orientation === "vertical") adjustForSeparator(state, separator, 5);
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (state.orientation === "horizontal") adjustForSeparator(state, separator, -5);
        break;
      case "ArrowRight":
        event.preventDefault();
        if (state.orientation === "horizontal") adjustForSeparator(state, separator, 5);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (state.orientation === "vertical") adjustForSeparator(state, separator, -5);
        break;
      case "Home":
        event.preventDefault();
        adjustForSeparator(state, separator, -100);
        break;
      case "End":
        event.preventDefault();
        adjustForSeparator(state, separator, 100);
        break;
      case "Enter": {
        event.preventDefault();
        const pair = pairForSeparator(state, separator);
        const primary = pair?.[0];
        const constraints = primary && state.constraints.find((current) => current.panelId === primary.id);
        if (primary && constraints?.collapsible) {
          const prevSize = state.layout[primary.id];
          const nextSize = layoutNumbersEqual(constraints.collapsedSize, prevSize)
            ? state.expandedPanelSizes[primary.id] ?? constraints.minSize
            : constraints.collapsedSize;
          adjustForSeparator(state, separator, nextSize - prevSize);
        }
        break;
      }
      case "F6": {
        event.preventDefault();
        const index = state.separators.indexOf(separator);
        const nextIndex = event.shiftKey
          ? index > 0 ? index - 1 : state.separators.length - 1
          : index + 1 < state.separators.length ? index + 1 : 0;
        state.separators[nextIndex]?.element.focus({ preventScroll: true });
        break;
      }
    }
  });

  function setPanelSize(state, panel, nextSize) {
    const prevSize = state.layout[panel.id];
    if (layoutNumbersEqual(nextSize, prevSize)) return false;
    const index = state.panels.indexOf(panel);
    const isFirst = index === 0;
    const isLast = index === state.panels.length - 1;
    let unsafe;
    const allPreviousCollapsed = isLast && nextSize < prevSize &&
      (isFirst || state.panels.slice(0, index).every((_, panelIndex) => {
        const constraints = state.constraints[panelIndex];
        return constraints.collapsible && layoutNumbersEqual(constraints.collapsedSize, state.layout[constraints.panelId]);
      }));
    if (allPreviousCollapsed) {
      const occupied = state.panels.slice(0, index).reduce((total, current) => total + state.layout[current.id], 0);
      unsafe = { ...state.layout, [panel.id]: formatLayoutNumber(100 - occupied) };
    } else {
      if (state.panels.length < 2) return false;
      unsafe = adjustLayoutByDelta({
        delta: isLast ? prevSize - nextSize : nextSize - prevSize,
        initialLayout: state.layout,
        panelConstraints: state.constraints,
        pivotIndices: isLast ? [index - 1, index] : [index, index + 1],
        prevLayout: state.layout,
        trigger: "imperative-api",
      });
    }
    const next = validatePanelGroupLayout(unsafe, state.constraints);
    if (layoutsEqual(state.layout, next)) return false;
    updateLayout(state, next, { commit: true, isUserInteraction: false });
    return true;
  }

  function resolve(value, selector) {
    if (value instanceof Element) return value.matches(selector) ? value : value.closest(selector);
    if (typeof value !== "string") return null;
    const byId = document.getElementById(value);
    if (byId?.matches(selector)) return byId;
    try {
      const match = document.querySelector(value);
      return match?.matches(selector) ? match : null;
    } catch (_) { return null; }
  }

  function panelAndState(value) {
    const element = resolve(value, PANEL);
    const state = stateFor(element?.closest(GROUP));
    const panel = state?.panels.find((current) => current.element === element);
    return { element, state, panel };
  }

  function resizePanel(value, size) {
    const { state, panel } = panelAndState(value);
    if (!state || !panel || state.defaultLayoutDeferred) return false;
    const pixels = sizeStyleToPixels(state, panel, size);
    const percentage = formatLayoutNumber((pixels / calculateAvailableGroupSize(state)) * 100);
    return setPanelSize(state, panel, percentage);
  }

  document.addEventListener("dblclick", (event) => {
    if (event.defaultPrevented) return;
    matchingHitRegions(event).forEach((region) => {
      if (region.separator?.disableDoubleClick) return;
      const panel = region.panels.find((current) => current.raw.defaultSize !== undefined);
      if (panel && resizePanel(panel.element, panel.raw.defaultSize)) event.preventDefault();
    });
  }, true);

  const api = {
    resize: resizePanel,
    collapse(value) {
      const { state, panel } = panelAndState(value);
      const constraints = state?.constraints.find((current) => current.panelId === panel?.id);
      if (!state || !panel || !constraints?.collapsible || layoutNumbersEqual(state.layout[panel.id], constraints.collapsedSize)) return false;
      panel.expandToSize = state.layout[panel.id];
      return setPanelSize(state, panel, constraints.collapsedSize);
    },
    expand(value) {
      const { state, panel } = panelAndState(value);
      const constraints = state?.constraints.find((current) => current.panelId === panel?.id);
      if (!state || !panel || !constraints?.collapsible || !layoutNumbersEqual(state.layout[panel.id], constraints.collapsedSize)) return false;
      let nextSize = panel.expandToSize ?? constraints.minSize;
      if (nextSize === 0) nextSize = 1;
      return setPanelSize(state, panel, nextSize);
    },
    getSize(value) {
      const { state, panel } = panelAndState(value);
      return state && panel ? panelSize(state, panel) : null;
    },
    isCollapsed(value) {
      const { state, panel } = panelAndState(value);
      const constraints = state?.constraints.find((current) => current.panelId === panel?.id);
      return Boolean(state && panel && constraints?.collapsible && layoutNumbersEqual(constraints.collapsedSize, state.layout[panel.id]));
    },
    getLayout(value) {
      const state = stateFor(resolve(value, GROUP));
      return !state || state.defaultLayoutDeferred ? {} : { ...state.layout };
    },
    setLayout(value, unsafeLayout) {
      const state = stateFor(resolve(value, GROUP));
      if (!state || state.defaultLayoutDeferred || !unsafeLayout || Array.isArray(unsafeLayout)) return {};
      const ordered = state.panels.reduce((layout, panel) => {
        layout[panel.id] = unsafeLayout[panel.id];
        return layout;
      }, {});
      const next = validatePanelGroupLayout(ordered, state.constraints);
      updateLayout(state, next, { commit: true, isUserInteraction: false });
      return { ...next };
    },
  };

  function initialize(root = document) {
    if (root.matches?.(GROUP)) stateFor(root);
    root.querySelectorAll?.(GROUP).forEach(stateFor);
  }

  function cleanup(root) {
    mounted.forEach((state) => {
      if (state.element === root || root.contains?.(state.element)) unmount(state);
    });
  }

  window.templ = window.templ || {};
  window.templ.resizable = api;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initialize());
  else initialize();
  new MutationObserver((records) => records.forEach((record) => {
    record.removedNodes.forEach((node) => {
      if (node instanceof Element) cleanup(node);
    });
    record.addedNodes.forEach((node) => {
      if (node instanceof Element) initialize(node);
    });
  })).observe(document.documentElement, { childList: true, subtree: true });
})();
