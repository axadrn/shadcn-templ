/* /create page controller: 1:1 port of shadcn's create page client state
   (shadcn@4.16.0, apps/v4/app/(app)/(create)).

     lib/search-params.ts          -> params model, ?preset= URL codec, normalization
     lib/preset-query.ts           -> resolvePresetOverrides
     lib/parse-preset-input.ts     -> parsePresetInput
     hooks/use-history.tsx         -> undo/redo stack of settled preset codes
     hooks/use-locks.tsx           -> in-memory lock set (affects shuffle only)
     hooks/use-random.tsx          -> curated SHUFFLE_PRESETS shuffle
     hooks/use-reset.tsx           -> reset to the style's preset
     hooks/use-open-preset.tsx     -> O key + open preset dialog/drawer
     hooks/use-theme-toggle.tsx    -> D key light/dark via themeUtils
     hooks/use-action-menu.ts      -> Cmd/Ctrl+P command dialog
     components/preview.tsx        -> iframe param sync + forward re-dispatch
     components/preview-override.tsx -> 50ms trailing hover previews
     components/preset-handler.tsx -> ?preset=random / invalid preset handling
     components/*-picker.tsx       -> picker behavior on the SSRd DOM
     components/welcome-dialog.tsx -> first-visit dialog

   Data comes from window.templPreset (codec), window.templCreateConfig and
   window.templCreateThemes. The DOM contract is data-templ-create-* attributes,
   SSRd by internal/ui/pages/create.templ. */
