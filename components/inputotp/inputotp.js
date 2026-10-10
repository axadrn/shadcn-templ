(function () {
  "use strict";

  // Port of the input-otp library 1.4.2 that shadcn wraps: one real input
  // stretched invisibly over the container takes focus, typing and paste,
  // the slots mirror its value and selection.
  const ROOT = "[data-input-otp-container]";
  const INPUT = "[data-input-otp]";

  const isIOS = window.CSS?.supports?.("-webkit-touch-callout", "none");

  const PWM_BADGE_MARGIN_RIGHT = 18;
  const PWM_BADGE_SPACE_WIDTH_PX = 40;
  const PWM_BADGE_SPACE_WIDTH = `${PWM_BADGE_SPACE_WIDTH_PX}px`;
  const PASSWORD_MANAGERS_SELECTORS = [
    "[data-lastpass-icon-root]", // LastPass
    "com-1password-button", // 1Password
    "[data-dashlanecreated]", // Dashlane
    '[style$="2147483647 !important;"]', // Bitwarden
  ].join(",");

  const inputOf = (root) => root.querySelector(INPUT);

  // The component state React keeps in memory.
  function stateOf(input) {
    return input._templInputOTP;
  }

  // The value: the controlled one (data-templ-value) or the internal one.
  function valueOf(input) {
    const s = stateOf(input);
    return input.hasAttribute("data-templ-value") ? input.getAttribute("data-templ-value") : s.internalValue;
  }

  function regexpOf(input) {
    const pattern = input.getAttribute("pattern");
    return pattern ? new RegExp(pattern) : null;
  }

  function syncTimeouts(cb) {
    setTimeout(cb, 0); // For faster machines
    setTimeout(cb, 10);
    setTimeout(cb, 50);
  }

  // The render: the input mirrors the value and selection markers, every
  // slot its char, isActive and the fake caret.
  function render(input) {
    const s = stateOf(input);
    const root = input.closest(ROOT);
    const value = valueOf(input);
    if (input.value !== value) input.value = value;
    if (value.length === 0) input.setAttribute("data-input-otp-placeholder-shown", "true");
    else input.removeAttribute("data-input-otp-placeholder-shown");
    for (const [name, v] of [["data-input-otp-mss", s.mirrorSelectionStart], ["data-input-otp-mse", s.mirrorSelectionEnd]]) {
      if (v === null || v === undefined) input.removeAttribute(name);
      else input.setAttribute(name, String(v));
    }
    const willPushPWMBadge = s.hasPWMBadge && s.hasPWMBadgeSpace;
    input.style.width = willPushPWMBadge ? `calc(100% + ${PWM_BADGE_SPACE_WIDTH})` : "100%";
    input.style.clipPath = willPushPWMBadge ? `inset(0 ${PWM_BADGE_SPACE_WIDTH} 0 0)` : "";

    const mss = s.mirrorSelectionStart;
    const mse = s.mirrorSelectionEnd;
    root.querySelectorAll('[data-slot="input-otp-slot"]').forEach((slot) => {
      const slotIdx = parseInt(slot.getAttribute("data-templ-index"), 10);
      const isActive =
        s.isFocused &&
        mss !== null &&
        mse !== null &&
        ((mss === mse && slotIdx === mss) || (slotIdx >= mss && slotIdx < mse));
      const char = value[slotIdx] !== undefined ? value[slotIdx] : null;
      const hasFakeCaret = isActive && char === null;
      slot.setAttribute("data-active", String(isActive));
      const caret = slot.querySelector(":scope > .cn-input-otp-caret");
      if (slot.textContent !== (char ?? "") || !!caret !== hasFakeCaret) {
        slot.textContent = char ?? "";
        if (hasFakeCaret) {
          const el = document.createElement("div");
          el.className = "cn-input-otp-caret pointer-events-none absolute inset-0 flex items-center justify-center";
          const line = document.createElement("div");
          line.className = "cn-input-otp-caret-line";
          el.appendChild(line);
          slot.appendChild(el);
        }
      }
    });
  }

  function setMirror(input, start, end) {
    const s = stateOf(input);
    s.mirrorSelectionStart = start;
    s.mirrorSelectionEnd = end;
  }

  // useEffect([value, isFocused]): forcefully remove :autofill state and
  // update the selection state.
  function afterValueOrFocus(input) {
    syncTimeouts(() => {
      input.dispatchEvent(new Event("input"));
      const s = input.selectionStart;
      const e = input.selectionEnd;
      const dir = input.selectionDirection;
      if (s !== null && e !== null) {
        setMirror(input, s, e);
        stateOf(input).prev = [s, e, dir];
        render(input);
      }
    });
  }

  // onChange: the owner hears input-otp-change, the internal value follows.
  function onChange(input, newValue) {
    const before = valueOf(input);
    input.dispatchEvent(new CustomEvent("input-otp-change", { bubbles: true, detail: { value: newValue } }));
    stateOf(input).internalValue = newValue;
    render(input);
    if (valueOf(input) !== before) afterValueOrFocus(input);
  }

  function onDocumentSelectionChange(input) {
    const state = stateOf(input);
    if (document.activeElement !== input) {
      setMirror(input, null, null);
      render(input);
      return;
    }

    // Aliases
    const _s = input.selectionStart;
    const _e = input.selectionEnd;
    const _dir = input.selectionDirection;
    const _ml = input.maxLength;
    const _val = input.value;
    const _prev = state.prev;

    // Algorithm
    let start = -1;
    let end = -1;
    let direction;
    if (_val.length !== 0 && _s !== null && _e !== null) {
      const isSingleCaret = _s === _e;
      const isInsertMode = _s === _val.length && _val.length < _ml;

      if (isSingleCaret && !isInsertMode) {
        const c = _s;
        if (c === 0) {
          start = 0;
          end = 1;
          direction = "forward";
        } else if (c === _ml) {
          start = c - 1;
          end = c;
          direction = "backward";
        } else if (_ml > 1 && _val.length > 1) {
          let offset = 0;
          if (_prev[0] !== null && _prev[1] !== null) {
            direction = c < _prev[1] ? "backward" : "forward";
            const wasPreviouslyInserting = _prev[0] === _prev[1] && _prev[0] < _ml;
            if (direction === "backward" && !wasPreviouslyInserting) {
              offset = -1;
            }
          }

          start = offset + c;
          end = offset + c + 1;
        }
      }

      if (start !== -1 && end !== -1 && start !== end) {
        input.setSelectionRange(start, end, direction);
      }
    }

    // Finally, update the state
    const s = start !== -1 ? start : _s;
    const e = end !== -1 ? end : _e;
    const dir = direction ?? _dir;
    setMirror(input, s, e);
    render(input);
    // Store the previous selection value
    state.prev = [s, e, dir];
  }

  document.addEventListener(
    "selectionchange",
    () => document.querySelectorAll(INPUT).forEach((input) => stateOf(input) && onDocumentSelectionChange(input)),
    { capture: true },
  );

  // _changeListener
  document.addEventListener("input", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches(INPUT) || !stateOf(e.target)) return;
    const input = e.target;
    const value = valueOf(input);
    if (input.value === value) return;
    const maxLength = input.maxLength;
    const newValue = input.value.slice(0, maxLength);
    if (newValue.length > 0 && regexpOf(input) && !regexpOf(input).test(newValue)) {
      input.value = value;
      return;
    }
    const maybeHasDeleted = newValue.length < value.length;
    if (maybeHasDeleted) {
      // Since cutting/deleting text doesn't trigger
      // selectionchange event, we'll have to dispatch it manually.
      document.dispatchEvent(new Event("selectionchange"));
    }
    onChange(input, newValue);
  });

  // _focusListener
  document.addEventListener("focusin", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches(INPUT) || !stateOf(e.target)) return;
    const input = e.target;
    const start = Math.min(input.value.length, input.maxLength - 1);
    const end = input.value.length;
    input.setSelectionRange(start, end);
    setMirror(input, start, end);
    setFocused(input, true);
  });

  document.addEventListener("focusout", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches(INPUT) || !stateOf(e.target)) return;
    setFocused(e.target, false);
  });

  function setFocused(input, focused) {
    const s = stateOf(input);
    const changed = s.isFocused !== focused;
    s.isFocused = focused;
    render(input);
    if (!changed) return;
    afterValueOrFocus(input);
    if (focused) trackPWMBadgeWhileFocused(input);
  }

  // Fix iOS pasting
  document.addEventListener("paste", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches(INPUT) || !stateOf(e.target)) return;
    const input = e.target;
    if (!isIOS || !e.clipboardData) return;

    const content = e.clipboardData.getData("text/plain");
    e.preventDefault();

    const value = valueOf(input);
    const maxLength = input.maxLength;
    const start = input.selectionStart;
    const end = input.selectionEnd;

    const isReplacing = start !== end;

    const newValueUncapped = isReplacing
      ? value.slice(0, start) + content + value.slice(end) // Replacing
      : value.slice(0, start) + content + value.slice(start); // Inserting
    const newValue = newValueUncapped.slice(0, maxLength);

    if (newValue.length > 0 && regexpOf(input) && !regexpOf(input).test(newValue)) {
      return;
    }

    input.value = newValue;
    onChange(input, newValue);

    const _start = Math.min(newValue.length, maxLength - 1);
    const _end = newValue.length;

    input.setSelectionRange(_start, _end);
    setMirror(input, _start, _end);
    render(input);
  });

  // usePasswordManagerBadge: push a password manager badge outside the input.
  function trackPWMBadge(input) {
    const s = stateOf(input);
    const container = input.closest(ROOT);
    if (!container || s.pwmDone) return;

    // Get the top right-center point of the container.
    // That is usually where most password managers place their badge.
    const rightCornerX = container.getBoundingClientRect().left + container.offsetWidth;
    const centereredY = container.getBoundingClientRect().top + container.offsetHeight / 2;
    const x = rightCornerX - PWM_BADGE_MARGIN_RIGHT;
    const y = centereredY;

    // Do an extra search to check for famous password managers
    const pmws = document.querySelectorAll(PASSWORD_MANAGERS_SELECTORS);

    // If no password manager is automatically detect,
    // we'll try to dispatch document.elementFromPoint
    // to identify badges
    if (pmws.length === 0) {
      const maybeBadgeEl = document.elementFromPoint(x, y);

      // If the found element is the input itself,
      // then we assume it's not a password manager badge.
      // We are not sure. Most times that means there isn't a badge.
      if (maybeBadgeEl === container) return;
    }

    s.hasPWMBadge = true;
    s.pwmDone = true;
    render(input);
  }

  function trackPWMBadgeWhileFocused(input) {
    const s = stateOf(input);
    s.pwmTimeouts.forEach(clearTimeout);
    s.pwmTimeouts = [
      setTimeout(() => trackPWMBadge(input), 0),
      setTimeout(() => trackPWMBadge(input), 2000),
      setTimeout(() => trackPWMBadge(input), 5000),
      setTimeout(() => (s.pwmDone = true), 6000),
    ];
  }

  function insertStyles() {
    if (document.getElementById("input-otp-style")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "input-otp-style";
    document.head.appendChild(styleEl);
    if (!styleEl.sheet) return;
    const autofillStyles =
      "background: transparent !important; color: transparent !important; border-color: transparent !important; opacity: 0 !important; box-shadow: none !important; -webkit-box-shadow: none !important; -webkit-text-fill-color: transparent !important;";
    [
      "[data-input-otp]::selection { background: transparent !important; color: transparent !important; }",
      `[data-input-otp]:autofill { ${autofillStyles} }`,
      `[data-input-otp]:-webkit-autofill { ${autofillStyles} }`,
      // iOS
      "@supports (-webkit-touch-callout: none) { [data-input-otp] { letter-spacing: -.6em !important; font-weight: 100 !important; font-stretch: ultra-condensed; font-optical-sizing: none !important; left: -1px !important; right: 1px !important; } }",
      // PWM badges
      "[data-input-otp] + * { pointer-events: all !important; }",
    ].forEach((rule) => {
      try {
        styleEl.sheet.insertRule(rule);
      } catch {
        console.error("input-otp could not insert CSS rule:", rule);
      }
    });
  }

  // The NOSCRIPT_CSS_FALLBACK sits in a <noscript>. HTML parsed with scripting
  // off (an htmx swap, a history restore) turns its <style> into a live one,
  // and its !important rules would paint the real input. With JS running the
  // fallback has no job, so it goes back to the inert text it is on first load.
  function inertNoscript(root) {
    const noscript = root.previousElementSibling;
    if (noscript?.tagName === "NOSCRIPT" && noscript.firstElementChild) noscript.textContent = noscript.innerHTML;
  }

  function init(root) {
    const input = inputOf(root);
    if (!input) return;
    input._templInputOTP = {
      internalValue: input.hasAttribute("data-templ-value") ? "" : input.getAttribute("value") || "",
      prev: [input.selectionStart, input.selectionEnd, input.selectionDirection],
      mirrorSelectionStart: null,
      mirrorSelectionEnd: null,
      isFocused: false,
      hasPWMBadge: false,
      hasPWMBadgeSpace: false,
      pwmDone: false,
      pwmTimeouts: [],
    };
    const s = stateOf(input);

    // Sync input value
    if (input.value !== valueOf(input)) onChange(input, input.value);

    onDocumentSelectionChange(input);
    if (document.activeElement === input) setFocused(input, true);

    insertStyles();
    inertNoscript(root);

    // Track root height
    const updateRootHeight = () => root.style.setProperty("--root-height", `${input.clientHeight}px`);
    updateRootHeight();
    s.resizeObserver = new ResizeObserver(updateRootHeight);
    s.resizeObserver.observe(input);

    // Check if the PWM area is 100% visible
    const checkHasSpace = () => {
      const hasSpace = window.innerWidth - root.getBoundingClientRect().right >= PWM_BADGE_SPACE_WIDTH_PX;
      if (hasSpace === s.hasPWMBadgeSpace) return;
      s.hasPWMBadgeSpace = hasSpace;
      render(input);
    };
    checkHasSpace();
    s.pwmInterval = setInterval(checkHasSpace, 1000);

    afterValueOrFocus(input);
  }

  function destroy(root) {
    const input = inputOf(root);
    const s = input && stateOf(input);
    if (!s) return;
    s.resizeObserver.disconnect();
    clearInterval(s.pwmInterval);
    s.pwmTimeouts.forEach(clearTimeout);
  }

  window.templ.lifecycle.register(ROOT, { init, destroy });

  // The public API for an owner that controls the value, the pendant of
  // setValue in onChange.
  window.templ = window.templ || {};
  window.templ.inputOTP = {
    setValue(input, value) {
      if (input.hasAttribute("data-templ-value")) input.setAttribute("data-templ-value", value);
      else stateOf(input).internalValue = value;
      render(input);
    },
  };
})();
