/* /typeset page controller: 1:1 port of shadcn's typeset page client state
   (apps/v4/app/(app)/(typeset)).

     lib/search-params.ts            -> params model, individual URL params,
                                        shallow replace history
     lib/fonts.ts                    -> FONTS (create fonts minus the display serifs)
     hooks/use-history.tsx           -> undo/redo stack of settled param snapshots
     hooks/use-locks.tsx             -> in-memory lock set (affects shuffle only)
     hooks/use-shuffle.tsx           -> true-random shuffle over the option tables
     hooks/use-theme-toggle.tsx      -> D key light/dark via themeUtils
     components/preview.tsx          -> iframe param sync + typeset-command handling
     components/preview-override.tsx -> 50ms trailing hover previews
     components/font-picker.tsx      -> font pickers on the SSRd DOM
     components/option-picker.tsx    -> option pickers on the SSRd DOM
     components/toolbar.tsx          -> fixture pills + open in new tab
     components/main-menu.tsx        -> menu actions + R/Shift+R shortcuts
     components/docs-panel.tsx       -> install docs + prompt, copy buttons
     components/get-code-drawer.tsx  -> swipe direction per viewport

   Font data comes from window.templCreateConfig.FONTS. The DOM contract is
   data-templ-typeset-* attributes, SSRd by internal/ui/pages/typeset.templ. */