(function () {
  "use strict";

  if (window.__templCreateInitialized) return;
  window.__templCreateInitialized = true;

  var MAC_REGEX = /Mac|iPhone|iPad|iPod/;
  var PRESET_FLAG_PATTERN = /^--preset\b\s+(.+)$/i;
  var PREVIEW_OVERRIDE_DEBOUNCE_MS = 50;
  // Our own persistence carries our name; only the key differs from the
  // reference ("shadcn-create-welcome-dialog").
  var WELCOME_STORAGE_KEY = "shadcn-templ-create-welcome-dialog";
  var DEFAULT_ITEM = "preview-02";

  // lib/search-params.ts DESIGN_SYSTEM_KEYS.
  var DESIGN_SYSTEM_KEYS = [
    "style",
    "baseColor",
    "theme",
    "chartColor",
    "iconLibrary",
    "font",
    "fontHeading",
    "radius",
    "menuAccent",
    "menuColor",
  ];

  // menu-picker.tsx MENU_OPTIONS.
  var MENU_OPTIONS = [
    { value: "default", label: "Default / Solid" },
    { value: "default-translucent", label: "Default / Translucent" },
    { value: "inverted", label: "Inverted / Solid" },
    { value: "inverted-translucent", label: "Inverted / Translucent" },
  ];

  // picker.tsx PickerRadioItem classes; JS-rebuilt items (theme/chart lists)
  // must mirror the SSRd markup in create.templ exactly.
  var RADIO_ITEM_CLASS =
    "relative flex cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm font-medium outline-hidden select-none **:text-neutral-100 focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
  var SEPARATOR_CLASS = "-mx-1.5 my-1.5 h-px bg-neutral-600 dark:bg-neutral-700";
  var CHECK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 pointer-coarse:size-5"><path d="M20 6 9 17l-5-5"></path></svg>';

  var preset = window.templPreset;
  var cfg = window.templCreateConfig;

  var params = null;
  var overrideValue = null; // hover preview, never committed (preview-override.tsx)
  var overrideTimer = null;
  var lastSentParams = null;
  var locks = new Set(); // use-locks.tsx, shuffle only
  var lastSolidMenuAccent = "subtle"; // menu-picker.tsx lastSolidMenuAccentRef
  var openPickerParam = null;
  var renderedBaseColor = null;
  var copied = false;
  var copiedTimer = 0;
  // project-form.tsx state: activeTab, applyMode and the copiedTarget flash.
  var activeTab = "new-project";
  var applyMode = "full";
  var copiedTarget = null;
  var copiedTargetTimer = 0;
  var isMac = MAC_REGEX.test(navigator.platform || navigator.userAgent);

  // use-history.tsx: entries of settled preset codes; the first entry is ""
  // (no preset in the URL).
  var historyEntries = [""];
  var historyIndex = 0;
  var historyMaxIndex = 0;

  // ----- config lookups -------------------------------------------------------

  function themes() {
    return window.templCreateThemes || [];
  }

  function getTheme(name) {
    return themes().find(function (t) {
      return t.name === name;
    });
  }

  function isBaseColorName(name) {
    return cfg.BASE_COLORS.indexOf(name) !== -1;
  }

  function fontOption(value) {
    return cfg.FONTS.find(function (f) {
      return f.value === value;
    });
  }

  function fontFamilyOf(option) {
    return option ? "var(" + option.previewVariable + "), " + option.family : "";
  }

  function validValues(key) {
    switch (key) {
      case "style":
        return cfg.STYLES.map(function (s) {
          return s.name;
        });
      case "baseColor":
        return cfg.BASE_COLORS;
      case "theme":
      case "chartColor":
        return themes().map(function (t) {
          return t.name;
        });
      case "iconLibrary":
        return preset.PRESET_ICON_LIBRARIES;
      case "font":
        return cfg.FONTS.map(function (f) {
          return f.value;
        });
      case "fontHeading":
        return ["inherit"].concat(
          cfg.FONTS.map(function (f) {
            return f.value;
          })
        );
      case "radius":
        return cfg.RADII.map(function (r) {
          return r.name;
        });
      case "menuAccent":
        return cfg.MENU_ACCENTS.map(function (a) {
          return a.value;
        });
      case "menuColor":
        return cfg.MENU_COLORS.map(function (m) {
          return m.value;
        });
    }
    return [];
  }

  // ----- normalization (lib/search-params.ts) --------------------------------

  function isTranslucentMenuColor(menuColor) {
    return menuColor === "default-translucent" || menuColor === "inverted-translucent";
  }

  function normalizeFontHeading(font, fontHeading) {
    // Persist "same as body" as an explicit inherit sentinel so the body font
    // can change later without freezing headings to a concrete previous value.
    return fontHeading === font ? "inherit" : fontHeading;
  }

  function normalizePartialDesignSystemParams(updates) {
    if (updates.menuAccent === "bold" && isTranslucentMenuColor(updates.menuColor)) {
      return Object.assign({}, updates, { menuAccent: "subtle" });
    }
    return updates;
  }

  function normalizeDesignSystemParams(p) {
    var result = Object.assign({}, p, {
      fontHeading: normalizeFontHeading(p.font, p.fontHeading),
    });

    // Validate theme and chartColor against baseColor.
    if (result.baseColor) {
      var available = cfg.getThemesForBaseColor(result.baseColor);
      var themeValid = available.some(function (t) {
        return t.name === result.theme;
      });
      var chartColorValid = available.some(function (t) {
        return t.name === result.chartColor;
      });
      if (!themeValid || !chartColorValid) {
        var fallback = available[0] ? available[0].name : result.baseColor;
        if (!themeValid) result.theme = fallback;
        if (!chartColorValid) result.chartColor = fallback;
      }
    }

    if (result.menuAccent === "bold" && isTranslucentMenuColor(result.menuColor)) {
      result.menuAccent = "subtle";
    }

    // design-system-provider.tsx style constraints.
    if (result.style === "lyra" || (result.style === "sera" && result.radius !== "none")) {
      result.radius = "none";
    } else if (result.style === "rhea" && result.radius === "large") {
      result.radius = "default";
    }

    return result;
  }

  function getPresetCode(p) {
    var config = {};
    for (var i = 0; i < DESIGN_SYSTEM_KEYS.length; i++) {
      config[DESIGN_SYSTEM_KEYS[i]] = p[DESIGN_SYSTEM_KEYS[i]];
    }
    return preset.encodePreset(config);
  }

  // lib/preset-query.ts resolvePresetOverrides: explicit ?fontHeading/
  // ?chartColor query params override the decoded preset; v1 presets fall
  // back to the colored theme the base-color themes borrowed charts from.
  function resolvePresetOverrides(sp, decoded) {
    var chartFallback =
      decoded.chartColor || preset.V1_CHART_COLOR_MAP[decoded.theme] || decoded.theme;
    return {
      fontHeading: sp.has("fontHeading")
        ? sp.get("fontHeading") || decoded.fontHeading
        : decoded.fontHeading,
      chartColor: sp.has("chartColor") ? sp.get("chartColor") || chartFallback : chartFallback,
    };
  }

  // ----- url <-> params -------------------------------------------------------

  function readParams() {
    var sp = new URLSearchParams(window.location.search);
    var passthrough = {
      preset: sp.get("preset") || "",
      item: sp.get("item") || DEFAULT_ITEM,
      rtl: sp.get("rtl") === "true",
      pointer: sp.get("pointer") === "true",
      size: sp.has("size") ? parseInt(sp.get("size"), 10) || 100 : 100,
      custom: sp.get("custom") === "true",
    };

    if (passthrough.preset && preset.isPresetCode(passthrough.preset)) {
      var decoded = preset.decodePreset(passthrough.preset);
      if (decoded) {
        var overrides = resolvePresetOverrides(sp, decoded);
        return normalizeDesignSystemParams(
          Object.assign({}, decoded, overrides, passthrough)
        );
      }
    }

    var raw = {};
    for (var i = 0; i < DESIGN_SYSTEM_KEYS.length; i++) {
      var key = DESIGN_SYSTEM_KEYS[i];
      var value = sp.get(key);
      raw[key] =
        value && validValues(key).indexOf(value) !== -1 ? value : cfg.DEFAULT_CONFIG[key];
    }
    return normalizeDesignSystemParams(Object.assign(raw, passthrough));
  }

  // buildPresetUrlUpdate: the URL carries only ?preset (+ item and the
  // passthrough params); explicit design keys are cleared.
  function writeURL(mode) {
    var url = new URL(window.location.href);
    var sp = url.searchParams;
    params.preset = getPresetCode(params);
    sp.set("preset", params.preset);
    for (var i = 0; i < DESIGN_SYSTEM_KEYS.length; i++) {
      sp.delete(DESIGN_SYSTEM_KEYS[i]);
    }
    if (params.item !== DEFAULT_ITEM) sp.set("item", params.item);
    else sp.delete("item");
    if (params.rtl) sp.set("rtl", "true");
    else sp.delete("rtl");
    if (params.pointer) sp.set("pointer", "true");
    else sp.delete("pointer");
    if (params.size !== 100) sp.set("size", String(params.size));
    else sp.delete("size");
    if (params.custom) sp.set("custom", "true");
    else sp.delete("custom");
    if (mode === "replace") history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  }

  function setParams(updates, opts) {
    opts = opts || {};
    var resolved = normalizePartialDesignSystemParams(updates);
    params = normalizeDesignSystemParams(Object.assign({}, params, resolved));
    writeURL(opts.history || "push");
    recordHistory();
    sendParams();
    render();
  }

  // ----- undo/redo (use-history.tsx) -----------------------------------------

  function urlPreset() {
    return new URLSearchParams(window.location.search).get("preset") || "";
  }

  function recordHistory() {
    var code = urlPreset();
    if (code === historyEntries[historyIndex]) return;
    historyEntries = historyEntries.slice(0, historyIndex + 1);
    historyEntries.push(code);
    historyIndex = historyEntries.length - 1;
    historyMaxIndex = historyIndex;
    renderHistoryItems();
  }

  function canGoBack() {
    return historyIndex > 0;
  }

  function canGoForward() {
    return historyIndex < historyMaxIndex;
  }

  function applyHistoryEntry(code) {
    var url = new URL(window.location.href);
    if (code) url.searchParams.set("preset", code);
    else url.searchParams.delete("preset");
    history.replaceState(null, "", url);
    params = readParams();
    sendParams();
    render();
    renderHistoryItems();
  }

  function goBack() {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    applyHistoryEntry(historyEntries[historyIndex]);
  }

  function goForward() {
    if (historyIndex >= historyMaxIndex) return;
    historyIndex += 1;
    applyHistoryEntry(historyEntries[historyIndex]);
  }

  // ----- preview iframe sync (preview.tsx + use-iframe-sync) -----------------

  function frameEl() {
    return document.querySelector("[data-templ-create-preview]");
  }

  function isSameParams(a, b) {
    if (!a) return false;
    return Object.keys(b).every(function (key) {
      return a[key] === b[key];
    });
  }

  function mergedParams() {
    return overrideValue ? Object.assign({}, params, overrideValue) : params;
  }

  function sendParams() {
    var frame = frameEl();
    if (!frame || !frame.contentWindow) return;
    var merged = mergedParams();
    // Skip content-identical re-sends — each message triggers a full param
    // sync in the iframe.
    if (isSameParams(lastSentParams, merged)) return;
    frame.contentWindow.postMessage(
      { type: "design-system-params", data: merged },
      window.location.origin
    );
    lastSentParams = merged;
  }

  function iframeSrc() {
    var url = new URL("/create/preview", window.location.origin);
    var sp = url.searchParams;
    if (params.item !== DEFAULT_ITEM) sp.set("item", params.item);
    sp.set("preset", getPresetCode(params));
    if (params.rtl) sp.set("rtl", "true");
    if (params.pointer) sp.set("pointer", "true");
    if (params.size !== 100) sp.set("size", String(params.size));
    if (params.custom) sp.set("custom", "true");
    return url.pathname + url.search;
  }

  function setItem(next) {
    if (!next || params.item === next) return;
    params.item = next;
    writeURL("push");
    var frame = frameEl();
    if (frame) {
      lastSentParams = null;
      frame.src = iframeSrc();
    }
    render();
  }

  // ----- hover previews (preview-override.tsx) --------------------------------

  function isSameOverride(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    var aKeys = Object.keys(a);
    var bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every(function (key) {
        return a[key] === b[key];
      })
    );
  }

  // Previews apply when the pointer settles: every call re-arms the trailing
  // timer, so nothing applies while the cursor is in motion. Clears are never
  // debounced.
  function setOverride(next) {
    if (overrideTimer !== null) clearTimeout(overrideTimer);
    overrideTimer = setTimeout(function () {
      overrideTimer = null;
      if (isSameOverride(overrideValue, next)) return;
      overrideValue = next;
      sendParams();
    }, PREVIEW_OVERRIDE_DEBOUNCE_MS);
  }

  function clearOverride() {
    if (overrideTimer !== null) {
      clearTimeout(overrideTimer);
      overrideTimer = null;
    }
    if (overrideValue === null) return;
    overrideValue = null;
    sendParams();
  }

  // ----- derived state --------------------------------------------------------

  function isRadiusLocked(p) {
    return p.style === "lyra" || p.style === "sera";
  }

  function isDark() {
    return document.documentElement.classList.contains("dark");
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function menuColorChoice(p) {
    return p.menuColor === "inverted" || p.menuColor === "inverted-translucent"
      ? "inverted"
      : "default";
  }

  function menuSurfaceChoice(p) {
    return isTranslucentMenuColor(p.menuColor) ? "translucent" : "solid";
  }

  function menuColorValue(color, translucent) {
    if (color === "default") return translucent ? "default-translucent" : "default";
    return translucent ? "inverted-translucent" : "inverted";
  }

  // menu-picker.tsx setColor/setSurface, incl. the menuAccent coupling.
  function setColor(color) {
    var next = menuColorValue(color, menuSurfaceChoice(params) === "translucent");
    var updates = { menuColor: next };
    if (isTranslucentMenuColor(next)) updates.menuAccent = "subtle";
    setParams(updates);
  }

  function setSurface(choice) {
    var translucent = choice === "translucent";
    var next = menuColorValue(menuColorChoice(params), translucent);
    setParams({
      menuColor: next,
      menuAccent: translucent ? "subtle" : lastSolidMenuAccent,
    });
  }

  // Hover previews mirror setColor/setSurface, including the menuAccent
  // coupling, so the previewed state matches what a click would commit.
  function previewColor(color) {
    var next = menuColorValue(color, menuSurfaceChoice(params) === "translucent");
    var override = { menuColor: next };
    if (isTranslucentMenuColor(next)) override.menuAccent = "subtle";
    setOverride(override);
  }

  function previewSurface(choice) {
    var translucent = choice === "translucent";
    setOverride({
      menuColor: menuColorValue(menuColorChoice(params), translucent),
      menuAccent: translucent ? "subtle" : lastSolidMenuAccent,
    });
  }

  // Radio groups: current value, commit and hover preview per group.
  var GROUPS = {
    style: {
      value: function (p) {
        return p.style;
      },
      commit: function (v) {
        setParams({ style: v });
      },
      preview: function (v) {
        setOverride({ style: v });
      },
    },
    baseColor: {
      value: function (p) {
        return p.baseColor;
      },
      commit: function (v) {
        setParams({ baseColor: v });
      },
      preview: function (v) {
        setOverride({ baseColor: v });
      },
    },
    theme: {
      value: function (p) {
        return p.theme;
      },
      commit: function (v) {
        setParams({ theme: v });
      },
      preview: function (v) {
        setOverride({ theme: v });
      },
    },
    chartColor: {
      value: function (p) {
        return p.chartColor;
      },
      commit: function (v) {
        setParams({ chartColor: v });
      },
      preview: function (v) {
        setOverride({ chartColor: v });
      },
    },
    fontHeading: {
      value: function (p) {
        return p.fontHeading;
      },
      commit: function (v) {
        setParams({ fontHeading: v });
      },
      preview: function (v) {
        setOverride({ fontHeading: v });
      },
    },
    font: {
      value: function (p) {
        return p.font;
      },
      commit: function (v) {
        setParams({ font: v });
      },
      preview: function (v) {
        setOverride({ font: v });
      },
    },
    iconLibrary: {
      value: function (p) {
        return p.iconLibrary;
      },
      commit: function (v) {
        setParams({ iconLibrary: v });
      },
      preview: function (v) {
        setOverride({ iconLibrary: v });
      },
    },
    radius: {
      value: function (p) {
        return isRadiusLocked(p) ? "none" : p.radius;
      },
      commit: function (v) {
        if (isRadiusLocked(params)) return;
        setParams({ radius: v });
      },
      preview: function (v) {
        if (isRadiusLocked(params)) return;
        setOverride({ radius: v });
      },
    },
    menuAccent: {
      value: function (p) {
        return p.menuAccent;
      },
      commit: function (v) {
        setParams({ menuAccent: v });
      },
      preview: function (v) {
        setOverride({ menuAccent: v });
      },
    },
    menuColorColor: {
      value: menuColorChoice,
      commit: setColor,
      preview: previewColor,
    },
    menuColorSurface: {
      value: menuSurfaceChoice,
      commit: setSurface,
      preview: previewSurface,
    },
  };

  // ----- shuffle (use-random.tsx) --------------------------------------------

  function randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  // Picks a random preset from the curated list instead of true random.
  // Locked params are preserved over the decoded preset values.
  function randomize() {
    var currentCode = getPresetCode(params);
    var availableCodes = cfg.SHUFFLE_PRESETS.filter(function (code) {
      return code !== currentCode;
    });
    var decoded = preset.decodePreset(
      randomItem(availableCodes.length > 0 ? availableCodes : cfg.SHUFFLE_PRESETS)
    );
    if (!decoded) return;

    var next = {};
    for (var i = 0; i < DESIGN_SYSTEM_KEYS.length; i++) {
      var key = DESIGN_SYSTEM_KEYS[i];
      if (locks.has(key)) {
        next[key] = params[key];
      } else if (key === "chartColor") {
        next[key] = decoded.chartColor || decoded.theme;
      } else {
        next[key] = decoded[key];
      }
    }
    setParams(next);
  }

  // ----- reset (use-reset.tsx) -----------------------------------------------

  function reset() {
    var entry =
      cfg.PRESETS.find(function (p) {
        return p.base === "base" && p.style === params.style;
      }) || cfg.DEFAULT_CONFIG;
    setParams({
      style: params.style,
      baseColor: entry.baseColor,
      theme: entry.theme,
      chartColor: entry.chartColor,
      iconLibrary: entry.iconLibrary,
      font: entry.font,
      fontHeading: entry.fontHeading,
      menuAccent: entry.menuAccent,
      menuColor: entry.menuColor,
      radius: entry.radius,
    });
  }

  function confirmReset() {
    reset();
    window.templ.dialog.close("create-reset-dialog");
  }

  // ----- open preset (open-preset.tsx + lib/parse-preset-input.ts) -----------

  function parsePresetInput(value) {
    var input = value.trim();
    if (!input) return null;
    var match = input.match(PRESET_FLAG_PATTERN);
    var code = match && match[1] ? match[1].trim() : input;
    return preset.isPresetCode(code) ? code : null;
  }

  function openPresetDialog() {
    // open-preset.tsx clears the input when the dialog closes; clearing on
    // open keeps reopen state fresh without a drawer close event.
    document.querySelectorAll("[data-templ-create-preset-form]").forEach(function (form) {
      var inputEl = form.querySelector("[data-templ-create-preset-input]");
      if (inputEl) inputEl.value = "";
      updatePresetForm(form);
    });
    if (isMobileViewport()) window.templ.drawer.open("create-open-preset-drawer");
    else window.templ.dialog.open("create-open-preset-dialog");
  }

  function applyPresetCode(code) {
    var url = new URL(window.location.href);
    url.searchParams.set("preset", code);
    history.pushState(null, "", url);
    params = readParams();
    recordHistory();
    sendParams();
    render();
  }

  function updatePresetForm(form) {
    var inputEl = form.querySelector("[data-templ-create-preset-input]");
    var submit = form.querySelector("[data-templ-create-preset-submit]");
    var fieldRoot = form.querySelector("[data-templ-create-preset-field]");
    if (!inputEl) return;
    var code = parsePresetInput(inputEl.value);
    var isInvalid = inputEl.value.trim().length > 0 && code === null;
    inputEl.setAttribute("aria-invalid", String(isInvalid));
    if (fieldRoot) {
      if (isInvalid) fieldRoot.setAttribute("data-invalid", "true");
      else fieldRoot.removeAttribute("data-invalid");
    }
    if (submit) submit.disabled = !code;
  }

  function submitPresetForm(form) {
    var inputEl = form.querySelector("[data-templ-create-preset-input]");
    if (!inputEl) return;
    var code = parsePresetInput(inputEl.value);
    if (!code) return;
    applyPresetCode(code);
    inputEl.value = "";
    updatePresetForm(form);
    window.templ.dialog.close("create-open-preset-dialog");
    window.templ.drawer.close("create-open-preset-drawer");
  }

  // ----- get code dialog (project-form.tsx) ----------------------------------

  // The command builders. Our pendants of the shadcn init/apply commands have
  // no package manager variants (the CLI installs via go install) and one
  // template (-t templ scaffolds the runnable project like their -t next).
  function initCommand() {
    return "shadcn-templ init -t templ --preset " + getPresetCode(params);
  }

  function applyCommand() {
    var onlyFlag =
      applyMode === "theme" ? " --only theme" : applyMode === "font" ? " --only font" : "";
    return "shadcn-templ apply --preset " + getPresetCode(params) + onlyFlag;
  }

  function copyTargetText(target) {
    if (target === "command") return initCommand();
    if (target === "apply") return applyCommand();
    return generateThemeCss();
  }

  // handleCopy/handleCopyApply/handleCopyTheme: copy and flash the matching
  // buttons for 2s (the copiedTarget timeout effect).
  function copyProjectTarget(target) {
    var text = copyTargetText(target);
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
    copiedTarget = target;
    clearTimeout(copiedTargetTimer);
    copiedTargetTimer = setTimeout(function () {
      copiedTarget = null;
      renderProjectForm();
    }, 2000);
    renderProjectForm();
  }

  function renderProjectForm() {
    // ToggleGroup value={[activeTab]}: the group is controlled, so this is
    // the single source of truth for its pressed state.
    var group = document.querySelector("[data-templ-create-tabs]");
    if (group) {
      group.querySelectorAll("[data-slot=toggle-group-item]").forEach(function (toggle) {
        var on = toggle.getAttribute("data-templ-value") === activeTab;
        toggle.toggleAttribute("data-pressed", on);
        toggle.setAttribute("aria-pressed", String(on));
      });
    }
    document.querySelectorAll("[data-templ-create-tab]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-templ-create-tab") !== activeTab;
    });

    // Live commands and the theme CSS.
    document.querySelectorAll('[data-templ-create-command="init"]').forEach(function (el) {
      el.textContent = initCommand();
    });
    document.querySelectorAll('[data-templ-create-command="apply"]').forEach(function (el) {
      el.textContent = applyCommand();
    });
    var css = document.querySelector("[data-templ-create-css]");
    if (css) css.textContent = generateThemeCss();

    // Copy flashes: icon buttons swap Copy -> Check, footer buttons swap
    // their label to "Copied".
    document.querySelectorAll("[data-templ-create-copy-target]").forEach(function (button) {
      var isCopied = copiedTarget === button.getAttribute("data-templ-create-copy-target");
      var copyIcon = button.querySelector('[data-templ-create-copy-icon="copy"]');
      var checkIcon = button.querySelector('[data-templ-create-copy-icon="check"]');
      if (copyIcon) copyIcon.hidden = isCopied;
      if (checkIcon) checkIcon.hidden = !isCopied;
      var idleLabel = button.getAttribute("data-templ-create-copy-label");
      if (idleLabel) button.textContent = isCopied ? "Copied" : idleLabel;
    });
  }

  // ----- theme css export (project-form.tsx theme tab) -----------------------

  // registry/config.ts buildRegistryTheme.
  function buildRegistryThemeVars(config) {
    var baseColor = getTheme(config.baseColor);
    var theme = getTheme(config.theme);
    if (!baseColor || !theme) return null;

    var light = Object.assign({}, baseColor.cssVars.light, theme.cssVars.light);
    var dark = Object.assign({}, baseColor.cssVars.dark, theme.cssVars.dark);

    var chartTheme = getTheme(config.chartColor);
    if (chartTheme) {
      for (var i = 1; i <= 5; i++) {
        var key = "chart-" + i;
        if (chartTheme.cssVars.light && chartTheme.cssVars.light[key]) {
          light[key] = chartTheme.cssVars.light[key];
        }
        if (chartTheme.cssVars.dark && chartTheme.cssVars.dark[key]) {
          dark[key] = chartTheme.cssVars.dark[key];
        }
      }
    }

    if (config.menuAccent === "bold") {
      light.accent = light.primary;
      light["accent-foreground"] = light["primary-foreground"];
      dark.accent = dark.primary;
      dark["accent-foreground"] = dark["primary-foreground"];
    }

    if (config.radius && config.radius !== "default") {
      var radius = cfg.RADII.find(function (r) {
        return r.name === config.radius;
      });
      if (radius && radius.value) light.radius = radius.value;
    }

    return { light: light, dark: dark };
  }

  function formatCssVarsRule(selector, vars) {
    var declarations = Object.keys(vars || {})
      .map(function (key) {
        return "  --" + key + ": " + vars[key] + ";";
      })
      .join("\n");
    return selector + " {\n" + declarations + "\n}";
  }

  // buildThemeForPreset: the resolved radius always lands in :root.
  function generateThemeCss() {
    var radius = isRadiusLocked(params) ? "none" : params.radius;
    var config = Object.assign({}, params, { radius: radius });
    var vars = buildRegistryThemeVars(config);
    if (!vars) return "";
    var entry = cfg.RADII.find(function (r) {
      return r.name === radius;
    });
    var radiusValue =
      radius === "default"
        ? vars.light.radius || "0.625rem"
        : (entry && entry.value) || vars.light.radius;
    var light = Object.assign({}, vars.light);
    if (radiusValue) light.radius = radiusValue;
    return formatCssVarsRule(":root", light) + "\n\n" + formatCssVarsRule(".dark", vars.dark);
  }

  // ----- copy preset (copy-preset.tsx) ---------------------------------------

  function copyPresetCommand() {
    var command = "--preset " + getPresetCode(params);
    if (navigator.clipboard) navigator.clipboard.writeText(command).catch(function () {});
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(function () {
      copied = false;
      render();
    }, 2000);
    render();
  }

  // ----- picker popups (picker.tsx behavior) ---------------------------------

  function contentFor(param) {
    return document.querySelector('[data-templ-create-content="' + param + '"]');
  }

  function triggerFor(param) {
    return document.querySelector('[data-templ-create-trigger="' + param + '"]');
  }

  function customizerCard() {
    return document.querySelector('[data-templ-create] [data-slot="card"]');
  }

  function shieldEl() {
    return document.querySelector("[data-templ-create-shield]");
  }

  function enabledItems(content) {
    return Array.from(
      content.querySelectorAll("[data-templ-create-item], [data-templ-create-action]")
    ).filter(function (el) {
      return !el.hasAttribute("data-disabled");
    });
  }

  // PickerContent positioning: desktop side="right" align="start"
  // sideOffset=20 on the trigger (main menu alignOffset=-8); mobile anchors
  // the popup above the customizer card, centered (side="top" align="center").
  function positionPopup(param, trigger, content) {
    content.style.setProperty("--available-width", window.innerWidth + "px");
    content.style.setProperty(
      "--available-height",
      Math.max(0, window.innerHeight - 16) + "px"
    );
    content.style.setProperty("--transform-origin", "top left");
    var rect = content.getBoundingClientRect();

    if (isMobileViewport() && param !== "mainmenu") {
      var anchor = customizerCard() || trigger;
      var a = anchor.getBoundingClientRect();
      var mLeft = a.left + a.width / 2 - rect.width / 2;
      mLeft = Math.min(Math.max(8, mLeft), Math.max(8, window.innerWidth - rect.width - 8));
      var mTop = Math.max(8, a.top - 20 - rect.height);
      content.style.left = mLeft + "px";
      content.style.top = mTop + "px";
      return;
    }

    var t = trigger.getBoundingClientRect();
    var left = t.right + 20;
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, t.left - 20 - rect.width);
    }
    var top = t.top + (param === "mainmenu" ? -8 : 0);
    top = Math.min(top, window.innerHeight - rect.height - 8);
    top = Math.max(8, top);
    content.style.left = left + "px";
    content.style.top = top + "px";
  }

  function openPicker(param) {
    closePicker();
    var trigger = triggerFor(param);
    var content = contentFor(param);
    if (!trigger || !content) return;
    content.hidden = false;
    positionPopup(param, trigger, content);
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("data-popup-open", "");
    var shield = shieldEl();
    if (shield) shield.hidden = false;
    openPickerParam = param;
  }

  function closePicker(returnFocus) {
    if (!openPickerParam) return;
    var content = contentFor(openPickerParam);
    var trigger = triggerFor(openPickerParam);
    if (content) content.hidden = true;
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("data-popup-open");
      if (returnFocus) trigger.focus();
    }
    var shield = shieldEl();
    if (shield) shield.hidden = true;
    openPickerParam = null;
    // onOpenChange(false) clears the hover preview (…-picker.tsx).
    clearOverride();
  }

  function previewItem(item) {
    if (isMobileViewport()) return;
    var group = item.closest("[data-templ-create-radiogroup]");
    var name = group && group.getAttribute("data-templ-create-radiogroup");
    var handler = name && GROUPS[name];
    if (handler && handler.preview) handler.preview(item.getAttribute("data-value"));
  }

  // ----- rendering ------------------------------------------------------------

  function setValue(param, text) {
    var el = document.querySelector('[data-templ-create-value="' + param + '"]');
    if (el && text) el.textContent = text;
  }

  function setDisabled(el, disabled) {
    if (!el) return;
    if (disabled) {
      el.setAttribute("data-disabled", "");
      el.setAttribute("aria-disabled", "true");
    } else {
      el.removeAttribute("data-disabled");
      el.removeAttribute("aria-disabled");
    }
  }

  function styleTitle(name) {
    var style = cfg.STYLES.find(function (s) {
      return s.name === name;
    });
    return style ? style.title : name;
  }

  function themeTitle(name) {
    var theme = getTheme(name);
    return theme ? theme.title : name;
  }

  // customizer.tsx swatch rules: base colors show their dark muted-foreground,
  // colored themes their dark primary; the base color picker always shows
  // muted-foreground.
  function swatchColor(name, forceMuted) {
    var theme = getTheme(name);
    if (!theme || !theme.cssVars || !theme.cssVars.dark) return "";
    var key = forceMuted || isBaseColorName(name) ? "muted-foreground" : "primary";
    return theme.cssVars.dark[key] || "";
  }

  function setSwatch(param, color) {
    var el = document.querySelector('[data-templ-create-indicator="' + param + '"]');
    if (el) el.style.setProperty("--color", color);
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function radioItemHTML(value, label) {
    return (
      '<div role="menuitemradio" tabindex="-1" data-slot="dropdown-menu-radio-item" data-templ-create-item data-value="' +
      escapeHTML(value) +
      '" aria-checked="false" data-checked="false" class="' +
      RADIO_ITEM_CLASS +
      '"><span class="pointer-events-none absolute right-2 flex items-center justify-center" data-slot="dropdown-menu-radio-item-indicator" hidden>' +
      CHECK_SVG +
      "</span>" +
      escapeHTML(label) +
      "</div>"
    );
  }

  // Rebuilds the theme/chart color lists for the current base color
  // (theme-picker.tsx / chart-color-picker.tsx: base-colored themes first,
  // then the colored themes).
  function rebuildThemeList(groupName) {
    var group = document.querySelector('[data-templ-create-radiogroup="' + groupName + '"]');
    if (!group) return;
    var available = cfg.getThemesForBaseColor(params.baseColor);
    var baseItems = available.filter(function (t) {
      return isBaseColorName(t.name);
    });
    var colorItems = available.filter(function (t) {
      return !isBaseColorName(t.name);
    });
    var itemsHTML = function (items) {
      return (
        '<div data-slot="dropdown-menu-group" role="group">' +
        items
          .map(function (t) {
            return radioItemHTML(t.name, t.title);
          })
          .join("") +
        "</div>"
      );
    };
    group.innerHTML =
      itemsHTML(baseItems) +
      '<div data-slot="dropdown-menu-separator" role="separator" class="' +
      SEPARATOR_CLASS +
      '"></div>' +
      itemsHTML(colorItems);
  }

  function syncGroup(name) {
    var group = document.querySelector('[data-templ-create-radiogroup="' + name + '"]');
    if (!group) return;
    var value = GROUPS[name].value(params);
    group.querySelectorAll("[data-templ-create-item]").forEach(function (item) {
      var checked = item.getAttribute("data-value") === value;
      item.setAttribute("data-checked", String(checked));
      item.setAttribute("aria-checked", String(checked));
      var indicator = item.querySelector('[data-slot="dropdown-menu-radio-item-indicator"]');
      if (indicator) indicator.hidden = !checked;
    });
  }

  function renderLocks() {
    document.querySelectorAll("[data-templ-create-lock]").forEach(function (button) {
      var locked = locks.has(button.getAttribute("data-templ-create-lock"));
      button.setAttribute("data-locked", String(locked));
      button.title = locked ? "Unlock" : "Lock";
      button.setAttribute("aria-label", locked ? "Unlock" : "Lock");
      var lockedIcon = button.querySelector('[data-templ-create-lock-icon="locked"]');
      var unlockedIcon = button.querySelector('[data-templ-create-lock-icon="unlocked"]');
      if (lockedIcon) lockedIcon.hidden = !locked;
      if (unlockedIcon) unlockedIcon.hidden = locked;
    });
  }

  function renderHistoryItems() {
    setDisabled(document.querySelector('[data-templ-create-action="undo"]'), !canGoBack());
    setDisabled(document.querySelector('[data-templ-create-action="redo"]'), !canGoForward());
  }

  function setupShortcutLabels() {
    var labels = {
      navigate: isMac ? "⌘P" : "Ctrl+P",
      undo: isMac ? "⌘Z" : "Ctrl+Z",
      redo: isMac ? "⇧⌘Z" : "Ctrl+Shift+Z",
    };
    Object.keys(labels).forEach(function (key) {
      var el = document.querySelector('[data-templ-create-shortcut="' + key + '"]');
      if (el) el.textContent = labels[key];
    });
  }

  function render() {
    var p = params;

    // Trigger labels.
    setValue("style", styleTitle(p.style));
    setValue("baseColor", themeTitle(p.baseColor));
    setValue("theme", themeTitle(p.theme));
    setValue("chartColor", themeTitle(p.chartColor));
    var bodyFont = fontOption(p.font);
    var headingFont = p.fontHeading === "inherit" ? bodyFont : fontOption(p.fontHeading);
    setValue("fontHeading", headingFont ? headingFont.name : bodyFont ? bodyFont.name : "");
    setValue("font", bodyFont ? bodyFont.name : "");
    var radiusName = isRadiusLocked(p) ? "none" : p.radius;
    var radiusEntry = cfg.RADII.find(function (r) {
      return r.name === radiusName;
    });
    setValue("radius", radiusEntry ? radiusEntry.label : "");
    var menuOption = MENU_OPTIONS.find(function (m) {
      return m.value === p.menuColor;
    });
    setValue("menuColor", menuOption ? menuOption.label : "");
    var accent = cfg.MENU_ACCENTS.find(function (a) {
      return a.value === p.menuAccent;
    });
    setValue("menuAccent", accent ? accent.label : "");

    // Trailing indicators.
    var styleIndicator = document.querySelector('[data-templ-create-indicator="style"]');
    var styleEntry = cfg.STYLES.find(function (s) {
      return s.name === p.style;
    });
    if (styleIndicator && styleEntry) {
      styleIndicator.innerHTML = styleEntry.icon;
      var svg = styleIndicator.querySelector("svg");
      if (svg) svg.setAttribute("class", "size-4");
    }
    setSwatch("baseColor", swatchColor(p.baseColor, true));
    setSwatch("theme", swatchColor(p.theme, false));
    setSwatch("chartColor", swatchColor(p.chartColor, false));
    var headingIndicator = document.querySelector('[data-templ-create-indicator="fontHeading"]');
    if (headingIndicator) {
      headingIndicator.style.fontFamily = fontFamilyOf(headingFont || bodyFont);
    }
    var fontIndicator = document.querySelector('[data-templ-create-indicator="font"]');
    if (fontIndicator) fontIndicator.style.fontFamily = fontFamilyOf(bodyFont);
    document
      .querySelectorAll('[data-templ-create-indicator="menuAccent"] path')
      .forEach(function (path) {
        path.setAttribute("data-accent", p.menuAccent);
      });

    // Theme/chart lists follow the base color.
    if (renderedBaseColor !== p.baseColor) {
      rebuildThemeList("theme");
      rebuildThemeList("chartColor");
      renderedBaseColor = p.baseColor;
    }

    // Inherit item label = current body font (font-picker.tsx inheritFontLabel).
    var inheritItem = document.querySelector(
      '[data-templ-create-content="fontHeading"] [data-value="inherit"]'
    );
    if (inheritItem) {
      var inheritLabel = bodyFont ? bodyFont.name : "Body font";
      var textNode = Array.from(inheritItem.childNodes).find(function (node) {
        return node.nodeType === Node.TEXT_NODE && node.nodeValue.trim();
      });
      if (textNode) textNode.nodeValue = inheritLabel;
      else inheritItem.appendChild(document.createTextNode(inheritLabel));
    }

    // Disabled states.
    var radiusTrigger = triggerFor("radius");
    if (radiusTrigger) radiusTrigger.disabled = isRadiusLocked(p);
    var largeItem = document.querySelector(
      '[data-templ-create-content="radius"] [data-value="large"]'
    );
    setDisabled(largeItem, p.style === "rhea");
    var invertedItem = document.querySelector(
      '[data-templ-create-radiogroup="menuColorColor"] [data-value="inverted"]'
    );
    setDisabled(invertedItem, isDark());
    var boldItem = document.querySelector(
      '[data-templ-create-radiogroup="menuAccent"] [data-value="bold"]'
    );
    setDisabled(boldItem, isTranslucentMenuColor(p.menuColor));

    // Radio checks.
    Object.keys(GROUPS).forEach(syncGroup);

    // menu-picker.tsx: remember the accent chosen while the surface is solid.
    if (menuSurfaceChoice(p) === "solid") lastSolidMenuAccent = p.menuAccent;

    // Copy preset button label IS the command.
    var copyButton = document.querySelector("[data-templ-create-copy]");
    var copyLabel = document.querySelector("[data-templ-create-copy-label]");
    var label = copied ? "Copied" : "--preset " + getPresetCode(p);
    if (copyLabel) copyLabel.textContent = label;
    if (copyButton) copyButton.title = label;

    // Preview switcher + action menu selection.
    document.querySelectorAll("[data-templ-create-preview-item]").forEach(function (button) {
      button.setAttribute(
        "data-active",
        String(button.getAttribute("data-templ-create-preview-item") === p.item)
      );
    });
    document.querySelectorAll("[data-templ-create-registry-item]").forEach(function (el) {
      el.setAttribute(
        "data-checked",
        String(el.getAttribute("data-templ-create-registry-item") === p.item)
      );
    });

    // Get Code dialog: tabs, live commands, theme css, copy flashes.
    renderProjectForm();

    renderLocks();
    renderHistoryItems();
  }

  // ----- preset handler (preset-handler.tsx) ---------------------------------

  function handleInitialPreset() {
    var url = new URL(window.location.href);
    if (url.searchParams.get("preset") === "random") {
      url.searchParams.set("preset", preset.generateRandomPreset());
      history.replaceState(null, "", url);
    }
  }

  // ----- welcome dialog (welcome-dialog.tsx) ---------------------------------

  function maybeShowWelcome() {
    var dismissed = null;
    try {
      dismissed = localStorage.getItem(WELCOME_STORAGE_KEY);
    } catch (e) {}
    if (dismissed) return;
    window.templ.dialog.open("create-welcome-dialog");
  }

  // ----- shortcuts ------------------------------------------------------------

  function isEditableTarget(target) {
    return (
      (target instanceof HTMLElement && target.isContentEditable) ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    );
  }

  function runMenuAction(action) {
    switch (action) {
      case "navigate":
        window.templ.dialog.open("create-action-menu");
        break;
      case "open-preset":
        openPresetDialog();
        break;
      case "shuffle":
        randomize();
        break;
      case "toggle-theme":
        if (window.themeUtils) window.themeUtils.cycleTheme();
        break;
      case "undo":
        goBack();
        break;
      case "redo":
        goForward();
        break;
      case "reset":
        window.templ.dialog.open("create-reset-dialog");
        break;
    }
  }

  function handleKeydown(e) {
    // Popup keyboard navigation (Base UI menu semantics: focus is the
    // highlight).
    if (openPickerParam) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePicker(true);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
        var content = contentFor(openPickerParam);
        if (content) {
          var items = enabledItems(content);
          if (items.length) {
            e.preventDefault();
            var current = items.indexOf(document.activeElement);
            var next;
            if (e.key === "ArrowDown") next = current >= items.length - 1 ? 0 : current + 1;
            else if (e.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
            else if (e.key === "Home") next = 0;
            else next = items.length - 1;
            items[next].focus();
          }
        }
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        var active = document.activeElement;
        if (active instanceof Element && active.closest("[data-templ-create-content]")) {
          e.preventDefault();
          active.click();
          return;
        }
      }
    }

    if (e.metaKey || e.ctrlKey) {
      var key = e.key.toLowerCase();
      // use-action-menu: Cmd/Ctrl+P toggles the navigator; the iframe
      // forwards Cmd/Ctrl+K too (action-menu.tsx), so both open it here.
      if (key === "p" || key === "k") {
        e.preventDefault();
        window.templ.dialog.toggle("create-action-menu");
        return;
      }
      // use-history: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Ctrl+Y.
      if (isEditableTarget(e.target)) return;
      if ((key === "z" && e.shiftKey) || (key === "y" && e.ctrlKey)) {
        e.preventDefault();
        goForward();
        return;
      }
      if (key === "z") {
        e.preventDefault();
        goBack();
      }
      return;
    }

    if (e.altKey) return;
    if (isEditableTarget(e.target)) return;

    // use-random: r shuffles.
    if (e.key === "r" && !e.shiftKey) {
      e.preventDefault();
      randomize();
      return;
    }
    // use-reset: Shift+R opens the dialog; pressed again it confirms.
    if (e.key === "R" && e.shiftKey) {
      e.preventDefault();
      if (window.templ.dialog.isOpen("create-reset-dialog")) confirmReset();
      else window.templ.dialog.open("create-reset-dialog");
      return;
    }
    // use-open-preset: o opens the preset dialog.
    if (e.key === "o" && !e.shiftKey) {
      e.preventDefault();
      openPresetDialog();
      return;
    }
    // use-theme-toggle: d toggles light/dark.
    if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      if (window.themeUtils) window.themeUtils.cycleTheme();
    }
  }

  // preview.tsx handleMessage: the iframe forwards its shortcuts, the parent
  // re-dispatches them as synthetic keydowns so one code path handles both.
  function handleMessage(event) {
    var frame = frameEl();
    var frameWindow = frame && frame.contentWindow;
    if (
      !frameWindow ||
      event.origin !== window.location.origin ||
      event.source !== frameWindow ||
      !event.data ||
      typeof event.data !== "object"
    ) {
      return;
    }

    var type = event.data.type;
    if (type === "templ-create-ready") {
      lastSentParams = null;
      sendParams();
      return;
    }

    var isMacUA = MAC_REGEX.test(navigator.userAgent);
    if (type === "cmd-k-forward") {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: event.data.key || "k",
          metaKey: isMacUA,
          ctrlKey: !isMacUA,
          bubbles: true,
          cancelable: true,
        })
      );
    } else if (type === "randomize-forward") {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: event.data.key || "r",
          bubbles: true,
          cancelable: true,
        })
      );
    } else if (type === "open-preset-forward") {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: event.data.key || "o",
          bubbles: true,
          cancelable: true,
        })
      );
    } else if (type === "undo-forward") {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          metaKey: isMacUA,
          ctrlKey: !isMacUA,
          bubbles: true,
          cancelable: true,
        })
      );
    } else if (type === "redo-forward") {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          shiftKey: true,
          metaKey: isMacUA,
          ctrlKey: !isMacUA,
          bubbles: true,
          cancelable: true,
        })
      );
    } else if (type === "reset-forward") {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "R",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    } else if (type === "dark-mode-forward") {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: event.data.key || "d",
          bubbles: true,
          cancelable: true,
        })
      );
    }
  }

  // ----- wiring ---------------------------------------------------------------

  function init() {
    if (!document.querySelector("[data-templ-create]")) return;
    if (!preset || !cfg) return;

    handleInitialPreset();
    params = readParams();

    // Mount sync (lib/search-params.ts hasSyncedPresetToUrl): no or invalid
    // ?preset -> replace the URL with the encoded state.
    var presetParam = new URLSearchParams(window.location.search).get("preset");
    if (!presetParam || !preset.isPresetCode(presetParam)) {
      writeURL("replace");
    }
    recordHistory();
    setupShortcutLabels();

    var frame = frameEl();
    if (frame) {
      frame.addEventListener("load", function () {
        lastSentParams = null;
        sendParams();
      });
      frame.src = iframeSrc();
    }

    render();
    maybeShowWelcome();

    // Open/close pickers. pointerdown, like Base UI's trigger.
    document.addEventListener("pointerdown", function (e) {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest("[data-templ-create-content]")) return;
      var trigger = e.target.closest("[data-templ-create-trigger]");
      if (trigger) {
        var param = trigger.getAttribute("data-templ-create-trigger");
        if (openPickerParam === param) closePicker();
        else openPicker(param);
        return;
      }
      if (openPickerParam) closePicker();
    });

    document.addEventListener("click", function (e) {
      if (!(e.target instanceof Element)) return;

      var item = e.target.closest("[data-templ-create-item]");
      if (item && item.closest("[data-templ-create-content]")) {
        if (item.hasAttribute("data-disabled")) return;
        var group = item.closest("[data-templ-create-radiogroup]");
        var name = group && group.getAttribute("data-templ-create-radiogroup");
        var handler = name && GROUPS[name];
        if (handler) handler.commit(item.getAttribute("data-value"));
        // PickerRadioItem closeOnClick={isMobile}: desktop keeps the menu open.
        if (isMobileViewport()) closePicker();
        return;
      }

      var action = e.target.closest("[data-templ-create-action]");
      if (action) {
        if (action.hasAttribute("data-disabled")) return;
        closePicker();
        runMenuAction(action.getAttribute("data-templ-create-action"));
        return;
      }

      if (e.target.closest("[data-templ-create-copy]")) {
        copyPresetCommand();
        return;
      }
      if (e.target.closest("[data-templ-create-open-preset]")) {
        openPresetDialog();
        return;
      }
      if (e.target.closest("[data-templ-create-shuffle]")) {
        randomize();
        return;
      }
      if (e.target.closest("[data-templ-create-reset-confirm]")) {
        confirmReset();
        return;
      }
      var previewItemButton = e.target.closest("[data-templ-create-preview-item]");
      if (previewItemButton) {
        setItem(previewItemButton.getAttribute("data-templ-create-preview-item"));
        return;
      }
      var copyTarget = e.target.closest("[data-templ-create-copy-target]");
      if (copyTarget) {
        copyProjectTarget(copyTarget.getAttribute("data-templ-create-copy-target"));
      }
    });

    // Get Code tabs (project-form.tsx onValueChange: consume the proposed
    // group value directly; an empty selection falls back to "new-project").
    document.addEventListener("toggle-group-value-change", function (e) {
      var group = e.target instanceof Element && e.target.closest("[data-templ-create-tabs]");
      if (!group) return;
      activeTab = e.detail.value[0] || "new-project";
      renderProjectForm();
    });

    // Hover previews: mousemove re-arms the trailing timer while the cursor
    // moves; focus covers keyboard browsing (picker.tsx PickerRadioItem).
    document.addEventListener("mousemove", function (e) {
      if (!(e.target instanceof Element)) return;
      var item = e.target.closest("[data-templ-create-item]");
      if (!item || !item.closest("[data-templ-create-content]")) return;
      if (item.hasAttribute("data-disabled")) return;
      if (document.activeElement !== item) item.focus({ preventScroll: true });
      previewItem(item);
    });

    document.addEventListener("focusin", function (e) {
      if (!(e.target instanceof Element)) return;
      var item = e.target.closest("[data-templ-create-item]");
      if (!item || !item.closest("[data-templ-create-content]")) return;
      if (item.hasAttribute("data-disabled")) return;
      previewItem(item);
    });

    // Leaving the popup reverts the preview instantly (PickerContent
    // onMouseLeave={clearOverride}).
    document.querySelectorAll("[data-templ-create-content]").forEach(function (content) {
      content.addEventListener("mouseleave", function () {
        clearOverride();
      });
    });

    // Lock buttons (shuffle only).
    document.querySelectorAll("[data-templ-create-lock]").forEach(function (button) {
      button.addEventListener("click", function () {
        var param = button.getAttribute("data-templ-create-lock");
        if (locks.has(param)) locks.delete(param);
        else locks.add(param);
        renderLocks();
      });
    });

    // Open preset forms (dialog + drawer share the markup).
    document.addEventListener("submit", function (e) {
      var form = e.target instanceof Element && e.target.closest("[data-templ-create-preset-form]");
      if (!form) return;
      e.preventDefault();
      submitPresetForm(form);
    });

    document.addEventListener("input", function (e) {
      var form = e.target instanceof Element && e.target.closest("[data-templ-create-preset-form]");
      if (form) updatePresetForm(form);
    });

    // APPLY_MODES radio (project-form.tsx setApplyMode): the hidden radio
    // inputs fire native change events on selection.
    document.addEventListener("change", function (e) {
      var input = e.target;
      if (!(input instanceof HTMLInputElement) || input.name !== "create-apply-mode") return;
      applyMode = input.value;
      renderProjectForm();
    });

    // Action menu selection (command.js command-select event).
    document.addEventListener("command-select", function (e) {
      var el =
        e.target instanceof Element && e.target.closest("[data-templ-create-registry-item]");
      if (!el) return;
      setItem(el.getAttribute("data-templ-create-registry-item"));
      window.templ.dialog.close("create-action-menu");
    });

    // Welcome dialog dismissal flag.
    document.addEventListener("dialog-close", function (e) {
      if (e.target instanceof Element && e.target.id === "create-welcome-dialog") {
        try {
          localStorage.setItem(WELCOME_STORAGE_KEY, "true");
        } catch (err) {}
      }
    });

    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("message", handleMessage);

    // Browser back/forward re-resolves the URL (nuqs re-read pendant). An
    // item change remounts the iframe like shadcn's key={base + item}.
    window.addEventListener("popstate", function () {
      var previousItem = params.item;
      params = readParams();
      recordHistory();
      if (params.item !== previousItem) {
        var frame = frameEl();
        if (frame) {
          lastSentParams = null;
          frame.src = iframeSrc();
        }
      }
      sendParams();
      render();
    });

    window.addEventListener("resize", function () {
      if (!openPickerParam) return;
      var trigger = triggerFor(openPickerParam);
      var content = contentFor(openPickerParam);
      if (trigger && content) positionPopup(openPickerParam, trigger, content);
    });

    // The menu Inverted option is disabled in dark mode (menu-picker.tsx
    // isDark); re-render when the site theme flips.
    new MutationObserver(function () {
      render();
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
