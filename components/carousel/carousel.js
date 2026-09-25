(function () {
  "use strict";

  // Embla-pendant engine: slides snap content-flush to the viewport, drags
  // track the pointer 1:1 with edge resistance, and the animation runs
  // embla's own physics, per 60fps step the velocity is attracted towards
  // the target and damped by friction. Same defaults as embla.
  const DURATION = 25; // embla's duration option, attraction = diff / DURATION
  const FRICTION = 0.68;
  const STEP_MS = 1000 / 60;
  const MOMENTUM_MS = 140; // how far a release projects the current velocity
  const RESISTANCE = 0.35; // drag resistance beyond the edges

  const instances = new WeakMap();

  function setup(root) {
    if (instances.has(root)) return;
    const viewport = root.querySelector('[data-slot="carousel-content"]');
    // The track is the content's inner div (embla's container, no slot).
    const track = viewport && viewport.firstElementChild;
    if (!viewport || !track) return;

    const state = {
      root,
      viewport,
      track,
      index: 0,
      offset: 0,
      target: 0,
      velocity: 0,
      raf: null,
      horizontal: root.getAttribute("data-templ-orientation") !== "vertical",
      align: root.getAttribute("data-templ-align") || "center",
      loop: root.getAttribute("data-templ-loop") === "true",
      autoplay: root.getAttribute("data-templ-autoplay") === "true",
      interval: parseInt(root.getAttribute("data-templ-interval"), 10) || 5000,
      timer: null,
    };
    instances.set(root, state);

    track.addEventListener("pointerdown", (e) => onDragStart(state, e));
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollPrev(state);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollNext(state);
      }
    });

    if (state.autoplay) {
      startAutoplay(state);
      root.addEventListener("mouseenter", () => stopAutoplay(state));
      root.addEventListener("mouseleave", () => startAutoplay(state));
    }

    update(state, false);
  }

  function items(state) {
    return [...state.track.querySelectorAll('[data-slot="carousel-item"]')].filter(
      (item) => item.parentElement === state.track,
    );
  }

  // Snap offsets per slide relative to the first slide, so the gutter margin
  // on the track cancels against the slide padding and content sits flush.
  // The last snaps are clamped so the track end aligns with the viewport
  // edge (embla's trimSnaps).
  function snaps(state) {
    const its = items(state);
    if (!its.length) return [0];
    const base = state.horizontal ? its[0].offsetLeft : its[0].offsetTop;
    const last = its[its.length - 1];
    const end =
      (state.horizontal ? last.offsetLeft + last.offsetWidth : last.offsetTop + last.offsetHeight) -
      base;
    const viewportSize = state.horizontal
      ? state.viewport.clientWidth
      : state.viewport.clientHeight;
    // The slide boxes carry the gutter as leading padding, the visible
    // content ends one gutter before the last box edge.
    const style = getComputedStyle(its[0]);
    const gutter = parseFloat(state.horizontal ? style.paddingLeft : style.paddingTop) || 0;
    const max = Math.max(0, end - gutter - viewportSize);
    const points = [];
    for (const item of its) {
      const start = (state.horizontal ? item.offsetLeft : item.offsetTop) - base;
      const size = (state.horizontal ? item.offsetWidth : item.offsetHeight) - gutter;
      let offset = start;
      if (state.align === "center") offset = start - (viewportSize - size) / 2;
      else if (state.align === "end") offset = start - (viewportSize - size);
      // Clamp into the scrollable range (embla's trimSnaps), edge slides
      // collapse onto the flush bounds and dedupe.
      offset = Math.max(0, Math.min(offset, max));
      if (!points.length || points[points.length - 1] < offset - 0.5) points.push(offset);
    }
    return points.length ? points : [0];
  }

  function render(state) {
    state.track.style.transform = state.horizontal
      ? "translate3d(" + -state.offset + "px, 0, 0)"
      : "translate3d(0, " + -state.offset + "px, 0)";
  }

  function stopEngine(state) {
    cancelAnimationFrame(state.raf);
    state.raf = null;
  }

  // Embla's scroll body: every 60fps step the velocity is pulled towards the
  // target and damped, which gives the fast start and floaty settle.
  function startEngine(state) {
    stopEngine(state);
    let last = performance.now();
    let carry = 0;
    const tick = (now) => {
      carry += now - last;
      last = now;
      while (carry >= STEP_MS) {
        carry -= STEP_MS;
        const diff = state.target - state.offset;
        state.velocity += diff / DURATION;
        state.velocity *= FRICTION;
        state.offset += state.velocity;
      }
      if (Math.abs(state.target - state.offset) < 0.05 && Math.abs(state.velocity) < 0.05) {
        state.offset = state.target;
        state.velocity = 0;
        render(state);
        state.raf = null;
        return;
      }
      render(state);
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }

  function update(state, animate) {
    const points = snaps(state);
    state.index = Math.max(0, Math.min(state.index, points.length - 1));
    state.target = points[state.index];
    if (animate) {
      startEngine(state);
    } else {
      stopEngine(state);
      state.offset = state.target;
      state.velocity = 0;
      render(state);
    }

    const prev = state.root.querySelector('[data-slot="carousel-previous"]');
    const next = state.root.querySelector('[data-slot="carousel-next"]');
    if (prev) prev.disabled = !state.loop && state.index === 0;
    if (next) next.disabled = !state.loop && state.index >= points.length - 1;

    // Expose the selection like embla's select event, as a bubbling event;
    // selected counts from 1.
    state.root.dispatchEvent(
      new CustomEvent("carousel-select", {
        bubbles: true,
        detail: { selected: state.index + 1, count: points.length },
      })
    );
  }

  function scrollPrev(state) {
    const count = snaps(state).length;
    if (state.index > 0) {
      state.index -= 1;
    } else if (state.loop) {
      state.index = count - 1;
    } else {
      return;
    }
    update(state, true);
  }

  function scrollNext(state) {
    const count = snaps(state).length;
    if (state.index < count - 1) {
      state.index += 1;
    } else if (state.loop) {
      state.index = 0;
    } else {
      return;
    }
    update(state, true);
  }

  // ----- drag -----------------------------------------------------------------

  function onDragStart(state, e) {
    if (e.button !== 0) return;
    stopAutoplay(state);
    stopEngine(state);
    const points = snaps(state);
    const max = points[points.length - 1];
    const startCoord = state.horizontal ? e.clientX : e.clientY;
    const startOffset = state.offset;
    let lastCoord = startCoord;
    let lastTime = performance.now();
    let velocity = 0;
    let moved = false;

    const onMove = (ev) => {
      const coord = state.horizontal ? ev.clientX : ev.clientY;
      const now = performance.now();
      if (now > lastTime) velocity = (coord - lastCoord) / (now - lastTime);
      lastCoord = coord;
      lastTime = now;
      moved = true;

      // The track follows the pointer, with resistance beyond the edges.
      let offset = startOffset - (coord - startCoord);
      if (offset < 0) offset = offset * RESISTANCE;
      if (offset > max) offset = max + (offset - max) * RESISTANCE;
      state.offset = offset;
      render(state);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) return;
      // Project the momentum, settle on the nearest snap and carry the drag
      // velocity into the engine (embla's force application).
      const projected = state.offset - velocity * MOMENTUM_MS;
      let nearest = 0;
      for (let i = 1; i < points.length; i++) {
        if (Math.abs(points[i] - projected) < Math.abs(points[nearest] - projected)) nearest = i;
      }
      state.index = nearest;
      state.velocity = -velocity * STEP_MS;
      update(state, true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ----- autoplay ---------------------------------------------------------------

  function startAutoplay(state) {
    if (!state.autoplay) return;
    stopAutoplay(state);
    state.timer = setInterval(() => {
      const count = snaps(state).length;
      state.index = state.index >= count - 1 ? 0 : state.index + 1;
      update(state, true);
    }, state.interval);
  }

  function stopAutoplay(state) {
    clearInterval(state.timer);
    state.timer = null;
  }

  // ----- events -----------------------------------------------------------------

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const button = e.target.closest('[data-slot="carousel-previous"], [data-slot="carousel-next"]');
    const root = button?.closest('[data-slot="carousel"]');
    if (!root) return;
    const state = instances.get(root);
    if (!state) return;
    if (button.matches('[data-slot="carousel-previous"]')) {
      scrollPrev(state);
    } else {
      scrollNext(state);
    }
  });

  window.addEventListener("resize", () => {
    document.querySelectorAll('[data-slot="carousel"]').forEach((root) => {
      const state = instances.get(root);
      if (state) update(state, false);
    });
  });

  function init() {
    document.querySelectorAll('[data-slot="carousel"]').forEach(setup);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // Re-init on any childList mutation, directly (never rAF-deferred: rAF
  // does not fire in hidden tabs or throttled iframes): swapped-in markup
  // wires itself.
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });
})();
