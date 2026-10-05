(function () {
  "use strict";

  // size-3 in px; Base UI's edge thumb alignment keeps the thumb inside the
  // track by shifting it up to its own width. Mirrors slider.templ.
  const THUMB = 12;

  function config(root) {
    return {
      min: parseFloat(root.getAttribute("data-templ-min") || "0"),
      max: parseFloat(root.getAttribute("data-templ-max") || "100"),
      step: parseFloat(root.getAttribute("data-templ-step") || "1") || 1,
      vertical: root.getAttribute("data-orientation") === "vertical",
    };
  }

  function thumbsOf(root) {
    return [...root.querySelectorAll('[data-slot="slider-thumb"]')];
  }

  // SliderThumb's range input, which takes the focus and carries the value.
  function inputOf(thumb) {
    return thumb.querySelector(':scope > input[type="range"]');
  }

  // SliderThumb's index: with a number value (not a range) every thumb is
  // index 0 and shows the one value, like shadcn's two thumbs of value={50}.
  function indexOf(thumb) {
    return parseInt(thumb.getAttribute("data-index") || "0", 10);
  }

  function thumbAt(root, index) {
    return thumbsOf(root).find((t) => indexOf(t) === index);
  }

  function valuesOf(root) {
    const values = [];
    thumbsOf(root).forEach((t) => {
      values[indexOf(t)] ??= parseFloat(inputOf(t)?.getAttribute("aria-valuenow") || "0");
    });
    return values;
  }

  // Base UI's default aria-valuetext: a two thumb range names its start and
  // end.
  function syncInputs(root, values) {
    thumbsOf(root).forEach((thumb) => {
      const i = indexOf(thumb);
      const input = inputOf(thumb);
      if (!input) return;
      input.value = String(values[i]);
      input.setAttribute("value", String(values[i]));
      input.setAttribute("aria-valuenow", String(values[i]));
      if (values.length === 2) input.setAttribute("aria-valuetext", values[i] + (i === 0 ? " start range" : " end range"));
    });
  }

  function fraction(v, c) {
    if (c.max === c.min) return 0;
    return Math.min(1, Math.max(0, (v - c.min) / (c.max - c.min)));
  }

  function decimals(step) {
    const s = String(step);
    const i = s.indexOf(".");
    return i === -1 ? 0 : s.length - i - 1;
  }

  function render(root) {
    const c = config(root);
    const values = valuesOf(root);
    thumbsOf(root).forEach((t) => {
      const f = fraction(values[indexOf(t)], c);
      if (c.vertical) {
        const g = 1 - f;
        t.style.top = "calc(" + (g * 100).toFixed(4) + "% - " + (g * THUMB).toFixed(2) + "px)";
      } else {
        t.style.left = "calc(" + (f * 100).toFixed(4) + "% - " + (f * THUMB).toFixed(2) + "px)";
      }
    });
    const range = root.querySelector('[data-slot="slider-range"]');
    if (range) {
      const fs = values.map((v) => fraction(v, c));
      const lo = values.length > 1 ? Math.min(...fs) : 0;
      const hi = values.length > 0 ? Math.max(...fs) : 0;
      if (c.vertical) {
        if (values.length > 1) {
          range.style.bottom = "calc(" + (lo * 100).toFixed(4) + "% + " + (THUMB / 2 - lo * THUMB).toFixed(2) + "px)";
          range.style.height = "calc(" + ((hi - lo) * 100).toFixed(4) + "% - " + ((hi - lo) * THUMB).toFixed(2) + "px)";
        } else {
          range.style.bottom = "0";
          range.style.height = "calc(" + (hi * 100).toFixed(4) + "% + " + (THUMB / 2 - hi * THUMB).toFixed(2) + "px)";
        }
      } else {
        if (values.length > 1) {
          range.style.left = "calc(" + (lo * 100).toFixed(4) + "% + " + (THUMB / 2 - lo * THUMB).toFixed(2) + "px)";
          range.style.width = "calc(" + ((hi - lo) * 100).toFixed(4) + "% - " + ((hi - lo) * THUMB).toFixed(2) + "px)";
        } else {
          range.style.left = "0";
          range.style.width = "calc(" + (hi * 100).toFixed(4) + "% + " + (THUMB / 2 - hi * THUMB).toFixed(2) + "px)";
        }
      }
    }
  }

  function snap(v, c) {
    const stepped = Math.round((v - c.min) / c.step) * c.step + c.min;
    const clamped = Math.min(c.max, Math.max(c.min, stepped));
    return parseFloat(clamped.toFixed(decimals(c.step)));
  }

  function setValue(root, index, v) {
    const c = config(root);
    const values = valuesOf(root);
    v = snap(v, c);
    // Thumbs cannot cross each other (Base UI clamps at the neighbor).
    if (index > 0) v = Math.max(v, values[index - 1]);
    if (index < values.length - 1) v = Math.min(v, values[index + 1]);
    if (values[index] === v) return;
  const nextValues = values.slice();
  nextValues[index] = v;
  const change = new CustomEvent("slider-change", {
    bubbles: true,
    cancelable: true,
    detail: { values: nextValues },
  });
  const accepted = root.dispatchEvent(change);
  if (!accepted || root.hasAttribute("data-templ-value")) return;
    syncInputs(root, nextValues);
    render(root);
  }

  // Inverts the edge alignment: the usable span is the track minus one thumb.
  function valueFromPointer(root, e) {
    const c = config(root);
    const track = root.querySelector('[data-slot="slider-track"]');
    const rect = track.getBoundingClientRect();
    let f;
    if (c.vertical) {
      const usable = rect.height - THUMB;
      f = usable <= 0 ? 0 : (rect.bottom - THUMB / 2 - e.clientY) / usable;
    } else {
      const usable = rect.width - THUMB;
      f = usable <= 0 ? 0 : (e.clientX - rect.left - THUMB / 2) / usable;
    }
    return c.min + Math.min(1, Math.max(0, f)) * (c.max - c.min);
  }

  function nearestThumb(root, v) {
    const values = valuesOf(root);
    let best = 0;
    let bestDist = Infinity;
    values.forEach((val, i) => {
      const d = Math.abs(val - v);
      // On a tie the upper thumb moves when pressing above it.
      if (d < bestDist || (d === bestDist && v > val)) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }

  let drag = null; // { root, index }

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    const root = e.target.closest('[data-slot="slider"]');
    if (!root || root.hasAttribute("data-disabled")) return;
    // SliderControl has no slot in shadcn; it is the track's parent.
    const control = root.querySelector('[data-slot="slider-track"]').parentElement;
    if (!control.contains(e.target)) return;
    e.preventDefault();
    const v = valueFromPointer(root, e);
    const pressedThumb = e.target.closest('[data-slot="slider-thumb"]');
    const index = pressedThumb ? indexOf(pressedThumb) : nearestThumb(root, v);
    drag = { root, index };
    if (!pressedThumb) setValue(root, index, v);
    inputOf(pressedThumb ?? thumbAt(root, index))?.focus({ preventScroll: true });
  });

  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    setValue(drag.root, drag.index, valueFromPointer(drag.root, e));
  });

  document.addEventListener("pointerup", () => {
    drag = null;
  });

  // SliderThumb's input onKeyDown: the arrows move by step (Shift: the
  // large step), Page keys by the large step, Home and End to the ends or,
  // in a range, to the neighbor.
  const LARGE_STEP = 10;

  document.addEventListener("keydown", (e) => {
    if (!(e.target instanceof Element) || e.defaultPrevented) return;
    const thumb = e.target.closest('[data-slot="slider-thumb"]');
    if (!thumb || e.target !== inputOf(thumb)) return;
    const root = thumb.closest('[data-slot="slider"]');
    if (!root || root.hasAttribute("data-disabled")) return;
    const c = config(root);
    const values = valuesOf(root);
    const index = indexOf(thumb);
    const v = snap(values[index], c);
    const rtl = window.templ.direction.useDirection(root) === "rtl";
    const by = e.shiftKey ? LARGE_STEP : c.step;
    let next = null;
    if (e.key === "ArrowUp") next = v + by;
    if (e.key === "ArrowRight") next = v + (rtl ? -by : by);
    if (e.key === "ArrowDown") next = v - by;
    if (e.key === "ArrowLeft") next = v + (rtl ? by : -by);
    if (e.key === "PageUp") next = v + LARGE_STEP;
    if (e.key === "PageDown") next = v - LARGE_STEP;
    if (e.key === "Home") next = values.length > 1 && index > 0 ? values[index - 1] : c.min;
    if (e.key === "End") next = values.length > 1 && index < values.length - 1 ? values[index + 1] : c.max;
    if (next === null) return;
    e.preventDefault();
    setValue(root, index, next);
  });

  // The input's onChange: an assistive technology sets the value natively.
  document.addEventListener("input", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches('[data-slot="slider-thumb"] > input[type="range"]')) return;
    const thumb = e.target.parentElement;
    const root = thumb.closest('[data-slot="slider"]');
    if (root) setValue(root, indexOf(thumb), e.target.valueAsNumber);
  });
  // The public API for a page that sets the state from outside, the pendant
  // of a controlled Base UI slider whose owner re-renders it.
  function setDisabled(root, disabled) {
    [root, root.querySelector('[data-slot="slider-track"]')?.parentElement, ...root.querySelectorAll(
      '[data-slot="slider-track"], [data-slot="slider-range"], [data-slot="slider-thumb"]',
    )].forEach((el) => el?.toggleAttribute("data-disabled", disabled));
    thumbsOf(root).forEach((thumb) => {
      const input = inputOf(thumb);
      if (input) input.disabled = disabled;
    });
  }

  window.templ = window.templ || {};
  window.templ.slider = {
    values: valuesOf,
    setValues(root, values) {
      syncInputs(root, values);
      render(root);
    },
    setDisabled,
  };
})();
