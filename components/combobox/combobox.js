(function () {
  // Constants from Base UI's combobox, shadcn's reference implementation.
  const SIDE_OFFSET = 6;

  // The combobox's element is the positioner (no slot upstream) around the
  // [data-slot=combobox-content] popup.
  const POPUP = '[data-slot="combobox-content"]';
  const ITEM = '[data-slot="combobox-item"]';
  const CHIP = '[data-slot="combobox-chip"]';
  // Base UI keeps the positioning anchor in context; the port marker names
  // the combobox it anchors.
  const ANCHOR = "[data-templ-combobox-anchor]";
  // The filter input: Base UI's ComboboxInput, role combobox.
  const INPUT = '[role="combobox"]';

  function isPositioner(el) {
    // The popup is the positioner's slotted child, next to the focus guards.
    return !!el?.querySelector?.(":scope > " + POPUP);
  }

  function allContents() {
    return [...document.querySelectorAll(POPUP)].map((p) => p.parentElement).filter(isPositioner);
  }

  function positionerOf(target) {
    const popup = target && target.closest && target.closest(POPUP);
    return popup && isPositioner(popup.parentElement) ? popup.parentElement : null;
  }

  // Base UI's ComboboxTrigger: aria-haspopup plus aria-controls naming the
  // combobox (not the role=combobox input).
  function triggerOf(target) {
    const trigger = target.closest && target.closest("[aria-haspopup][aria-controls]");
    if (!trigger || trigger.matches(INPUT)) return null;
    return isPositioner(document.getElementById(trigger.getAttribute("aria-controls"))) ? trigger : null;
  }

  // A popup-pattern anchor is the trigger button itself.
  function isTriggerAnchor(anchor) {
    return anchor.hasAttribute("aria-haspopup");
  }

  // The anchor is the input group, chips container or button trigger OUTSIDE
  // the content (an input group inside the popup also carries the attribute
  // but never anchors the position).
  function anchorFor(content) {
    return [...document.querySelectorAll('[data-templ-combobox-anchor="' + content.id + '"]')].find(
      (a) => !content.contains(a),
    );
  }

  function contentFor(el) {
    const anchor = el.closest(ANCHOR);
    return anchor ? document.getElementById(anchor.getAttribute("data-templ-combobox-anchor")) : null;
  }

  // What the popup is positioned against, like shadcn's runtime: the chips
  // container or a button trigger anchor as a whole, but for an input group
  // the INPUT CONTROL itself (Base UI's inputElement default) — that is why
  // shadcn's min-w adds --spacing(7) and the input-group example uses
  // alignOffset -28.
  function positionAnchorFor(content) {
    const anchor = anchorFor(content);
    if (!anchor) return null;
    if (anchor.matches('[data-slot="combobox-chips"]') || isTriggerAnchor(anchor)) {
      return anchor;
    }
    return anchor.querySelector(INPUT) || anchor;
  }

  // The filter input sits in the anchor, or inside the popup (button-trigger
  // pattern).
  function inputFor(content) {
    const anchor = anchorFor(content);
    return (
      (anchor && anchor.querySelector(INPUT)) ||
      content.querySelector(INPUT)
    );
  }

  function valueDisplayFor(content) {
    const anchor = anchorFor(content);
    return anchor ? anchor.querySelector('[data-slot="combobox-value"]') : null;
  }

  // The input and every trigger of this combobox (ComboboxInput and
  // ComboboxTrigger render aria-expanded, data-popup-open and data-pressed),
  // the popup-pattern anchor and the input group button.
  function setExpanded(content, expanded) {
    const input = inputFor(content);
    const triggers = document.querySelectorAll('[aria-haspopup][aria-controls="' + content.id + '"]');
    [input, ...triggers].forEach((t) => {
      if (!t) return;
      t.setAttribute("aria-expanded", expanded ? "true" : "false");
      t.toggleAttribute("data-popup-open", expanded);
      t.toggleAttribute("data-pressed", expanded);
    });
    // ComboboxClear renders the open state too.
    anchorFor(content)?.querySelectorAll('[data-slot="combobox-clear"]').forEach((clear) => {
      clear.toggleAttribute("data-popup-open", expanded);
    });
  }

  function popupFor(content) {
    return content.querySelector(":scope > " + POPUP);
  }

  function listFor(content) {
    return content.querySelector('[data-slot="combobox-list"]');
  }

  function itemsOf(content) {
    return [...content.querySelectorAll(ITEM)];
  }

  function labelOf(item) {
    return item.getAttribute("data-templ-label") || item.textContent.trim();
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

  // The popup renders the transition status, its positioner the open state.
  function partsOf(content) {
    return { positioner: content, parts: [popupFor(content)] };
  }


  function sideOffsetOf(content) {
    const v = parseFloat(content.getAttribute("data-templ-side-offset"));
    return isNaN(v) ? SIDE_OFFSET : v;
  }


  // The positioner's parent is the portal node, which moves to <body>
  // (shadcn portals it the same way).
  function portalNodeOf(content) {
    return content.parentElement;
  }

  function portal(content) {
    window.templ.portal.render(portalNodeOf(content));
  }

  // ComboboxInternalDismissButton: a visually hidden button for screen
  // readers, before the input and after the popup while the focus manager is
  // modal.
  function createDismissButton(content) {
    const button = document.createElement("span");
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", "Dismiss");
    button.style.cssText = "clip-path:inset(50%);overflow:hidden;white-space:nowrap;border:0;padding:0;width:1px;height:1px;margin:-1px;position:absolute";
    button.addEventListener("click", () => requestOpenChange(content, false));
    return button;
  }

  // ComboboxPopup's FloatingFocusManager. With the input in the anchor it is
  // modal but leaves focus in the input, so there are no guards and the
  // outside is hidden. With the input in the popup it is non modal and the
  // input takes the initial focus.
  function startFocusManager(content) {
    if (content._templFocus) {
      content._templFocus.open();
      return;
    }
    const input = inputFor(content);
    const popup = popupFor(content);
    const inputInsidePopup = !!input && content.contains(input);
    const modal = !inputInsidePopup;
    const trigger = document.querySelector('[aria-haspopup][aria-controls="' + content.id + '"]');
    if (modal) {
      content._templDismissButtons = [createDismissButton(content), createDismissButton(content)];
      input?.before(content._templDismissButtons[0]);
      popup.after(content._templDismissButtons[1]);
    }
    content._templFocus = window.templ.focusManager.useFloatingFocusManager({
      floating: content,
      reference: inputInsidePopup ? trigger : input || trigger,
      triggers: [input, ...document.querySelectorAll('[aria-haspopup][aria-controls="' + content.id + '"]')],
      modal,
      openInteractionType: content._templOpenMethod ?? null,
      initialFocus: inputInsidePopup ? (interactionType) => (interactionType === "touch" ? popup : input) : false,
      returnFocus: inputInsidePopup,
      getInsideElements: () => content._templDismissButtons || [],
      onOpenChange: (open) => requestOpenChange(content, open),
    });
  }

  function stopFocusManager(content) {
    content._templFocus?.unmount();
    content._templFocus = null;
    content._templDismissButtons?.forEach((button) => button.remove());
    content._templDismissButtons = null;
  }

  // ComboboxPositioner: useAnchorPositioning with the dropdown collision
  // avoidance and a lazy flip, so a filtered list that resizes does not flip
  // back and forth. autoUpdate follows the chips and the list resizing.
  function startAutoPositioning(content) {
    stopAutoPositioning(content);
    const anchor = positionAnchorFor(content);
    if (!anchor) return Promise.resolve();
    const positioning = window.templ.anchorPositioning.useAnchorPositioning({
      anchor,
      positioner: content,
      parts: [content, popupFor(content)],
      side: content.getAttribute("data-templ-side") || "bottom",
      align: content.getAttribute("data-templ-align") || "start",
      sideOffset: sideOffsetOf(content),
      alignOffset: parseFloat(content.getAttribute("data-templ-align-offset")) || 0,
      collisionAvoidance: { fallbackAxisSide: "none" },
      lazyFlip: true,
    });
    content._templPositionCleanup = positioning.cleanup;
    return positioning.positioned;
  }

  function stopAutoPositioning(content) {
    if (!content._templPositionCleanup) return;
    content._templPositionCleanup();
    content._templPositionCleanup = null;
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
    content.querySelectorAll('[data-slot="combobox-group"]').forEach((group) => {
      group.hidden = !group.querySelector(ITEM + ":not([hidden])");
    });
    const popup = popupFor(content);
    const list = listFor(content);
    popup.toggleAttribute("data-empty", visible === 0);
    if (list) list.toggleAttribute("data-empty", visible === 0);

    const highlighted = highlightedItem(content);
    if (highlighted && highlighted.hidden) setHighlight(content, null);
    // autoHighlight is Base UI's "input-change" mode: a query highlights the
    // first match, opening does not.
    if (q !== "" && content.hasAttribute("data-templ-auto-highlight")) {
      setHighlight(content, itemsOf(content).find((i) => !i.hidden) || null);
    }
  }

  // ----- highlight ----------------------------------------------------------

  function highlightedItem(content) {
    return content.querySelector(ITEM + "[data-highlighted]");
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

  function indexOf(content, item) {
    const index = item ? itemsOf(content).indexOf(item) : -1;
    return index === -1 ? null : index;
  }

  // AriaCombobox's useListNavigation: virtual focus, the input keeps focus
  // and names the highlighted item. Filtered out items are hidden, which the
  // list navigation skips, disabled items are highlighted (an empty
  // disabledIndices). Without autoHighlight the arrows escape the list back
  // to the input.
  function startListNavigation(content) {
    content._templNav = window.templ.listNavigation.useListNavigation({
      floating: popupFor(content),
      reference: inputFor(content),
      items: () => itemsOf(content),
      activeIndex: () => indexOf(content, highlightedItem(content)),
      selectedIndex: () => indexOf(content, selectedItems(content).find((i) => !i.hidden)),
      virtual: true,
      loopFocus: true,
      allowEscape: !content.hasAttribute("data-templ-auto-highlight"),
      disabledIndices: [],
      isOpen: () => content.hasAttribute("data-open"),
      onNavigate(index, event) {
        // Retain the highlight while transitioning out or closed.
        if ((!event && !content.hasAttribute("data-open")) || window.templ.transition.isEnding(popupFor(content))) return;
        setHighlight(content, index == null ? null : itemsOf(content)[index]);
      },
      onOpenChange(open) {
        const input = inputFor(content);
        if (!input?.disabled) requestOpenChange(content, open);
      },
    });
  }

  // ----- open / close -------------------------------------------------------

  function open(content) {
    if (content.hasAttribute("data-open")) return;
    allContents().forEach((c) => {
      if (c !== content) requestOpenChange(c, false);
    });
    portal(content);
    content._templDismiss ??= window.templ.dismiss.useDismiss({
      floating: content,
      reference: [inputFor(content), ...document.querySelectorAll('[aria-haspopup][aria-controls="' + content.id + '"]')],
      // The visual viewport can be small with the software keyboard open, so
      // a touch outside dismisses on the click, after a possible scroll.
      outsidePressEvent: { mouse: "sloppy", touch: "intentional" },
      outsidePress(event) {
        const target = event.target;
        return !anchorFor(content)?.contains(target) &&
          !target.closest?.('[data-slot="combobox-clear"], [data-slot="combobox-chips"]');
      },
      onOpenChange: (open) => requestOpenChange(content, open),
    });
    content.hidden = false;
    startFocusManager(content);

    // With autoHighlight the first item is highlighted, the list navigation
    // then highlights the current selection on open.
    applyFilter(content, "");

    // Positioned first, then the enter animation plays in place.
    const finish = () => {
      if (content.hidden) return;
      window.templ.transition.open(partsOf(content));
      setExpanded(content, true);
      content._templNav?.open();
    };
    startAutoPositioning(content).then(finish, finish);
  }

  function close(content) {
    if (content.hidden) return;
    content._templDismiss?.();
    content._templDismiss = null;
    content._templFocus?.close();
    content._templNav?.close();
    // Positioned until it unmounts, like Base UI. Unmounting the focus
    // manager returns focus and resets the highlight.
    window.templ.transition.close(partsOf(content), popupFor(content), () => {
      stopAutoPositioning(content);
      stopFocusManager(content);
      setHighlight(content, null);
      content.hidden = true;
    });
    setExpanded(content, false);
    const input = inputFor(content);
    if (input) {
      // Revert the typed text: an in-popup input is a pure search box, an
      // anchor input shows the selected label.
      input.value =
        isMultiple(content) || content.contains(input) ? "" : displayValue(content);
    }
  }

  function requestOpenChange(content, nextOpen) {
  const anchor = anchorFor(content);
  const change = new CustomEvent("combobox-open-change", {
    bubbles: true,
    cancelable: true,
    detail: { open: nextOpen },
  });
  const accepted = (anchor || content).dispatchEvent(change);
  if (!accepted || content.hasAttribute("data-templ-open")) return false;
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
    return [...anchor.querySelectorAll('input[type="hidden"]')];
  }

  function dispatchNativeChange(anchor) {
    const first = hiddenInputs(anchor)[0];
    if (first) first.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function requestValueChange(content, values) {
  // Controlled: the Base UI value prop, the owner commits.
  const controlled = content.hasAttribute("data-templ-value");
  const anchor = anchorFor(content);
  if (!anchor || content.hasAttribute("data-templ-read-only")) {
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
      const values = selectedItems(content).map((i) => i.getAttribute("data-templ-value") || "");
      const first = inputs[0];
      first.value = values[0] || "";
      values.slice(1).forEach((v) => {
        const clone = first.cloneNode();
        clone.value = v;
        first.parentElement.insertBefore(clone, first.nextSibling);
      });
    } else {
      const selected = selectedItems(content)[0];
      inputs[0].value = selected ? selected.getAttribute("data-templ-value") || "" : "";
    }
    inputs[0].name = name;
  }

  function syncChips(content, anchor) {
    if (!anchor.matches('[data-slot="combobox-chips"]')) return;
    // The chip template the chips container renders last; a template's
    // content is not part of the document, so querySelectorAll skips it.
    const template = anchor.querySelector(":scope > template");
    anchor.querySelectorAll(CHIP).forEach((chip) => chip.remove());
    if (!template) return;
    const input = anchor.querySelector(INPUT);
    selectedItems(content).forEach((item) => {
      const chip = template.content.firstElementChild.cloneNode(true);
      chip.setAttribute("data-templ-value", item.getAttribute("data-templ-value") || "");
      // The chip's label is its first child, the remove button follows.
      chip.firstElementChild.textContent = labelOf(item);
      anchor.insertBefore(chip, input);
    });
  }

  function toggleClear(content, anchor) {
    const clear = anchor.querySelector('[data-slot="combobox-clear"]');
    if (clear) clear.hidden = selectedItems(content).length === 0;
  }

  function syncValueDisplay(content) {
    const display = valueDisplayFor(content);
    if (!display) return;
    const label = displayValue(content);
    const text = label || display.getAttribute("data-templ-placeholder") || "";
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
    const values = selectedItems(content).map((selected) => selected.getAttribute("data-templ-value") || "");
    const value = item.getAttribute("data-templ-value") || "";
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
      return;
    }
  const nextValue = item.getAttribute("data-templ-value") || "";
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
  // value, the label lives in the item). A content unmounts with its portal
  // owner: a portaled one is removed from <body> then.
  window.templ.lifecycle.register(POPUP, {
    init(popup) {
      const content = popup.parentElement;
      if (!isPositioner(content)) return;
      startListNavigation(content);
      // Server-side open state (Base UI open or defaultOpen).
      if (content.getAttribute("data-templ-open") === "true" || content.hasAttribute("data-templ-default-open")) {
        open(content);
      }
      if (isMultiple(content)) return;
      syncValueDisplay(content);
      const input = inputFor(content);
      if (!input || input.value !== "" || content.contains(input)) return;
      const label = displayValue(content);
      if (label) input.value = label;
    },
    destroy(popup) {
      const content = popup.parentElement;
      if (!isPositioner(content)) return;
      content._templNav?.cleanup();
      content._templNav = null;
      stopAutoPositioning(content);
      content._templDismiss?.();
      stopFocusManager(content);
      window.templ.portal.remove(portalNodeOf(content));
    },
  });

  // ----- events -------------------------------------------------------------

  // Pointer interactions toggle and dismiss on PRESS, exactly like Base UI.
  // Click is never used for open/close, so the stray click the browser fires
  // on <body> when the popup ends up under the released pointer is harmless.
  function toggleTrigger(trigger, interactionType = null) {
    const content = contentFor(trigger);
    if (!content) return;
    content._templOpenMethod = interactionType;
    if (content.hasAttribute("data-open")) {
    requestOpenChange(content, false);
    } else {
      const input = inputFor(content);
      if (input && input.disabled) return;
    requestOpenChange(content, true);
      // The trigger moves focus to an input in the anchor; an input in the
      // popup is the focus manager's initial focus.
      if (input && !content.contains(input)) requestAnimationFrame(() => input.focus());
    }
  }

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;

    const trigger = triggerOf(e.target);
    if (trigger) {
      toggleTrigger(trigger, e.pointerType || "mouse");
      return;
    }

    // Clear and chip-remove buttons act on the selection, they never open.
    if (e.target.closest('[data-slot="combobox-clear"], [data-slot="combobox-chip-remove"]')) return;

    const anchor = e.target.closest(ANCHOR);
    if (anchor && !positionerOf(anchor)) {
      const content = document.getElementById(anchor.getAttribute("data-templ-combobox-anchor"));
      if (!content || content.hasAttribute("data-open")) return;
      const field = inputFor(content);
    if (field && !field.disabled) requestOpenChange(content, true);
      return;
    }

  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;

    const remove = e.target.closest('[data-slot="combobox-chip-remove"]');
    if (remove) {
      const chip = remove.closest(CHIP);
      const content = contentFor(remove);
      if (chip && content) {
        const value = chip.getAttribute("data-templ-value");
        const item = itemsOf(content).find(
          (i) => (i.getAttribute("data-templ-value") || "") === value,
        );
    if (item) selectItem(content, item);
      }
      return;
    }

    const clear = e.target.closest('[data-slot="combobox-clear"]');
    if (clear) {
      const content = contentFor(clear);
      if (content) clearSelection(content);
      return;
    }

    const trigger = triggerOf(e.target);
    if (trigger) {
      // Keyboard activation only (Enter/Space fire a detail-0 click without
      // a preceding pointerdown); pointer presses are handled on pointerdown.
      if (e.detail === 0) toggleTrigger(trigger, "keyboard");
      return;
    }

    const item = e.target.closest(ITEM);
    if (item && !item.hasAttribute("data-disabled")) {
      const content = positionerOf(item);
      if (content) selectItem(content, item);
    }
  });

  document.addEventListener("input", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches(INPUT)) return;
    const content = contentFor(e.target);
    if (!isPositioner(content)) return;
  if (!content.hasAttribute("data-open")) requestOpenChange(content, true);
    applyFilter(content, e.target.value);
  });

  document.addEventListener("keydown", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches(INPUT)) return;
    const content = contentFor(e.target);
    if (!isPositioner(content)) return;
    const isOpen = content.hasAttribute("data-open");

    if (e.key === "Enter") {
      const highlighted = isOpen && highlightedItem(content);
      if (highlighted) {
        e.preventDefault();
        selectItem(content, highlighted);
      }
      return;
    }
    if (e.key === "Backspace" && isMultiple(content) && e.target.value === "") {
      const chips = [...e.target.parentElement.querySelectorAll(CHIP)];
      const last = chips[chips.length - 1];
      if (last) {
        const btn = last.querySelector('[data-slot="combobox-chip-remove"]');
        if (btn) btn.click();
      }
      return;
    }
  });

})();