(function () {
  "use strict";

  if (window.__templTypesetInitialized) return;
  window.__templTypesetInitialized = true;

  var MAC_REGEX = /Mac|iPhone|iPad|iPod/;
  var PREVIEW_OVERRIDE_DEBOUNCE_MS = 50;

  // lib/search-params.ts option tables.
  var SIZES = [
    { value: "14", label: "14px" },
    { value: "15", label: "15px" },
    { value: "16", label: "16px" },
    { value: "18", label: "18px" },
  ];

  var LEADINGS = [
    { value: "1.6", label: "Tight (1.6)" },
    { value: "1.75", label: "Regular (1.75)" },
    { value: "1.9", label: "Loose (1.9)" },
  ];

  var FLOWS = [
    { value: "1em", label: "Compact (1em)" },
    { value: "1.25em", label: "Regular (1.25em)" },
    { value: "2em", label: "Airy (2em)" },
  ];

  var MEASURES = [
    { value: "60", label: "60ch", width: "28em" },
    { value: "70", label: "70ch", width: "33em" },
    { value: "80", label: "80ch", width: "37em" },
    { value: "90", label: "90ch", width: "42em" },
  ];

  // lib/fixtures/index.ts: every built fixture is a valid ?item=; the toolbar
  // shows the production CONTENT_OPTIONS subset (SSRd in typeset.templ).
  var AVAILABLE_CONTENT = [
    "docs",
    "chat",
    "article",
    "changelog",
    "notes",
    "recipe",
    "elements",
    "tailwind",
  ];

  // lib/fonts.ts EXCLUDED_FONTS: display-only faces that read poorly as body
  // text stay out of typeset.
  var EXCLUDED_FONTS = ["instrument-serif", "eb-garamond", "playfair-display"];

  var DEFAULTS = {
    body: "geist",
    heading: "inherit",
    mono: "geist-mono",
    scale: "15",
    measure: "80",
    flow: "1.25em",
    leading: "1.75",
    item: "docs",
  };
  var PARAM_KEYS = Object.keys(DEFAULTS);
  var LOCKABLE = PARAM_KEYS.filter(function (key) {
    return key !== "item";
  });

  var cfg = window.templCreateConfig;

  var params = null;
  var overrideValue = null; // hover preview, never committed (preview-override.tsx)
  var overrideTimer = null;
  var lastSentParams = null;
  var currentItem = null;
  var locks = new Set(); // use-locks.tsx, shuffle only
  var openPickerParam = null;
  var rawCss = null; // fetched /typeset.css for the copy button
  var isMac = MAC_REGEX.test(navigator.platform || navigator.userAgent);

  // use-history.tsx: entries of settled param snapshots.
  var historyEntries = [];
  var historyIndex = 0;
  var historyMaxIndex = 0;
  var historyInited = false;

  // ----- fonts (lib/fonts.ts) ------------------------------------------------

  var FONTS = (cfg ? cfg.FONTS : [])
    .filter(function (f) {
      return EXCLUDED_FONTS.indexOf(f.value) === -1;
    })
    .map(function (f) {
      return {
        id: f.value,
        label: f.name,
        type: f.type,
        value: "var(" + f.previewVariable + "), " + f.family,
        family: f.family,
        dependency: f.dependency,
      };
    });

  function findFont(id) {
    return FONTS.find(function (f) {
      return f.id === id;
    });
  }

  function fontIds() {
    return FONTS.map(function (f) {
      return f.id;
    });
  }

  // ----- param model (lib/search-params.ts) ----------------------------------

  function paramValues(key) {
    switch (key) {
      case "body":
      case "mono":
        return fontIds();
      case "heading":
        return ["inherit"].concat(fontIds());
      case "scale":
        return SIZES.map(function (o) {
          return o.value;
        });
      case "measure":
        return MEASURES.map(function (o) {
          return o.value;
        });
      case "flow":
        return FLOWS.map(function (o) {
          return o.value;
        });
      case "leading":
        return LEADINGS.map(function (o) {
          return o.value;
        });
      case "item":
        return AVAILABLE_CONTENT;
    }
    return [];
  }

  // coerceTypesetValue: narrows a raw string to the param's values, or null.
  function coerce(key, value) {
    return paramValues(key).indexOf(value) !== -1 ? value : null;
  }

  function readParams() {
    var sp = new URLSearchParams(window.location.search);
    var result = {};
    PARAM_KEYS.forEach(function (key) {
      var value = sp.get(key);
      result[key] = value !== null && coerce(key, value) !== null ? value : DEFAULTS[key];
    });
    return result;
  }

  // useTypesetSearchParams: shallow updates with history "replace"; values at
  // their default clear from the URL (nuqs clearOnDefault).
  function writeURL() {
    var url = new URL(window.location.href);
    PARAM_KEYS.forEach(function (key) {
      if (params[key] === DEFAULTS[key]) url.searchParams.delete(key);
      else url.searchParams.set(key, params[key]);
    });
    history.replaceState(null, "", url);
  }

  function setParams(updates) {
    Object.keys(updates).forEach(function (key) {
      if (PARAM_KEYS.indexOf(key) === -1) return;
      var value = updates[key];
      if (value === null) params[key] = DEFAULTS[key];
      else if (coerce(key, value) !== null) params[key] = value;
    });
    writeURL();
    recordHistory();
    syncPreview();
    render();
  }

  // ----- undo/redo (use-history.tsx) -----------------------------------------

  // A history entry is a snapshot of every typeset param as it sits in the
  // URL; absent keys snapshot as null so restoring clears them back to their
  // default.
  function currentSnapshot() {
    var sp = new URLSearchParams(window.location.search);
    var snapshot = {};
    PARAM_KEYS.forEach(function (key) {
      snapshot[key] = sp.get(key);
    });
    return JSON.stringify(snapshot);
  }

  function recordHistory() {
    var snapshot = currentSnapshot();
    // Seed the stack with the first snapshot (no undo available yet).
    if (!historyInited) {
      historyInited = true;
      historyEntries = [snapshot];
      historyIndex = 0;
      historyMaxIndex = 0;
      renderHistoryItems();
      return;
    }
    if (snapshot === historyEntries[historyIndex]) return;
    historyEntries = historyEntries.slice(0, historyIndex + 1);
    historyEntries.push(snapshot);
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

  // parseTypesetSnapshot: values are validated against the param model,
  // unknown keys are dropped, absent keys become null so defaults clear.
  function parseSnapshot(raw) {
    var parsed = {};
    try {
      var json = JSON.parse(raw);
      if (json && typeof json === "object" && !Array.isArray(json)) parsed = json;
    } catch (e) {
      // Malformed entries restore as all-null, clearing back to defaults.
    }
    var snapshot = {};
    PARAM_KEYS.forEach(function (key) {
      var value = parsed[key];
      snapshot[key] = typeof value === "string" ? coerce(key, value) : null;
    });
    return snapshot;
  }

  function restore(entry) {
    var snapshot = parseSnapshot(entry);
    PARAM_KEYS.forEach(function (key) {
      params[key] = snapshot[key] === null ? DEFAULTS[key] : snapshot[key];
    });
    writeURL();
    syncPreview();
    render();
    renderHistoryItems();
  }

  function goBack() {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    restore(historyEntries[historyIndex]);
  }

  function goForward() {
    if (historyIndex >= historyMaxIndex) return;
    historyIndex += 1;
    restore(historyEntries[historyIndex]);
  }

  // ----- preview iframe sync (preview.tsx) -----------------------------------

  function frameEl() {
    return document.querySelector("[data-templ-typeset-preview]");
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

  // serializeTypesetSearchParams onto the preview route: only non-default
  // params land in the query.
  function previewSrc(p) {
    var sp = new URLSearchParams();
    PARAM_KEYS.forEach(function (key) {
      if (key !== "item" && p[key] !== DEFAULTS[key]) sp.set(key, p[key]);
    });
    var query = sp.toString();
    return "/preview/typeset/" + (p.item || DEFAULTS.item) + (query ? "?" + query : "");
  }

  // Overrides never contain item, so the reload branch is only ever driven by
  // committed changes; everything else goes over postMessage with a
  // content-identical re-send guard (each message triggers a full param sync
  // in the iframe).
  function syncPreview() {
    var frame = frameEl();
    if (!frame) return;
    var merged = mergedParams();
    if (merged.item !== currentItem) {
      currentItem = merged.item;
      lastSentParams = null;
      frame.src = previewSrc(merged);
      return;
    }
    if (isSameParams(lastSentParams, merged)) return;
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage(
      { type: "typeset-params", data: merged },
      window.location.origin
    );
    // Copy: mergedParams() returns the live params object when no override is
    // active, and setParams mutates it in place. Storing the reference would
    // make the re-send guard compare params against itself forever.
    lastSentParams = Object.assign({}, merged);
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
      syncPreview();
    }, PREVIEW_OVERRIDE_DEBOUNCE_MS);
  }

  function clearOverride() {
    if (overrideTimer !== null) {
      clearTimeout(overrideTimer);
      overrideTimer = null;
    }
    if (overrideValue === null) return;
    overrideValue = null;
    syncPreview();
  }

  // ----- shuffle / reset (use-shuffle.tsx) -----------------------------------

  function randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  // Randomize the type design (fonts + size/measure/rhythm). Leaves item (the
  // specimen) alone; locked params keep their current value.
  function shuffle() {
    var bodyFonts = FONTS.filter(function (f) {
      return f.type !== "mono";
    }).map(function (f) {
      return f.id;
    });
    var monoFonts = FONTS.filter(function (f) {
      return f.type === "mono";
    }).map(function (f) {
      return f.id;
    });
    var next = {
      body: randomItem(bodyFonts),
      heading: randomItem(["inherit"].concat(bodyFonts)),
      mono: randomItem(monoFonts),
      scale: randomItem(paramValues("scale")),
      measure: randomItem(paramValues("measure")),
      leading: randomItem(paramValues("leading")),
      flow: randomItem(paramValues("flow")),
    };
    locks.forEach(function (param) {
      delete next[param];
    });
    setParams(next);
  }

  // null clears every managed key back to its default (including item).
  function reset() {
    var next = {};
    PARAM_KEYS.forEach(function (key) {
      next[key] = null;
    });
    setParams(next);
  }

  function toggleTheme() {
    if (window.themeUtils) window.themeUtils.cycleTheme();
  }

  // ----- picker popups (picker.tsx behavior, like create.js) -----------------

  function contentFor(param) {
    return document.querySelector('[data-templ-typeset-content="' + param + '"]');
  }

  function triggerFor(param) {
    return document.querySelector('[data-templ-typeset-trigger="' + param + '"]');
  }

  function customizerCard() {
    return document.querySelector('[data-templ-typeset] [data-slot="card"]');
  }

  function shieldEl() {
    return document.querySelector("[data-templ-typeset-shield]");
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function enabledItems(content) {
    return Array.from(
      content.querySelectorAll("[data-templ-typeset-item], [data-templ-typeset-action]")
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
    // onOpenChange(false) clears the hover preview (font/option-picker.tsx).
    clearOverride();
  }

  function previewItem(item) {
    if (isMobileViewport()) return;
    var group = item.closest("[data-templ-typeset-radiogroup]");
    var name = group && group.getAttribute("data-templ-typeset-radiogroup");
    if (!name) return;
    var value = coerce(name, item.getAttribute("data-value"));
    if (value !== null) {
      var override = {};
      override[name] = value;
      setOverride(override);
    }
  }

  // ----- docs panel (docs-panel.tsx) -----------------------------------------

  function measureWidth(value) {
    var entry = MEASURES.find(function (o) {
      return o.value === value;
    });
    return entry ? entry.width : "";
  }

  function pickedFonts() {
    var picks = [params.body, params.heading, params.mono].filter(function (id) {
      return id !== "inherit" && findFont(id);
    });
    var seen = [];
    picks.forEach(function (id) {
      if (seen.indexOf(id) === -1) seen.push(id);
    });
    return seen.map(findFont);
  }

  function presetName() {
    return "typeset-" + params.item;
  }

  function presetCss() {
    var headingId = params.heading === "inherit" ? params.body : params.heading;
    return (
      "." + presetName() + " {\n" +
      "  --typeset-font-body: var(--font-" + params.body + ");\n" +
      "  --typeset-font-heading: var(--font-" + headingId + ");\n" +
      "  --typeset-font-mono: var(--font-" + params.mono + ");\n" +
      "  --typeset-size: " + params.scale + "px;\n" +
      "  --typeset-leading: " + params.leading + ";\n" +
      "  --typeset-flow: " + params.flow + ";\n" +
      "}"
    );
  }

  function presetBlock() {
    return '/* globals.css */\n@import "tailwindcss";\n@import "./typeset.css";\n\n' + presetCss();
  }

  function usageBlock() {
    return (
      '<div class="typeset ' + presetName() + " max-w-[" + measureWidth(params.measure) + ']">\n' +
      "\t@templ.Raw(content)\n" +
      "</div>"
    );
  }

  // getFontsourceCss, over Fontsource's CDN: same files as the npm
  // packages, no package manager needed (the templ pendant of their
  // fontsource branch).
  function fontsourceCDN(dependency) {
    if (dependency.indexOf("@fontsource-variable/") === 0) {
      return "https://cdn.jsdelivr.net/fontsource/css/" + dependency.slice("@fontsource-variable/".length) + ":vf@latest/wght.css";
    }
    return "https://cdn.jsdelivr.net/fontsource/css/" + dependency.slice("@fontsource/".length) + "@latest/index.css";
  }

  function fontsCss() {
    var fonts = pickedFonts();
    return [
      "/* globals.css */",
    ]
      .concat(
        fonts.map(function (f) {
          return '@import "' + fontsourceCDN(f.dependency) + '";';
        })
      )
      .concat([
        "",
        ":root {",
      ])
      .concat(
        fonts.map(function (f) {
          return "  --font-" + f.id + ": " + f.family + ";";
        })
      )
      .concat(["}"])
      .join("\n");
  }

  function fontStep() {
    return (
      "Load the fonts from Fontsource's CDN (no package manager needed) by importing them in the main CSS file:\n\n" +
      fontsCss()
    );
  }

  // The install prompt (docs-panel.tsx), with the templ/Go surfaces in step 5
  // where shadcn lists the React ones.
  function promptText() {
    var baseEl = document.querySelector("[data-templ-typeset-base]");
    var origin = (baseEl && baseEl.getAttribute("data-templ-typeset-base")) || window.location.origin;
    return (
      "Install shadcn-templ/typeset in this project.\n\n" +
      "Typeset is a single stylesheet that styles rendered markdown: wrap the output in a `typeset` container and everything inside (headings, lists, tables, code, blockquotes, math) is styled. Everything outside is untouched.\n\n" +
      "1. Download " + origin + "/typeset.css and save it as typeset.css next to the project's main CSS file (where Tailwind is imported). If the file already exists, replace it with the downloaded copy.\n\n" +
      '2. Import it in the main CSS file, after the Tailwind import:\n\n@import "./typeset.css";\n\n' +
      "3. " + fontStep() + "\n\n" +
      "4. Add this preset to the main CSS file, after the typeset import. If a class named ." + presetName() + " already exists, update its values in place. Leave any other typeset-* presets untouched: they are separate surfaces:\n\n" +
      presetCss() + "\n\n" +
      "5. Do not apply the class anywhere yet. Search the project for surfaces that render markdown or rich content: goldmark or another markdown renderer, templ.Raw or template.HTML with parsed markdown, prose classes, CMS content renderers. Present the candidates you find as a short list and ask the user which surface should use typeset. Then wrap only the surface they pick:\n\n" +
      usageBlock() + "\n\n" +
      "If the picked surface already has its own typography (a prose class, styled markdown components), list those styles and let the user decide what to remove before wrapping.\n\n" +
      "Notes:\n\n" +
      "- To exclude an embedded component from typeset styles, add the not-typeset class or the data-not-typeset attribute to it.\n" +
      "- Verify on the surface the user picked: headings, lists, tables, and code inside the container should be styled with no classes on the content itself.\n" +
      "- Docs: " + origin + "/docs/typeset"
    );
  }

  function setAllText(selector, text) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.textContent = text;
    });
  }

  function renderDocs() {
    setAllText("[data-templ-typeset-preset-code]", presetBlock());
    setAllText("[data-templ-typeset-usage-code]", usageBlock());
    setAllText("[data-templ-typeset-fonts-css]", fontsCss());
    setAllText("[data-templ-typeset-prompt]", promptText());
    document.querySelectorAll("[data-templ-typeset-copy-css]").forEach(function (button) {
      button.disabled = rawCss === null;
    });
  }

  // ----- copy buttons (docs-panel.tsx CopyCssButton / CopyPromptButton) ------

  function flashCopied(button) {
    var copyIcon = button.querySelector('[data-templ-typeset-copy-icon="copy"]');
    var checkIcon = button.querySelector('[data-templ-typeset-copy-icon="check"]');
    if (copyIcon) copyIcon.hidden = true;
    if (checkIcon) checkIcon.hidden = false;
    clearTimeout(button.__templCopyTimer);
    button.__templCopyTimer = setTimeout(function () {
      if (copyIcon) copyIcon.hidden = false;
      if (checkIcon) checkIcon.hidden = true;
    }, 2000);
  }

  function copyText(button, text) {
    if (!text || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(function () {
        flashCopied(button);
      })
      .catch(function () {});
  }

  // ----- rendering ------------------------------------------------------------

  function setValue(param, text) {
    var el = document.querySelector('[data-templ-typeset-value="' + param + '"]');
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

  function optionLabel(options, value) {
    var entry = options.find(function (o) {
      return o.value === value;
    });
    return entry ? entry.label : "";
  }

  function syncGroup(name) {
    var group = document.querySelector('[data-templ-typeset-radiogroup="' + name + '"]');
    if (!group) return;
    var value = params[name];
    group.querySelectorAll("[data-templ-typeset-item]").forEach(function (item) {
      var checked = item.getAttribute("data-value") === value;
      item.setAttribute("data-checked", String(checked));
      item.setAttribute("aria-checked", String(checked));
      var indicator = item.querySelector('[data-slot="dropdown-menu-radio-item-indicator"]');
      if (indicator) indicator.hidden = !checked;
    });
  }

  function renderLocks() {
    document.querySelectorAll("[data-templ-typeset-lock]").forEach(function (button) {
      var locked = locks.has(button.getAttribute("data-templ-typeset-lock"));
      button.setAttribute("data-locked", String(locked));
      button.title = locked ? "Unlock" : "Lock";
      button.setAttribute("aria-label", locked ? "Unlock" : "Lock");
      var lockedIcon = button.querySelector('[data-templ-typeset-lock-icon="locked"]');
      var unlockedIcon = button.querySelector('[data-templ-typeset-lock-icon="unlocked"]');
      if (lockedIcon) lockedIcon.hidden = !locked;
      if (unlockedIcon) unlockedIcon.hidden = locked;
    });
  }

  function renderHistoryItems() {
    setDisabled(document.querySelector('[data-templ-typeset-action="undo"]'), !canGoBack());
    setDisabled(document.querySelector('[data-templ-typeset-action="redo"]'), !canGoForward());
  }

  function setupShortcutLabels() {
    var labels = {
      undo: isMac ? "⌘Z" : "Ctrl+Z",
      redo: isMac ? "⇧⌘Z" : "Ctrl+Shift+Z",
    };
    Object.keys(labels).forEach(function (key) {
      var el = document.querySelector('[data-templ-typeset-shortcut="' + key + '"]');
      if (el) el.textContent = labels[key];
    });
  }

  function render() {
    var p = params;
    var bodyFont = findFont(p.body) || FONTS[0];
    var headingFont = p.heading === "inherit" ? bodyFont : findFont(p.heading) || bodyFont;
    var monoFont = findFont(p.mono) || bodyFont;

    // Trigger labels (font-picker.tsx / option-picker.tsx).
    setValue("body", bodyFont ? bodyFont.label : "");
    setValue("heading", headingFont ? headingFont.label : "");
    setValue("mono", monoFont ? monoFont.label : "");
    setValue("measure", optionLabel(MEASURES, p.measure));
    setValue("scale", optionLabel(SIZES, p.scale));
    setValue("leading", optionLabel(LEADINGS, p.leading));
    setValue("flow", optionLabel(FLOWS, p.flow));

    // Aa indicators in the current families.
    var indicators = { body: bodyFont, heading: headingFont, mono: monoFont };
    Object.keys(indicators).forEach(function (param) {
      var el = document.querySelector('[data-templ-typeset-indicator="' + param + '"]');
      if (el && indicators[param]) el.style.fontFamily = indicators[param].value;
    });

    // Inherit item label = current body font (font-picker.tsx bodyFont.label).
    var inheritItem = document.querySelector(
      '[data-templ-typeset-content="heading"] [data-value="inherit"]'
    );
    if (inheritItem && bodyFont) {
      var textNode = Array.from(inheritItem.childNodes).find(function (node) {
        return node.nodeType === Node.TEXT_NODE && node.nodeValue.trim();
      });
      if (textNode) textNode.nodeValue = bodyFont.label;
      else inheritItem.appendChild(document.createTextNode(bodyFont.label));
    }

    // Radio checks.
    ["measure", "heading", "body", "mono", "scale", "leading", "flow"].forEach(syncGroup);

    // Toolbar pills + open in new tab (toolbar.tsx).
    document.querySelectorAll("[data-templ-typeset-fixture]").forEach(function (button) {
      button.setAttribute(
        "data-active",
        String(button.getAttribute("data-templ-typeset-fixture") === p.item)
      );
    });
    var open = document.querySelector("[data-templ-typeset-open]");
    if (open) open.setAttribute("href", previewSrc(p));

    renderDocs();
    renderLocks();
    renderHistoryItems();
  }

  // ----- get code drawer direction (get-code-drawer.tsx) ---------------------

  // shadcn swaps swipeDirection={isMobile ? "down" : "right"}; the drawer's
  // popup reads its data attributes live, so flipping them per viewport is
  // the SSR pendant.
  function syncDrawerDirection() {
    var dialog = document.getElementById("typeset-get-code");
    if (!dialog) return;
    var popup = dialog.querySelector('[data-slot="drawer-popup"]');
    if (!popup) return;
    var mobile = isMobileViewport();
    popup.setAttribute("data-swipe-direction", mobile ? "down" : "right");
    popup.setAttribute("data-swipe-axis", mobile ? "y" : "x");
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
      case "shuffle":
        shuffle();
        break;
      case "toggle-theme":
        toggleTheme();
        break;
      case "undo":
        goBack();
        break;
      case "redo":
        goForward();
        break;
      case "reset":
        reset();
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
        if (active instanceof Element && active.closest("[data-templ-typeset-content]")) {
          e.preventDefault();
          active.click();
          return;
        }
      }
    }

    // use-history: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Ctrl+Y.
    if (e.metaKey || e.ctrlKey) {
      if (isEditableTarget(e.target)) return;
      var key = e.key.toLowerCase();
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

    // main-menu.tsx: R shuffles, Shift+R resets.
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      if (e.shiftKey) reset();
      else shuffle();
      return;
    }
    // use-theme-toggle: D toggles light/dark.
    if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      toggleTheme();
    }
  }

  // preview.tsx handleMessage: the iframe forwards its shortcuts as typed
  // typeset-command messages; handle them here by calling the real actions.
  function handleMessage(event) {
    var frame = frameEl();
    var frameWindow = frame && frame.contentWindow;
    if (
      !frameWindow ||
      event.origin !== window.location.origin ||
      event.source !== frameWindow ||
      !event.data ||
      typeof event.data !== "object" ||
      event.data.type !== "typeset-command"
    ) {
      return;
    }

    var commands = {
      shuffle: shuffle,
      reset: reset,
      undo: goBack,
      redo: goForward,
      "toggle-theme": toggleTheme,
    };
    var command = event.data.command;
    if (typeof command === "string" && commands.hasOwnProperty(command)) {
      commands[command]();
    }
  }

  // ----- wiring ---------------------------------------------------------------

  function init() {
    if (!document.querySelector("[data-templ-typeset]")) return;
    if (!cfg) return;

    params = readParams();
    recordHistory();
    setupShortcutLabels();

    var frame = frameEl();
    if (frame) {
      frame.addEventListener("load", function () {
        lastSentParams = null;
        syncPreview();
      });
      currentItem = params.item;
      frame.src = previewSrc(params);
    }

    render();
    syncDrawerDirection();

    // The raw stylesheet for the Copy typeset.css button, fetched live so
    // the copy is never a stale snapshot.
    fetch("/typeset.css")
      .then(function (response) {
        return response.text();
      })
      .then(function (text) {
        rawCss = text;
        renderDocs();
      })
      .catch(function () {});

    // Open/close pickers. pointerdown, like Base UI's trigger.
    document.addEventListener("pointerdown", function (e) {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest("[data-templ-typeset-content]")) return;
      var trigger = e.target.closest("[data-templ-typeset-trigger]");
      if (trigger) {
        var param = trigger.getAttribute("data-templ-typeset-trigger");
        if (openPickerParam === param) closePicker();
        else openPicker(param);
        return;
      }
      if (openPickerParam) closePicker();
    });

    document.addEventListener("click", function (e) {
      if (!(e.target instanceof Element)) return;

      var item = e.target.closest("[data-templ-typeset-item]");
      if (item && item.closest("[data-templ-typeset-content]")) {
        if (item.hasAttribute("data-disabled")) return;
        var group = item.closest("[data-templ-typeset-radiogroup]");
        var name = group && group.getAttribute("data-templ-typeset-radiogroup");
        if (name) {
          var value = coerce(name, item.getAttribute("data-value"));
          if (value !== null) {
            var updates = {};
            updates[name] = value;
            setParams(updates);
          }
        }
        // PickerRadioItem closeOnClick={isMobile}: desktop keeps the menu open.
        if (isMobileViewport()) closePicker();
        return;
      }

      var action = e.target.closest("[data-templ-typeset-action]");
      if (action) {
        if (action.hasAttribute("data-disabled")) return;
        closePicker();
        runMenuAction(action.getAttribute("data-templ-typeset-action"));
        return;
      }

      if (e.target.closest("[data-templ-typeset-shuffle]")) {
        shuffle();
        return;
      }

      var pill = e.target.closest("[data-templ-typeset-fixture]");
      if (pill) {
        setParams({ item: pill.getAttribute("data-templ-typeset-fixture") });
        return;
      }

      var copyCss = e.target.closest("[data-templ-typeset-copy-css]");
      if (copyCss) {
        copyText(copyCss, rawCss);
        return;
      }

      var copyPrompt = e.target.closest("[data-templ-typeset-copy-prompt]");
      if (copyPrompt) {
        copyText(copyPrompt, promptText());
      }
    });

    // Hover previews: mousemove re-arms the trailing timer while the cursor
    // moves; focus covers keyboard browsing (picker.tsx PickerRadioItem).
    document.addEventListener("mousemove", function (e) {
      if (!(e.target instanceof Element)) return;
      var item = e.target.closest("[data-templ-typeset-item]");
      if (!item || !item.closest("[data-templ-typeset-content]")) return;
      if (item.hasAttribute("data-disabled")) return;
      if (document.activeElement !== item) item.focus({ preventScroll: true });
      previewItem(item);
    });

    document.addEventListener("focusin", function (e) {
      if (!(e.target instanceof Element)) return;
      var item = e.target.closest("[data-templ-typeset-item]");
      if (!item || !item.closest("[data-templ-typeset-content]")) return;
      if (item.hasAttribute("data-disabled")) return;
      previewItem(item);
    });

    // Leaving the popup reverts the preview instantly (PickerContent
    // onMouseLeave={clearOverride}).
    document.querySelectorAll("[data-templ-typeset-content]").forEach(function (content) {
      content.addEventListener("mouseleave", function () {
        clearOverride();
      });
    });

    // Lock buttons (shuffle only).
    document.querySelectorAll("[data-templ-typeset-lock]").forEach(function (button) {
      button.addEventListener("click", function () {
        var param = button.getAttribute("data-templ-typeset-lock");
        if (LOCKABLE.indexOf(param) === -1) return;
        if (locks.has(param)) locks.delete(param);
        else locks.add(param);
        renderLocks();
      });
    });

    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("message", handleMessage);

    // Browser back/forward re-resolves the URL (nuqs re-read pendant).
    window.addEventListener("popstate", function () {
      params = readParams();
      recordHistory();
      syncPreview();
      render();
    });

    window.addEventListener("resize", function () {
      syncDrawerDirection();
      if (!openPickerParam) return;
      var trigger = triggerFor(openPickerParam);
      var content = contentFor(openPickerParam);
      if (trigger && content) positionPopup(openPickerParam, trigger, content);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
