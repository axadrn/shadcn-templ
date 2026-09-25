/* /typeset preview runtime: 1:1 port of shadcn's preview-provider.tsx plus
   the keydown forwarders from forward-scripts.tsx (apps/v4/app/(app)/
   (typeset)).

   Reads its own URL for the initial paint (this script loads without defer so
   the variables land on :root before the body paints, the pendant of the
   provider's useLayoutEffect), then follows typeset-params postMessages from
   the parent. Applies the --preview-* variables the preview layout consumes:
     --preview-size / --preview-leading / --preview-flow / --preview-measure
     --preview-font / --preview-font-heading / --preview-font-mono
   Keyboard shortcuts are translated into typed typeset-command messages the
   parent handles once (R shuffle, Shift+R reset, D theme, Cmd/Ctrl+Z undo,
   Shift+Cmd/Ctrl+Z / Ctrl+Y redo).

   Font data comes from window.templCreateConfig.FONTS (create-config.js loads
   first). */
(function () {
  "use strict";

  if (window.__templTypesetPreviewInitialized) return;
  window.__templTypesetPreviewInitialized = true;

  // lib/search-params.ts tables (values only; labels stay in the parent).
  var SIZES = ["14", "15", "16", "18"];
  var LEADINGS = ["1.6", "1.75", "1.9"];
  var FLOWS = ["1em", "1.25em", "2em"];
  var MEASURES = [
    { value: "60", width: "28em" },
    { value: "70", width: "33em" },
    { value: "80", width: "37em" },
    { value: "90", width: "42em" },
  ];
  var EXCLUDED_FONTS = ["instrument-serif", "eb-garamond", "playfair-display"];

  var DEFAULTS = {
    body: "geist",
    heading: "inherit",
    mono: "geist-mono",
    scale: "15",
    measure: "80",
    flow: "1.25em",
    leading: "1.75",
  };
  var PARAM_KEYS = Object.keys(DEFAULTS);

  var cfg = window.templCreateConfig;
  var lastParams = null;

  var FONTS = (cfg ? cfg.FONTS : [])
    .filter(function (f) {
      return EXCLUDED_FONTS.indexOf(f.value) === -1;
    })
    .map(function (f) {
      return { id: f.value, value: "var(" + f.previewVariable + "), " + f.family };
    });

  function findFont(id) {
    return FONTS.find(function (f) {
      return f.id === id;
    });
  }

  function paramValues(key) {
    switch (key) {
      case "body":
      case "mono":
        return FONTS.map(function (f) {
          return f.id;
        });
      case "heading":
        return ["inherit"].concat(
          FONTS.map(function (f) {
            return f.id;
          })
        );
      case "scale":
        return SIZES;
      case "measure":
        return MEASURES.map(function (o) {
          return o.value;
        });
      case "flow":
        return FLOWS;
      case "leading":
        return LEADINGS;
    }
    return [];
  }

  function coerce(key, value) {
    return paramValues(key).indexOf(value) !== -1 ? value : null;
  }

  function normalizeParams(raw) {
    var result = {};
    PARAM_KEYS.forEach(function (key) {
      var value = raw && typeof raw[key] === "string" ? coerce(key, raw[key]) : null;
      result[key] = value !== null ? value : DEFAULTS[key];
    });
    return result;
  }

  function readInitialParams() {
    var sp = new URLSearchParams(window.location.search);
    var raw = {};
    PARAM_KEYS.forEach(function (key) {
      raw[key] = sp.get(key);
    });
    return normalizeParams(raw);
  }

  function isSameParams(a, b) {
    if (!a) return false;
    return PARAM_KEYS.every(function (key) {
      return a[key] === b[key];
    });
  }

  // preview-provider.tsx previewValues.
  function previewValues(params) {
    var bodyFont = findFont(params.body);
    var bodyValue = bodyFont ? bodyFont.value : "";
    var headingFont = params.heading === "inherit" ? bodyFont : findFont(params.heading);
    var monoFont = findFont(params.mono);
    var measure = MEASURES.find(function (o) {
      return o.value === params.measure;
    });

    return {
      "--preview-size": params.scale + "px",
      "--preview-leading": params.leading,
      "--preview-flow": params.flow,
      "--preview-measure": measure ? measure.width : "",
      "--preview-font": bodyValue,
      "--preview-font-heading": headingFont ? headingFont.value : bodyValue,
      "--preview-font-mono": monoFont ? monoFont.value : "",
    };
  }

  function applyParams(raw) {
    var params = normalizeParams(raw);
    if (isSameParams(lastParams, params)) return;
    lastParams = params;

    var style = document.documentElement.style;
    var values = previewValues(params);
    Object.keys(values).forEach(function (name) {
      if (values[name]) style.setProperty(name, values[name]);
      else style.removeProperty(name);
    });
  }

  // ----- keydown forwarders (forward-scripts.tsx) ----------------------------

  function isEditableTarget(target) {
    return (
      (target instanceof HTMLElement && target.isContentEditable) ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    );
  }

  function postCommand(command) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "typeset-command", command: command },
        window.location.origin
      );
    }
  }

  function handleKeydown(e) {
    // HistoryScript: Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z / Ctrl+Y redo.
    if (e.metaKey || e.ctrlKey) {
      if (isEditableTarget(e.target)) return;
      var key = e.key.toLowerCase();
      var command = null;
      if ((key === "z" && e.shiftKey) || (key === "y" && e.ctrlKey)) {
        command = "redo";
      } else if (key === "z") {
        command = "undo";
      }
      if (command) {
        e.preventDefault();
        postCommand(command);
      }
      return;
    }

    if (isEditableTarget(e.target)) return;

    // RandomizeScript: r shuffles, Shift+R resets.
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      postCommand(e.shiftKey ? "reset" : "shuffle");
      return;
    }
    // DarkModeScript: D toggles the theme.
    if ((e.key === "d" || e.key === "D") && !e.altKey) {
      e.preventDefault();
      postCommand("toggle-theme");
    }
  }

  // ----- wiring ---------------------------------------------------------------

  // This script runs pre-paint in <head>: the initial URL params apply before
  // the body renders (preview-provider.tsx's isReady gate).
  applyParams(readInitialParams());

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "typeset-params" && data.data) {
      applyParams(data.data);
    }
  });

  document.addEventListener("keydown", handleKeydown);
})();
