// Uses window.FloatingUIDOM from components/floatingui (loaded in the same bundle).
(function () {
  // Constants from Base UI's combobox, shadcn's reference implementation.
  const EXIT_MS = 120; // exit animation (duration-100) + slack
  const SIDE_OFFSET = 6;
  const COLLISION_PADDING = 5;

  function allContents() {
    return document.querySelectorAll("[data-tui-combobox-content]");
  }

  // The anchor is the input group, chips container or button trigger OUTSIDE
  // the content (an input group inside the popup also carries the attribute
  // but never anchors the position).
  function anchorFor(content) {
    return [...document.querySelectorAll('[data-tui-combobox-anchor="' + content.id + '"]')].find(
      (a) => !content.contains(a),
    );
  }

  function contentFor(el) {
    const anchor = el.closest("[data-tui-combobox-anchor]");
    return anchor ? document.getElementById(anchor.getAttribute("data-tui-combobox-anchor")) : null;
  }

  // What the popup is positioned against, like shadcn's runtime: the chips
  // container or a button trigger anchor as a whole, but for an input group
  // the INPUT CONTROL itself (Base UI's inputElement default) — that is why
  // shadcn's min-w adds --spacing(7) and the input-group example uses
  // alignOffset -28.
  function positionAnchorFor(content) {
    const anchor = anchorFor(content);
    if (!anchor) return null;
    if (
      anchor.hasAttribute("data-tui-combobox-chips") ||
      anchor.hasAttribute("data-tui-combobox-trigger")
    ) {
      return anchor;
    }
    return anchor.querySelector("[data-tui-combobox-input]") || anchor;
  }

  // The filter input sits in the anchor, or inside the popup (button-trigger
  // pattern).
  function inputFor(content) {
    const anchor = anchorFor(content);
    return (
      (anchor && anchor.querySelector("[data-tui-combobox-input]")) ||
      content.querySelector("[data-tui-combobox-input]")
    );
  }

  function valueDisplayFor(content) {
    const anchor = anchorFor(content);
    return anchor ? anchor.querySelector("[data-tui-combobox-value-display]") : null;
  }

  function setExpanded(content, expanded) {
    const input = inputFor(content);
    if (input) input.setAttribute("aria-expanded", expanded ? "true" : "false");
    const anchor = anchorFor(content);
    if (anchor && anchor.hasAttribute("data-tui-combobox-trigger")) {
      anchor.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
  }

  function popupFor(content) {
    return content.querySelector("[data-tui-combobox-popup]");
  }

  function listFor(content) {
    return content.querySelector("[data-tui-combobox-list]");
  }

  function itemsOf(content) {
    return [...content.querySelectorAll("[data-tui-combobox-item]")];
  }

  function labelOf(item) {
    return item.getAttribute("data-tui-combobox-label") || item.textContent.trim();
  }

  function isMultiple(content) {
    const popup = popupFor(content);
    // data-chips is always rendered as "true"/"false" (React stringifies
    // data-* booleans the same way), so the value decides, not presence.
    return popup && popup.getAttribute("data-chips") === "true";
  }

  function selectedItems(content) {
    return itemsOf(content).filter((i) => i.hasAttribute("data-selected"));
  }

  function setState(content, state) {
    const open = state === "open";
    content.toggleAttribute("data-open", open);
    content.toggleAttribute("data-closed", !open);
    const popup = popupFor(content);
    if (popup) {
      popup.toggleAttribute("data-open", open);
      popup.toggleAttribute("data-closed", !open);
    }
  }

  function setSide(content, side) {
    content.setAttribute("data-side", side);
    const popup = popupFor(content);
    if (popup) popup.setAttribute("data-side", side);
  }

  function sideOffsetOf(content) {
    const v = parseFloat(content.getAttribute("data-tui-combobox-side-offset"));
    return isNaN(v) ? SIDE_OFFSET : v;
  }

  // Base UI zooms the popup out of the anchor's center point (e.g.
  // "128px -4px"), not out of a placement corner.
  function anchorOrigin(result, anchorRect, sideOffset) {
    const side = result.placement.split("-")[0];
    const centerX = anchorRect.left + anchorRect.width / 2 - result.x + "px";
    const centerY = anchorRect.top + anchorRect.height / 2 - result.y + "px";
    if (side === "bottom") return centerX + " " + -sideOffset + "px";
    if (side === "top") return centerX + " calc(100% + " + sideOffset + "px)";
    if (side === "right") return -sideOffset + "px " + centerY;
    return "calc(100% + " + sideOffset + "px) " + centerY;
  }

  // Moves the content to <body> (shadcn portals it the same way).
  // The unmount half of the React portal pendant: a portaled content lives
  // as long as its SSR declaration site (_tuiPortalOwner) stays in the
  // document. Trigger-presence heuristics judged mid-swap moments wrongly -
  // multi-phase swap layers briefly disconnect the new triggers.
  function portal(content) {
    document.querySelectorAll("body > [data-tui-combobox-content]").forEach((c) => {
      if (c !== content && c._tuiPortalOwner && !c._tuiPortalOwner.isConnected) {
        stopAutoPositioning(c);
        c.remove();
      }
    });
    if (content.parentElement !== document.body) {
      if (!content._tuiPortalOwner) content._tuiPortalOwner = content.parentElement;
      document.body.appendChild(content);
    }
  }

  function position(content) {
    const anchor = positionAnchorFor(content);
    if (!anchor) return Promise.resolve();
    const { computePosition, offset, flip, shift, size } = window.FloatingUIDOM;
    const side = content.getAttribute("data-tui-combobox-side") || "bottom";
    const align = content.getAttribute("data-tui-combobox-align") || "start";
    const alignOffset = parseFloat(content.getAttribute("data-tui-combobox-align-offset")) || 0;
    const sideOffset = sideOffsetOf(content);
    const placement = align === "center" ? side : side + "-" + align;

    return computePosition(anchor, content, {
      placement: placement,
      strategy: "absolute",
      middleware: [
        offset({ mainAxis: sideOffset, crossAxis: alignOffset }),
        flip({ padding: COLLISION_PADDING }),
        shift({ padding: COLLISION_PADDING }),
        size({
          padding: COLLISION_PADDING,
          apply(args) {
            content.style.setProperty("--tui-combobox-available-height", args.availableHeight + "px");
            content.style.setProperty("--tui-combobox-available-width", args.availableWidth + "px");
            content.style.setProperty("--tui-combobox-anchor-width", args.rects.reference.width + "px");
          },
        }),
      ],
    }).then((result) => {
      content.style.left = result.x + "px";
      content.style.top = result.y + "px";
      setSide(content, result.placement.split("-")[0]);
      const popup = popupFor(content);
      if (popup) {
        popup.style.setProperty(
          "--tui-combobox-transform-origin",
          anchorOrigin(result, anchor.getBoundingClientRect(), sideOffset),
        );
      }
    });
  }

  function startAutoPositioning(content) {
    const anchor = positionAnchorFor(content);
    if (!anchor) return Promise.resolve();
    if (content._tuiPositionCleanup) content._tuiPositionCleanup();
    let resolveFirst;
    const firstPosition = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const update = () => position(content).then(resolveFirst, resolveFirst);
    content._tuiPositionCleanup = window.FloatingUIDOM.autoUpdate(anchor, content, update, {
      elementResize: typeof ResizeObserver !== "undefined",
      layoutShift: typeof IntersectionObserver !== "undefined",
    });
    return firstPosition;
  }

  function stopAutoPositioning(content) {
    if (!content._tuiPositionCleanup) return;
    content._tuiPositionCleanup();
    content._tuiPositionCleanup = null;
  }

  // ----- filtering ----------------------------------------------------------

  function applyFilter(content, query) {
    const q = query.trim().toLowerCase();
    let visible = 0;
    itemsOf(content).forEach((item) => {
      const match = q === "" || labelOf(item).toLowerCase().includes(q);
      item.hidden = !match;
      if (match) visible += 1;
    });
    content.querySelectorAll("[data-tui-combobox-group]").forEach((group) => {
      group.hidden = !group.querySelector("[data-tui-combobox-item]:not([hidden])");
    });
    const popup = popupFor(content);
    const list = listFor(content);
    popup.toggleAttribute("data-empty", visible === 0);
    if (list) list.toggleAttribute("data-empty", visible === 0);

    const highlighted = highlightedItem(content);
    if (highlighted && highlighted.hidden) setHighlight(content, null);
    if (!highlightedItem(content) && content.hasAttribute("data-tui-combobox-auto-highlight")) {
      setHighlight(content, visibleItems(content)[0] || null);
    }
  }

  function visibleItems(content) {
    return itemsOf(content).filter((i) => !i.hidden && !i.hasAttribute("data-disabled"));
  }

  // ----- highlight ----------------------------------------------------------

  function highlightedItem(content) {
    return content.querySelector("[data-tui-combobox-item][data-highlighted]");
  }

  function setHighlight(content, item) {
    itemsOf(content).forEach((i) => {
      if (i !== item) i.removeAttribute("data-highlighted");
    });
    if (item) {
      item.setAttribute("data-highlighted", "");
      item.scrollIntoView({ block: "nearest" });
    }
    // Focus stays on the input while the highlight moves, so
    // aria-activedescendant is the only thing naming the current option.
    const input = inputFor(content);
    if (!input) return;
    if (item && item.id) {
      input.setAttribute("aria-activedescendant", item.id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function moveHighlight(content, dir) {
    const items = visibleItems(content);
    if (!items.length) return;
    const current = highlightedItem(content);
    let index = items.indexOf(current);
    index = index === -1 ? (dir > 0 ? 0 : items.length - 1) : index + dir;
    index = Math.max(0, Math.min(items.length - 1, index));
    setHighlight(content, items[index]);
  }

  // ----- open / close -------------------------------------------------------

  function open(content) {
    if (content.hasAttribute("data-open")) return;
    allContents().forEach((c) => {
      if (c !== content) requestOpenChange(c, false);
    });
    clearTimeout(content._tuiHide);
    portal(content);
    // z-index portal like shadcn (no native top layer); re-append
    // keeps paint order = open order.
    document.body.appendChild(content);
    content.hidden = false;

    applyFilter(content, "");
    // Base UI highlights the current selection on open, else (with
    // autoHighlight) the first item.
    const selected = selectedItems(content).find((i) => !i.hidden);
    setHighlight(content, selected || null);
    if (!selected && content.hasAttribute("data-tui-combobox-auto-highlight")) {
      setHighlight(content, visibleItems(content)[0] || null);
    }

    // Position it invisibly first, then play the enter animation in place.
    content.style.visibility = "hidden";
    const finish = () => {
      // duration-100 transitions `all`; a visibility transition would
      // freeze at hidden in background tabs - flip suppressed.
      content.style.transitionProperty = "none";
      content.style.visibility = "";
      void content.offsetWidth;
      content.style.transitionProperty = "";
      if (content.hidden) return;
      setState(content, "open");
      setExpanded(content, true);
    };
    startAutoPositioning(content).then(finish, finish);
  }

  function close(content) {
    if (content.hidden) return;
    stopAutoPositioning(content);
    content.style.visibility = "";
    setState(content, "closed");
    setExpanded(content, false);
    const input = inputFor(content);
    if (input) {
      // Revert the typed text: an in-popup input is a pure search box, an
      // anchor input shows the selected label.
      input.value =
        isMultiple(content) || content.contains(input) ? "" : displayValue(content);
    }
    clearTimeout(content._tuiHide);
    content._tuiHide = setTimeout(() => {
      if (content.hasAttribute("data-closed") && !content.hidden) {
        content.hidden = true;
      }
    }, EXIT_MS);
  }

  function closeAll() {
  allContents().forEach((content) => requestOpenChange(content, false));
  }

  function requestOpenChange(content, nextOpen) {
  const anchor = anchorFor(content);
  const change = new CustomEvent("combobox-open-change", {
    bubbles: true,
    cancelable: true,
    detail: { open: nextOpen },
  });
  const accepted = (anchor || content).dispatchEvent(change);
  if (!accepted || content.hasAttribute("data-tui-combobox-open-controlled")) return false;
  if (nextOpen) open(content);
  else close(content);
  return true;
  }

  function displayValue(content) {
    const selected = selectedItems(content)[0];
    return selected ? labelOf(selected) : "";
  }

  // ----- selection ----------------------------------------------------------

  function hiddenInputs(anchor) {
    return [...anchor.querySelectorAll("[data-tui-combobox-hidden]")];
  }

  function dispatchNativeChange(anchor) {
    const first = hiddenInputs(anchor)[0];
    if (first) first.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function requestValueChange(content, values) {
  const controlled = content.hasAttribute("data-tui-combobox-value-controlled");
  const anchor = anchorFor(content);
  if (!anchor || content.hasAttribute("data-tui-combobox-readonly")) {
    return { accepted: false, controlled };
  }
  const change = new CustomEvent("combobox-change", {
    bubbles: true,
    cancelable: true,
    detail: { values },
  });
  const accepted = anchor.dispatchEvent(change);
  return { accepted, controlled };
  }

  function syncHiddenInputs(content, anchor) {
    const inputs = hiddenInputs(anchor);
    if (!inputs.length) return;
    const name = inputs[0].name;
    if (isMultiple(content)) {
      inputs.slice(1).forEach((i) => i.remove());
      const values = selectedItems(content).map((i) => i.getAttribute("data-tui-combobox-value") || "");
      const first = inputs[0];
      first.value = values[0] || "";
      values.slice(1).forEach((v) => {
        const clone = first.cloneNode();
        clone.value = v;
        first.parentElement.insertBefore(clone, first.nextSibling);
      });
    } else {
      const selected = selectedItems(content)[0];
      inputs[0].value = selected ? selected.getAttribute("data-tui-combobox-value") || "" : "";
    }
    inputs[0].name = name;
  }

  function syncChips(content, anchor) {
    if (!anchor.hasAttribute("data-tui-combobox-chips")) return;
    const template = anchor.querySelector("[data-tui-combobox-chip-template]");
    anchor.querySelectorAll("[data-tui-combobox-chip]").forEach((chip) => {
      if (!chip.closest("[data-tui-combobox-chip-template]")) chip.remove();
    });
    if (!template) return;
    const input = anchor.querySelector("[data-tui-combobox-input]");
    selectedItems(content).forEach((item) => {
      const chip = template.content.firstElementChild.cloneNode(true);
      chip.setAttribute("data-tui-combobox-value", item.getAttribute("data-tui-combobox-value") || "");
      chip.querySelector("[data-tui-combobox-chip-label]").textContent = labelOf(item);
      anchor.insertBefore(chip, input);
    });
  }

  function toggleClear(content, anchor) {
    const clear = anchor.querySelector("[data-tui-combobox-clear]");
    if (clear) clear.hidden = selectedItems(content).length === 0;
  }

  function syncValueDisplay(content) {
    const display = valueDisplayFor(content);
    if (!display) return;
    const label = displayValue(content);
    const text = label || display.getAttribute("data-tui-combobox-placeholder") || "";
    if (display.textContent !== text) display.textContent = text;
  }

  function afterSelectionChange(content) {
    const anchor = anchorFor(content);
    if (!anchor) return;
    syncChips(content, anchor);
    syncHiddenInputs(content, anchor);
    toggleClear(content, anchor);
    syncValueDisplay(content);
  dispatchNativeChange(anchor);
  }

  function selectItem(content, item) {
    const input = inputFor(content);
    if (isMultiple(content)) {
    const values = selectedItems(content).map((selected) => selected.getAttribute("data-tui-combobox-value") || "");
    const value = item.getAttribute("data-tui-combobox-value") || "";
    const nextValues = item.hasAttribute("data-selected")
      ? values.filter((selected) => selected !== value)
      : [...values, value];
    const request = requestValueChange(content, nextValues);
    if (!request.accepted || request.controlled) return;
      if (item.hasAttribute("data-selected")) item.removeAttribute("data-selected");
      else item.setAttribute("data-selected", "true");
      item.setAttribute("aria-selected", item.hasAttribute("data-selected") ? "true" : "false");
      afterSelectionChange(content);
      if (input) {
        input.value = "";
        input.focus();
      }
      applyFilter(content, "");
      position(content); // the chips anchor may have grown or shrunk
      return;
    }
  const nextValue = item.getAttribute("data-tui-combobox-value") || "";
  const request = requestValueChange(content, [nextValue]);
  if (!request.accepted) return;
  if (request.controlled) {
    requestOpenChange(content, false);
    return;
  }
    itemsOf(content).forEach((i) => {
      i.removeAttribute("data-selected");
      i.setAttribute("aria-selected", "false");
    });
    item.setAttribute("data-selected", "true");
    item.setAttribute("aria-selected", "true");
    if (input) input.value = labelOf(item);
    afterSelectionChange(content);
  requestOpenChange(content, false);
  }

  function clearSelection(content) {
  const request = requestValueChange(content, []);
  if (!request.accepted || request.controlled) return;
    itemsOf(content).forEach((i) => {
      i.removeAttribute("data-selected");
      i.setAttribute("aria-selected", "false");
    });
    const input = inputFor(content);
    if (input) {
      input.value = "";
      input.focus();
    }
    afterSelectionChange(content);
    applyFilter(content, "");
  }

  // Shows the selected item's label in the input (server only knows the
  // value, the label lives in the item). Runs on load and whenever new
  // comboboxes appear in the DOM; the MutationObserver keeps this
  // framework-agnostic.
  // Lift SSR'd contents out of their inert <template> wrappers into <body>,
  // replacing a stale portaled copy on re-swaps (e.g. htmx).
  function liftTemplates() {
    document.querySelectorAll("template[data-tui-combobox-portal]").forEach((tpl) => {
      const content = tpl.content.querySelector("[data-tui-combobox-content]");
      if (content) {
        const stale = document.getElementById(content.id);
        if (stale) {
          stopAutoPositioning(stale);
          stale.remove();
        }
        content._tuiPortalOwner = tpl.parentElement;
        document.body.appendChild(content);
      }
      tpl.remove();
    });
  }

  function init() {
    liftTemplates();
    allContents().forEach((content) => {
      if (anchorFor(content)) portal(content); // portal up front, like React on mount
    if (content.getAttribute("data-tui-combobox-initial-open") === "true") {
    content.removeAttribute("data-tui-combobox-initial-open");
    open(content);
    }
      if (isMultiple(content)) return;
      syncValueDisplay(content);
      const input = inputFor(content);
      if (!input || input.value !== "" || content.contains(input)) return;
      const label = displayValue(content);
      if (label) input.value = label;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // Re-init on any childList mutation, directly (never rAF-deferred: rAF
  // does not fire in hidden tabs or throttled iframes): swapped-in markup
  // lifts and wires itself, removals release portaled content through the
  // ownership sweep.
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });

  // ----- events -------------------------------------------------------------

  // Pointer interactions toggle and dismiss on PRESS, exactly like Base UI.
  // Click is never used for open/close, so the stray click the browser fires
  // on <body> when the popup ends up under the released pointer is harmless.
  function toggleTrigger(trigger) {
    const content = contentFor(trigger);
    if (!content) return;
    if (content.hasAttribute("data-open")) {
    requestOpenChange(content, false);
    } else {
      const input = inputFor(content);
      if (input && input.disabled) return;
    requestOpenChange(content, true);
      if (input) requestAnimationFrame(() => input.focus());
    }
  }

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;

    const trigger = e.target.closest("[data-tui-combobox-trigger]");
    if (trigger) {
      toggleTrigger(trigger);
      return;
    }

    // Clear and chip-remove buttons act on the selection, they never open.
    if (e.target.closest("[data-tui-combobox-clear], [data-tui-combobox-chip-remove]")) return;

    const anchor = e.target.closest("[data-tui-combobox-anchor]");
    if (anchor && !anchor.closest("[data-tui-combobox-content]")) {
      const content = document.getElementById(anchor.getAttribute("data-tui-combobox-anchor"));
      if (!content || content.hasAttribute("data-open")) return;
      const field = inputFor(content);
    if (field && !field.disabled) requestOpenChange(content, true);
      return;
    }

    // Base UI dismisses on outside PRESS, not on the later click.
    if (!e.target.closest("[data-tui-combobox-content]")) closeAll();
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;

    const remove = e.target.closest("[data-tui-combobox-chip-remove]");
    if (remove && !remove.closest("[data-tui-combobox-chip-template]")) {
      const chip = remove.closest("[data-tui-combobox-chip]");
      const content = contentFor(remove);
      if (chip && content) {
        const value = chip.getAttribute("data-tui-combobox-value");
        const item = itemsOf(content).find(
          (i) => (i.getAttribute("data-tui-combobox-value") || "") === value,
        );
    if (item) selectItem(content, item);
      }
      return;
    }

    const clear = e.target.closest("[data-tui-combobox-clear]");
    if (clear) {
      const content = contentFor(clear);
      if (content) clearSelection(content);
      return;
    }

    const trigger = e.target.closest("[data-tui-combobox-trigger]");
    if (trigger) {
      // Keyboard activation only (Enter/Space fire a detail-0 click without
      // a preceding pointerdown); pointer presses are handled on pointerdown.
      if (e.detail === 0) toggleTrigger(trigger);
      return;
    }

    const item = e.target.closest("[data-tui-combobox-item]");
    if (item && !item.hasAttribute("data-disabled")) {
      const content = item.closest("[data-tui-combobox-content]");
      if (content) selectItem(content, item);
    }
  });

  document.addEventListener("input", (e) => {
    if (!(e.target instanceof Element) || !e.target.hasAttribute("data-tui-combobox-input")) return;
    const content = contentFor(e.target);
    if (!content) return;
  if (!content.hasAttribute("data-open")) requestOpenChange(content, true);
    applyFilter(content, e.target.value);
    if (content.hasAttribute("data-open")) position(content);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAll();
      return;
    }
    if (!(e.target instanceof Element) || !e.target.hasAttribute("data-tui-combobox-input")) return;
    const content = contentFor(e.target);
    if (!content) return;
    const isOpen = content.hasAttribute("data-open");

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
    requestOpenChange(content, true);
        return;
      }
      moveHighlight(content, e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (e.key === "Enter") {
      const highlighted = isOpen && highlightedItem(content);
      if (highlighted) {
        e.preventDefault();
        selectItem(content, highlighted);
      }
      return;
    }
    if (e.key === "Backspace" && isMultiple(content) && e.target.value === "") {
      const chips = [...e.target.parentElement.querySelectorAll("[data-tui-combobox-chip]")].filter(
        (c) => !c.closest("[data-tui-combobox-chip-template]"),
      );
      const last = chips[chips.length - 1];
      if (last) {
        const btn = last.querySelector("[data-tui-combobox-chip-remove]");
        if (btn) btn.click();
      }
      return;
    }
    if (e.key === "Tab") {
    requestOpenChange(content, false);
    }
  });

  // Hovering an item highlights it, exactly like Base UI.
  document.addEventListener("mousemove", (e) => {
    if (!(e.target instanceof Element)) return;
    const item = e.target.closest("[data-tui-combobox-item]");
    if (!item || item.hasAttribute("data-disabled") || item.hasAttribute("data-highlighted")) return;
    const content = item.closest("[data-tui-combobox-content]");
    if (content && content.hasAttribute("data-open")) setHighlight(content, item);
  });

})();
