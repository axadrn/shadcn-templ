(function () {
  "use strict";

  // Base UI's Toast.Viewport, shadcn's toast-viewport slot.
  var VIEWPORT = '[data-slot="toast-viewport"]';

  // Vanilla port of shadcn's base/toast (Base UI Toast): the class strings,
  // CSS variables and stacking behavior mirror components/ui/toast.tsx.

  var ENTER_EXIT_MS = 500;
  var SWIPE_THRESHOLD = 45;
  var GAP = 12; // --gap: 0.75rem

  var TOAST_CLASS = [
    "cn-toast group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom border bg-popover text-popover-foreground shadow-lg will-change-transform outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
    "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
    "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
    "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
    "data-limited:opacity-0 data-starting-style:[transform:translateY(150%)]",
    "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
    "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
    "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
    "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
    "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
    "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
    "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
    "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
    "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
  ].join(" ");

  var CONTENT_CLASS =
    "flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100";
  var TITLE_CLASS = "text-sm font-medium";
  var DESCRIPTION_CLASS = "text-sm text-muted-foreground";
  var ICON_CLASS =
    "shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4";

  // The Button component's classes, resolved for variant outline size sm
  // (ToastAction) and variant ghost size icon-sm (ToastClose): the base is
  // button.templ's baseClasses, the look comes from the cn-button-* classes.
  var BUTTON_BASE =
    "cn-button group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";
  var ACTION_CLASS = [BUTTON_BASE, "cn-button-variant-outline cn-button-size-sm shrink-0"].join(" ");
  var CLOSE_CLASS = [
    BUTTON_BASE,
    "cn-button-variant-ghost cn-button-size-icon-sm relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
  ].join(" ");

  var ICONS = {
    success:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    warning:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    error:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-destructive" aria-hidden="true"><path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/></svg>',
    loading:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
    close:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  };

  function viewportOf(el) {
    return el ? el.closest(VIEWPORT) : document.querySelector(VIEWPORT);
  }

  function toastsOf(vp) {
    // Newest first, like Base UI's toast list; leaving toasts keep animating
    // but no longer take part in the layout.
    return Array.from(vp.querySelectorAll('[data-slot="toast"]:not([data-ending-style])')).reverse();
  }

  // ----- layout: the Base UI stacking variables -----------------------------

  function layout(vp) {
    var list = toastsOf(vp);
    var limit = parseInt(vp.getAttribute("data-templ-limit"), 10) || 3;
    var expanded = vp.hasAttribute("data-expanded");

    // Natural heights first: with the per-toast vars cleared, h-(--height)
    // resolves to auto.
    list.forEach(function (t) {
      t.style.removeProperty("--toast-height");
      t.style.removeProperty("--toast-frontmost-height");
    });
    var heights = list.map(function (t) {
      return t.offsetHeight;
    });

    var offset = 0;
    list.forEach(function (t, i) {
      t.style.setProperty("--toast-index", String(i));
      t.style.setProperty("--toast-height", heights[i] + "px");
      if (i > 0) {
        t.style.setProperty("--toast-frontmost-height", heights[0] + "px");
      }
      // --toast-offset-y carries only the summed heights, the class formula
      // adds index*gap on top.
      t.style.setProperty("--toast-offset-y", offset + "px");
      offset += heights[i];
      t.toggleAttribute("data-limited", i >= limit);
      t.toggleAttribute("data-expanded", expanded);
      var content = t.querySelector('[data-slot="toast-content"]');
      if (content) {
        content.toggleAttribute("data-behind", i > 0 && !expanded);
        content.toggleAttribute("data-expanded", expanded || i === 0);
      }
    });
  }

  // ----- timers -------------------------------------------------------------

  function startTimer(t) {
    if (t.getAttribute("data-type") === "loading") return;
    var vp = viewportOf(t);
    var timeout = parseInt(t.getAttribute("data-templ-timeout"), 10);
    if (!timeout) {
      timeout = parseInt(vp.getAttribute("data-templ-timeout"), 10) || 5000;
    }
    var remaining = t._templRemaining != null ? t._templRemaining : timeout;
    t._templDeadline = Date.now() + remaining;
    t._templTimer = window.setTimeout(function () {
      dismiss(t);
    }, remaining);
  }

  function stopTimer(t) {
    if (t._templTimer) {
      window.clearTimeout(t._templTimer);
      t._templTimer = null;
      t._templRemaining = Math.max(0, (t._templDeadline || 0) - Date.now());
    }
  }

  // ----- create / dismiss ---------------------------------------------------

  var seq = 0;

  function build(opts) {
    var t = document.createElement("div");
    t.className = TOAST_CLASS;
    t.setAttribute("data-slot", "toast");
    t.setAttribute("role", "status");
    t.setAttribute("aria-atomic", "true");
    t.id = opts.id || "templ-toast-" + ++seq;
    if (opts.type) t.setAttribute("data-type", opts.type);
    if (opts.timeout) t.setAttribute("data-templ-timeout", String(opts.timeout));
    t.style.setProperty("--toast-swipe-movement-x", "0px");
    t.style.setProperty("--toast-swipe-movement-y", "0px");

    var content = document.createElement("div");
    content.className = CONTENT_CLASS;
    content.setAttribute("data-slot", "toast-content");

    var iconEl = document.createElement("span");
    iconEl.className = ICON_CLASS;
    iconEl.setAttribute("data-slot", "toast-icon");
    if (opts.type && ICONS[opts.type]) {
      iconEl.innerHTML = ICONS[opts.type];
    } else {
      iconEl.hidden = true;
    }
    content.appendChild(iconEl);

    var textWrap = document.createElement("div");
    textWrap.className = "flex min-w-0 flex-1 flex-col gap-1";
    var titleEl = document.createElement("div");
    titleEl.className = TITLE_CLASS;
    titleEl.setAttribute("data-slot", "toast-title");
    if (opts.title) titleEl.textContent = opts.title;
    else titleEl.hidden = true;
    var descEl = document.createElement("div");
    descEl.className = DESCRIPTION_CLASS;
    descEl.setAttribute("data-slot", "toast-description");
    if (opts.description) descEl.textContent = opts.description;
    else descEl.hidden = true;
    textWrap.appendChild(titleEl);
    textWrap.appendChild(descEl);
    content.appendChild(textWrap);

    if (opts.action) {
      var actionEl = document.createElement("button");
      actionEl.type = "button";
      actionEl.className = ACTION_CLASS;
      actionEl.setAttribute("data-slot", "toast-action");
      actionEl.textContent = opts.action.label || "";
      if (typeof opts.action.onClick === "function") {
        actionEl.addEventListener("click", opts.action.onClick);
      }
      content.appendChild(actionEl);
    }

    var closeEl = document.createElement("button");
    closeEl.type = "button";
    closeEl.className = CLOSE_CLASS;
    closeEl.setAttribute("data-slot", "toast-close");
    closeEl.setAttribute("aria-label", "Close toast");
    closeEl.innerHTML = ICONS.close;
    content.appendChild(closeEl);

    t.appendChild(content);
    return t;
  }

  function createToast(opts) {
    var vp = viewportOf(null);
    if (!vp) return null;
    var t = build(opts);
    t.setAttribute("data-starting-style", "");
    vp.appendChild(t);
    layout(vp);
    // Enter: flush the starting transform, then transition into place
    // (setTimeout instead of rAF so background tabs still settle).
    void t.offsetHeight;
    window.setTimeout(function () {
      t.removeAttribute("data-starting-style");
    }, 20);
    startTimer(t);
    return t;
  }

  function dismiss(t, direction) {
    if (!t || t.hasAttribute("data-ending-style")) return;
    stopTimer(t);
    var vp = viewportOf(t);
    t.setAttribute("data-ending-style", "");
    if (direction) t.setAttribute("data-swipe-direction", direction);
    window.setTimeout(function () {
      t.remove();
      if (vp) layout(vp);
    }, ENTER_EXIT_MS);
    if (vp) layout(vp);
  }

  // ----- expand on hover ----------------------------------------------------

  function setExpanded(vp, expanded) {
    if (vp.hasAttribute("data-expanded") === expanded) return;
    vp.toggleAttribute("data-expanded", expanded);
    toastsOf(vp).forEach(expanded ? stopTimer : startTimer);
    layout(vp);
  }

  document.addEventListener("pointerover", function (e) {
    if (!(e.target instanceof Element)) return;
    var vp = e.target.closest(VIEWPORT);
    if (vp) setExpanded(vp, true);
  });

  document.addEventListener("pointerout", function (e) {
    if (!(e.target instanceof Element)) return;
    var vp = e.target.closest(VIEWPORT);
    if (!vp) return;
    if (e.relatedTarget instanceof Element && e.relatedTarget.closest(VIEWPORT) === vp) return;
    setExpanded(vp, false);
  });

  // ----- close button -------------------------------------------------------

  document.addEventListener("click", function (e) {
    if (!(e.target instanceof Element)) return;
    var close = e.target.closest('[data-slot="toast-close"]');
    if (close) dismiss(close.closest('[data-slot="toast"]'));
  });

  // ----- swipe to dismiss (down and right, the bottom-right defaults) -------

  document.addEventListener("pointerdown", function (e) {
    if (!(e.target instanceof Element)) return;
    var t = e.target.closest('[data-slot="toast"]');
    if (!t || e.target.closest("button")) return;
    t._templSwipe = { x: e.clientX, y: e.clientY };
  });

  document.addEventListener("pointermove", function (e) {
    if (!(e.target instanceof Element)) return;
    var t = e.target.closest('[data-slot="toast"]');
    if (!t || !t._templSwipe) return;
    var dx = Math.max(0, e.clientX - t._templSwipe.x);
    var dy = Math.max(0, e.clientY - t._templSwipe.y);
    t.style.setProperty("--toast-swipe-movement-x", dx + "px");
    t.style.setProperty("--toast-swipe-movement-y", dy + "px");
  });

  document.addEventListener("pointerup", function (e) {
    if (!(e.target instanceof Element)) return;
    var t = e.target.closest('[data-slot="toast"]');
    if (!t || !t._templSwipe) return;
    var dx = Math.max(0, e.clientX - t._templSwipe.x);
    var dy = Math.max(0, e.clientY - t._templSwipe.y);
    t._templSwipe = null;
    if (dy >= SWIPE_THRESHOLD && dy >= dx) {
      dismiss(t, "down");
    } else if (dx >= SWIPE_THRESHOLD) {
      dismiss(t, "right");
    } else {
      t.style.setProperty("--toast-swipe-movement-x", "0px");
      t.style.setProperty("--toast-swipe-movement-y", "0px");
    }
  });

  // ----- the toast manager pendant: add, close, promise ---------------------

  function normalize(opts) {
    opts = Object.assign({}, opts);
    if (opts.actionProps) {
      opts.action = {
        label: opts.actionProps.children,
        onClick: opts.actionProps.onClick,
      };
    }
    return opts;
  }

  var api = {
    add: function (opts) {
      var t = createToast(normalize(opts || {}));
      return t ? t.id : null;
    },
    close: function (id) {
      if (id === undefined) {
        document.querySelectorAll('[data-slot="toast"]').forEach(function (t) {
          dismiss(t);
        });
        return;
      }
      var el = typeof id === "string" ? document.getElementById(id) : id;
      if (el) dismiss(el);
    },
    // toast.promise: a loading toast that morphs with the promise.
    promise: function (promise, opts) {
      opts = opts || {};
      var t = createToast(Object.assign({}, normalize(opts), { type: "loading", title: opts.loading || "Loading..." }));
      if (!t) return null;
      var p = typeof promise === "function" ? promise() : promise;
      function morph(type, title) {
        if (!t.isConnected) return;
        t.setAttribute("data-type", type);
        var iconEl = t.querySelector('[data-slot="toast-icon"]');
        if (iconEl) {
          iconEl.hidden = false;
          iconEl.innerHTML = ICONS[type] || "";
        }
        var titleEl = t.querySelector('[data-slot="toast-title"]');
        if (titleEl) {
          titleEl.hidden = false;
          titleEl.textContent = title;
        }
        var vp = viewportOf(t);
        if (vp) layout(vp);
        t._templRemaining = null;
        startTimer(t);
      }
      Promise.resolve(p)
        .then(function (data) {
          morph("success", typeof opts.success === "function" ? opts.success(data) : opts.success || "Done");
        })
        .catch(function (err) {
          morph("error", typeof opts.error === "function" ? opts.error(err) : opts.error || "Error");
        });
      return t.id;
    },
  };

  window.templ = window.templ || {};
  window.templ.toast = api;

  // ----- SSR/htmx adoption --------------------------------------------------

  function init() {
    document.querySelectorAll("[data-templ-toast]").forEach(function (stub) {
      var opts = {
        id: stub.id || undefined,
        title: stub.getAttribute("data-templ-title") || "",
        description: stub.getAttribute("data-templ-description") || "",
        type: stub.getAttribute("data-templ-type") || "",
        timeout: parseInt(stub.getAttribute("data-templ-timeout"), 10) || 0,
      };
      stub.remove();
      createToast(opts);
    });
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
