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

  function valuesOf(root) {
    return thumbsOf(root).map((t) => parseFloat(t.getAttribute("aria-valuenow") || "0"));
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
    thumbsOf(root).forEach((t, i) => {
      const f = fraction(values[i], c);
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
    root.querySelectorAll(':scope > input[type="hidden"]').forEach((input, i) => {
      if (values[i] != null) input.value = String(values[i]);
    });
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
    thumbsOf(root)[index].setAttribute("aria-valuenow", String(v));
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
    const index = pressedThumb ? thumbsOf(root).indexOf(pressedThumb) : nearestThumb(root, v);
    drag = { root, index };
    if (!pressedThumb) setValue(root, index, v);
    thumbsOf(root)[index].focus({ preventScroll: true });
  });

  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    setValue(drag.root, drag.index, valueFromPointer(drag.root, e));
  });

  document.addEventListener("pointerup", () => {
    drag = null;
  });

  document.addEventListener("keydown", (e) => {
    if (!(e.target instanceof Element)) return;
    const thumb = e.target.closest('[data-slot="slider-thumb"]');
    if (!thumb) return;
    const root = thumb.closest('[data-slot="slider"]');
    if (!root || root.hasAttribute("data-disabled")) return;
    const c = config(root);
    const index = thumbsOf(root).indexOf(thumb);
    const v = valuesOf(root)[index];
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = v + c.step;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = v - c.step;
    if (e.key === "PageUp") next = v + c.step * 10;
    if (e.key === "PageDown") next = v - c.step * 10;
    if (e.key === "Home") next = c.min;
    if (e.key === "End") next = c.max;
    if (next === null) return;
    e.preventDefault();
    setValue(root, index, next);
  });
})();
