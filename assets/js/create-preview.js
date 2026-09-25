/* /create preview runtime: 1:1 port of shadcn's design-system-provider.tsx
   (shadcn@4.16.0, apps/v4/app/(app)/(create)/components) plus the iframe
   keydown forwarders from action-menu.tsx, random-button.tsx,
   open-preset.tsx, mode-switcher.tsx and history-buttons.tsx.

   Receives design-system-params via postMessage (and reads its own URL for
   the initial paint), then applies:
     - body classes style-<style> + base-color-<baseColor>
     - --font-sans/--font-heading on <html> from the FONTS preview variables
     - a #design-system-theme-vars style element built like buildRegistryTheme
     - the cn-menu-target / [data-menu-translucent] menu color toggling with
       a MutationObserver and transition suppression
   Replies templ-create-ready so the parent sends the initial params. */
(function () {
  "use strict";

  if (window.__templCreatePreviewInitialized) return;
  window.__templCreatePreviewInitialized = true;

  var THEME_STYLE_ELEMENT_ID = "design-system-theme-vars";
  var MANAGED_BODY_CLASS_PREFIXES = ["style-", "base-color-"];
  // registry/config.ts POINTER_CURSOR_SELECTOR.
  var POINTER_CURSOR_CSS =
    "@layer base {\n" +
    '  button:not(:disabled), [role="button"]:not(:disabled) {\n' +
    "    cursor: pointer;\n" +
    "  }\n" +
    "}\n";

  var preset = window.templPreset;
  var cfg = window.templCreateConfig;

  var lastParams = null;
  var currentMenuColor = null;
  var menuFrameId = 0;

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

  // ----- normalization (same rules as the parent, lib/search-params.ts) ------

  function isTranslucentMenuColor(menuColor) {
    return menuColor === "default-translucent" || menuColor === "inverted-translucent";
  }

  function normalizeDesignSystemParams(p) {
    var result = Object.assign({}, p, {
      fontHeading: p.fontHeading === p.font ? "inherit" : p.fontHeading,
    });
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
    if (result.style === "lyra" || (result.style === "sera" && result.radius !== "none")) {
      result.radius = "none";
    } else if (result.style === "rhea" && result.radius === "large") {
      result.radius = "default";
    }
    return result;
  }

  function readInitialParams() {
    var sp = new URLSearchParams(window.location.search);
    var base = Object.assign({}, cfg.DEFAULT_CONFIG, {
      pointer: sp.get("pointer") === "true",
    });
    var code = sp.get("preset");
    if (code && preset.isPresetCode(code)) {
      var decoded = preset.decodePreset(code);
      if (decoded) {
        if (!decoded.chartColor) {
          decoded.chartColor =
            preset.V1_CHART_COLOR_MAP[decoded.theme] || decoded.theme;
        }
        return normalizeDesignSystemParams(Object.assign(base, decoded));
      }
    }
    return normalizeDesignSystemParams(base);
  }

  // ----- registry theme (registry/config.ts buildRegistryTheme) --------------

  function buildRegistryThemeVars(config) {
    var baseColor = getTheme(config.baseColor);
    var theme = getTheme(config.theme);
    if (!baseColor || !theme) return null;

    // Merge base color and theme CSS vars.
    var light = Object.assign({}, baseColor.cssVars.light, theme.cssVars.light);
    var dark = Object.assign({}, baseColor.cssVars.dark, theme.cssVars.dark);

    // Apply chart color override.
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

    // Apply menu accent transformation.
    if (config.menuAccent === "bold") {
      light.accent = light.primary;
      light["accent-foreground"] = light["primary-foreground"];
      dark.accent = dark.primary;
      dark["accent-foreground"] = dark["primary-foreground"];
    }

    // Apply radius transformation.
    if (config.radius && config.radius !== "default") {
      var radius = cfg.RADII.find(function (r) {
        return r.name === config.radius;
      });
      if (radius && radius.value) light.radius = radius.value;
    }

    return { light: light, dark: dark };
  }

  function buildCssRule(selector, vars) {
    var declarations = Object.keys(vars || {})
      .filter(function (key) {
        return Boolean(vars[key]);
      })
      .map(function (key) {
        return "  --" + key + ": " + vars[key] + ";";
      })
      .join("\n");
    if (!declarations) return selector + " {}\n";
    return selector + " {\n" + declarations + "\n}\n";
  }

  function buildThemeCssText(vars, pointer) {
    return [
      buildCssRule(":root", vars.light),
      buildCssRule(".dark", vars.dark),
      pointer ? POINTER_CURSOR_CSS : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // ----- apply ----------------------------------------------------------------

  function removeManagedBodyClasses(body) {
    Array.from(body.classList).forEach(function (className) {
      var managed = MANAGED_BODY_CLASS_PREFIXES.some(function (prefix) {
        return className.indexOf(prefix) === 0;
      });
      if (managed) body.classList.remove(className);
    });
  }

  function isSameParams(a, b) {
    if (!a) return false;
    return Object.keys(b).every(function (key) {
      return a[key] === b[key];
    });
  }

  // Handle menu color inversion by adding/removing dark class to elements
  // with cn-menu-target; translucent moves between data-menu-translucent and
  // the cn-menu-translucent class.
  function updateMenuElements() {
    var menuColor = currentMenuColor;
    if (!menuColor) return;
    var isInvertedMenu = menuColor === "inverted" || menuColor === "inverted-translucent";
    var isTranslucentMenu = isTranslucentMenuColor(menuColor);

    var allElements = document.querySelectorAll(".cn-menu-target, [data-menu-translucent]");
    if (allElements.length === 0) return;

    // Disable transitions while toggling classes.
    allElements.forEach(function (element) {
      element.style.transition = "none";
    });

    allElements.forEach(function (element) {
      if (element.classList.contains("cn-menu-target")) {
        if (isInvertedMenu) element.classList.add("dark");
        else element.classList.remove("dark");
      }

      // When translucent is enabled, move from data-attr to class so styles
      // apply. When disabled, move back to a data-attr so the element stays
      // queryable for future toggles.
      if (isTranslucentMenu) {
        element.classList.add("cn-menu-translucent");
        element.removeAttribute("data-menu-translucent");
      } else if (element.classList.contains("cn-menu-translucent")) {
        element.classList.remove("cn-menu-translucent");
        element.setAttribute("data-menu-translucent", "");
      }
    });

    // Force a reflow, then re-enable transitions.
    void document.body.offsetHeight;
    allElements.forEach(function (element) {
      element.style.transition = "";
    });
  }

  function scheduleMenuUpdate() {
    if (menuFrameId) return;
    menuFrameId = window.requestAnimationFrame(function () {
      menuFrameId = 0;
      updateMenuElements();
    });
  }

  function applyParams(raw) {
    var p = normalizeDesignSystemParams(raw);
    if (isSameParams(lastParams, p)) return;
    lastParams = p;

    if (!p.style || !p.theme || !p.font || !p.baseColor) return;

    // Body classes.
    removeManagedBodyClasses(document.body);
    document.body.classList.add("style-" + p.style, "base-color-" + p.baseColor);

    // Fonts. Always set --font-sans so the selected font is visible; the
    // heading inherits the body font via its preview variable.
    var selectedFont = fontOption(p.font);
    var selectedHeadingFont =
      p.fontHeading === "inherit" || p.fontHeading === p.font
        ? selectedFont
        : fontOption(p.fontHeading);
    if (selectedFont) {
      document.documentElement.style.setProperty("--font-sans", fontFamilyOf(selectedFont));
    }
    if (selectedHeadingFont) {
      document.documentElement.style.setProperty(
        "--font-heading",
        fontFamilyOf(selectedHeadingFont)
      );
    }

    // Theme vars.
    var effectiveRadius = p.style === "lyra" ? "none" : p.radius;
    var vars = buildRegistryThemeVars(
      Object.assign({}, cfg.DEFAULT_CONFIG, {
        baseColor: p.baseColor,
        theme: p.theme,
        chartColor: p.chartColor,
        menuAccent: p.menuAccent,
        radius: effectiveRadius,
      })
    );
    if (vars) {
      var styleElement = document.getElementById(THEME_STYLE_ELEMENT_ID);
      if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = THEME_STYLE_ELEMENT_ID;
        document.head.appendChild(styleElement);
      }
      styleElement.textContent = buildThemeCssText(vars, Boolean(p.pointer));
    }

    // Menu color.
    currentMenuColor = p.menuColor;
    updateMenuElements();
  }

  // ----- keydown forwarders (the *_FORWARD scripts) --------------------------

  function isEditableTarget(target) {
    return (
      (target instanceof HTMLElement && target.isContentEditable) ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    );
  }

  function postToParent(type, key) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: type, key: key }, "*");
    }
  }

  function handleKeydown(e) {
    // action-menu.tsx: forward Cmd/Ctrl + K (and P).
    if ((e.key === "k" || e.key === "p") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      postToParent("cmd-k-forward", e.key);
      return;
    }

    // history-buttons.tsx: forward undo/redo.
    if (e.metaKey || e.ctrlKey) {
      if (isEditableTarget(e.target)) return;
      var key = e.key.toLowerCase();
      if ((key === "z" && e.shiftKey) || (key === "y" && e.ctrlKey)) {
        e.preventDefault();
        postToParent("redo-forward");
      } else if (key === "z") {
        e.preventDefault();
        postToParent("undo-forward");
      }
      return;
    }

    if (e.altKey) return;
    if (isEditableTarget(e.target)) return;

    // random-button.tsx: forward r (shuffle) and Shift+R (reset).
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      postToParent(e.shiftKey ? "reset-forward" : "randomize-forward", e.key);
      return;
    }
    // open-preset.tsx: forward O.
    if (e.key === "o" && !e.shiftKey) {
      e.preventDefault();
      postToParent("open-preset-forward", e.key);
      return;
    }
    // mode-switcher.tsx: forward D.
    if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      postToParent("dark-mode-forward", e.key);
    }
  }

  // ----- wiring ---------------------------------------------------------------

  function init() {
    if (!preset || !cfg) return;

    // Initial paint from the iframe's own URL; the parent's postMessage
    // updates take over from here.
    applyParams(readInitialParams());

    window.addEventListener("message", function (event) {
      if (event.origin !== window.location.origin) return;
      var data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "design-system-params" && data.data) {
        applyParams(data.data);
      }
    });

    document.addEventListener("keydown", handleKeydown);

    // Watch for new menu elements being added to the DOM (rAF-throttled).
    new MutationObserver(function () {
      scheduleMenuUpdate();
    }).observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Follow the site theme like next-themes: the parent's theme switcher
    // writes localStorage, the storage event fires here (base.templ does the
    // same for the docs pages).
    window.addEventListener("storage", function (e) {
      if (e.key !== "theme") return;
      var p = e.newValue || "system";
      var dark =
        p === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : p === "dark";
      document.documentElement.classList.toggle("dark", dark);
    });

    // Tell the parent we are ready for the initial params.
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "templ-create-ready" }, window.location.origin);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
