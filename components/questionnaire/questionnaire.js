(function () {
  "use strict";

  // Vanilla port of @shadcn/react's Questionnaire (packages/react/src/
  // questionnaire: use-questionnaire-root.ts, use-questionnaire-item.ts,
  // use-questionnaire-choice.ts, use-questionnaire-input.ts, collection.ts and
  // utils.ts). The Root owns the active item, each Item its answer selection,
  // skip and validation state; sync() renders that state onto the DOM the way
  // the primitive's render does (state attributes, ARIA, hidden/inert).
  //
  // Owner side (the pendants of the callbacks):
  //   questionnaire-item-change    on the root, detail { item } (onItemChange)
  //   questionnaire-status-change  on the item, detail { status } (onStatusChange)
  //   window.templ.questionnaire.setItem(root, name)  commits a controlled
  //     item (data-templ-item) or navigates an uncontrolled root.
  // Changing a prop attribute (data-templ-item, data-templ-items,
  // data-shortcuts, data-templ-invalid, disabled on an item or a navigation
  // button) re-renders like a prop change.

  const ROOT = '[data-slot="questionnaire"]';
  const PROGRESS = '[data-slot="questionnaire-progress"]';
  const ITEM = '[data-slot="questionnaire-item"]';
  const DESCRIPTION = '[data-slot="questionnaire-description"]';
  const CHOICES = '[data-slot="questionnaire-choices"]';
  const CHOICE = '[data-slot="questionnaire-choice"]';
  const CHOICE_INPUT = '[data-slot="questionnaire-choice-input"]';
  const SHORTCUT = '[data-slot="questionnaire-choice-shortcut"]';
  const INPUT = '[data-slot="questionnaire-input"]';
  const ERROR = '[data-slot="questionnaire-error"]';
  const PREVIOUS = '[data-slot="questionnaire-previous"]';
  const SKIP = '[data-slot="questionnaire-skip"]';
  const NEXT = '[data-slot="questionnaire-next"]';
  const SUBMIT = '[data-slot="questionnaire-submit"]';
  const PROPS = ["data-templ-item", "data-templ-items", "data-shortcuts", "data-templ-invalid", "disabled", "data-required", "data-multiple"];
  const DEFAULT_LABEL = /^Question \d+ of \d+$/;

  // ----- utils.ts -----------------------------------------------------------

  function hasInputValue(value) {
    return value !== undefined && value !== null && String(value).trim().length > 0;
  }

  function getShortcutKeys(mode) {
    if (mode === "letters") return Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    if (mode === "numbers") return Array.from({ length: 9 }, (_, i) => String(i + 1));
    return [];
  }

  function getShortcutFromKey(key, mode) {
    const normalized = mode === "letters" ? key.toUpperCase() : key;
    return getShortcutKeys(mode).includes(normalized) ? normalized : null;
  }

  function isChoice(answer) {
    return answer.matches(CHOICE_INPUT);
  }

  function isAnswerFilled(answer) {
    if (isChoice(answer)) return answer.checked;
    return answer.hasAttribute("name") && hasInputValue(answer.value);
  }

  function isEmptyNavigableInput(answer) {
    return (
      !!answer &&
      !isChoice(answer) &&
      ["email", "password", "search", "tel", "text", "url"].includes(answer.type) &&
      !hasInputValue(answer.value)
    );
  }

  function isTextEntryTarget(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
    if (el instanceof HTMLInputElement) return !["button", "checkbox", "radio", "reset", "submit"].includes(el.type);
    return el instanceof HTMLElement && el.isContentEditable;
  }

  function isRadioTarget(el) {
    return el instanceof HTMLInputElement && el.type === "radio";
  }

  // ----- DOM helpers --------------------------------------------------------

  function setAttr(el, name, value) {
    if (value === null || value === undefined || value === false) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else {
      const v = value === true ? "" : String(value);
      if (el.getAttribute(name) !== v) el.setAttribute(name, v);
    }
  }

  function partsOf(root, selector) {
    return Array.from(root.querySelectorAll(selector)).filter((el) => el.closest(ROOT) === root);
  }

  function itemParts(item, selector) {
    return Array.from(item.querySelectorAll(selector)).filter((el) => el.closest(ITEM) === item);
  }

  function shortcutMode(root) {
    const mode = root.getAttribute("data-shortcuts");
    return mode === "letters" || mode === "numbers" ? mode : null;
  }

  // ----- collection.ts ------------------------------------------------------

  function collectionOf(root) {
    const raw = root.getAttribute("data-templ-items");
    if (raw === null) return null;
    if (root._templQItemsRaw !== raw) {
      let items = [];
      try {
        items = JSON.parse(raw) || [];
      } catch (_) {
        items = [];
      }
      root._templQItemsRaw = raw;
      root._templQItems = items;
    }
    return root._templQItems;
  }

  function getInitialItemName(collection, defaultItem) {
    if (!collection) return defaultItem || null;
    const def = defaultItem ? collection.find((it) => it.name === defaultItem) : undefined;
    if (def && !def.disabled) return def.name;
    const first = collection.find((it) => !it.disabled);
    return first ? first.name : null;
  }

  // ----- item (use-questionnaire-item.ts) -------------------------------------

  function itemName(item) {
    return item.getAttribute("data-templ-name") || "";
  }

  function itemDisabled(item) {
    return item.hasAttribute("disabled");
  }

  function itemRequired(item) {
    return item.hasAttribute("data-required");
  }

  function itemMultiple(item) {
    return item.hasAttribute("data-multiple");
  }

  function itemState(item) {
    if (!item._templQ) {
      // registerAnswerSelection: the default answers (checked attribute,
      // default value) start selected, only the first one for a single item.
      const defaults = answerControls(item).filter((a) =>
        isChoice(a) ? a.defaultChecked : hasInputValue(a.defaultValue),
      );
      item._templQ = {
        defaults,
        selected: new Set(itemMultiple(item) ? defaults : defaults.slice(0, 1)),
        skipped: false,
        attempted: false,
        status: "unanswered",
        describedBy: item.getAttribute("aria-describedby"),
        keyShortcuts: item.getAttribute("aria-keyshortcuts"),
      };
    }
    return item._templQ;
  }

  function answerControls(item) {
    return itemParts(item, CHOICE_INPUT + "," + INPUT);
  }

  function ownDisabled(answer) {
    const host = isChoice(answer) ? answer.closest(CHOICE) : answer;
    return !!host && host.hasAttribute("data-templ-disabled");
  }

  function answerDisabled(item, answer) {
    return itemDisabled(item) || ownDisabled(answer);
  }

  function answersOf(item) {
    return answerControls(item).filter((a) => !answerDisabled(item, a));
  }

  function statusOf(item) {
    const st = itemState(item);
    if (st.skipped) return "skipped";
    return answersOf(item).some((a) => st.selected.has(a)) ? "answered" : "unanswered";
  }

  function validity(item) {
    const st = itemState(item);
    const disabled = itemDisabled(item);
    const required = itemRequired(item);
    const status = statusOf(item);
    const intentionallySkipped = status === "skipped" && !required;
    const external = item.hasAttribute("data-templ-invalid");
    const valid = disabled || intentionallySkipped || (!external && status === "answered");
    const invalid = !disabled && !intentionallySkipped && (external || (st.attempted && !valid));
    return { status, valid, invalid };
  }

  // getShortcutByChoiceValue with Root.items, else the order of the enabled
  // choices.
  function shortcutOf(root, item, answer) {
    const mode = shortcutMode(root);
    if (!mode) return null;
    const keys = getShortcutKeys(mode);
    const collection = collectionOf(root);
    const value = answer.value;
    if (collection) {
      const def = collection.find((it) => it.name === itemName(item));
      let index = 0;
      for (const choice of (def && def.choices) || []) {
        if (choice.disabled) continue;
        if (!keys[index]) break;
        if (choice.value === value) return keys[index];
        index += 1;
      }
      return null;
    }
    const index = answersOf(item).filter(isChoice).indexOf(answer);
    return index >= 0 && index < keys.length ? keys[index] : null;
  }

  function setSelected(item, answer, selected) {
    const st = itemState(item);
    if (!selected) {
      st.selected.delete(answer);
    } else if (!itemMultiple(item)) {
      st.selected = new Set([answer]);
    } else {
      st.selected.add(answer);
    }
  }

  // setAnswerSelectionFromInteraction
  function selectFromInteraction(item, answer, selected) {
    itemState(item).skipped = false;
    setSelected(item, answer, selected);
  }

  function validate(root, item) {
    const st = itemState(item);
    st.attempted = true;
    if (!validity(item).valid) return false;
    if (!root.noValidate) {
      const invalid = answersOf(item).find((a) => isAnswerFilled(a) && a.willValidate && !a.validity.valid);
      if (invalid) {
        invalid.focus();
        invalid.reportValidity();
        return false;
      }
    }
    return true;
  }

  function focusItem(item) {
    item?.focus();
  }

  function focusInvalid(item) {
    if (!item) return;
    const selected = item.querySelector("input[data-filled][name]:not(:disabled)");
    const first = item.querySelector("input:not([type=hidden]):not(:disabled), textarea:not(:disabled)");
    (selected || first || item).focus();
  }

  function resetItem(item) {
    const st = itemState(item);
    st.attempted = false;
    st.skipped = false;
    st.selected = new Set(itemMultiple(item) ? st.defaults : st.defaults.slice(0, 1));
  }

  function skipItem(item) {
    if (itemRequired(item)) return;
    const st = itemState(item);
    st.selected = new Set();
    st.skipped = true;
  }

  function moveAnswerFocus(item, current, direction) {
    const answers = answersOf(item);
    const index = answers.indexOf(current);
    const currentAnswer = index < 0 ? null : answers[index];
    if (
      !answers.length ||
      (isTextEntryTarget(current) && !isEmptyNavigableInput(currentAnswer)) ||
      (index < 0 && current !== item)
    ) {
      return false;
    }
    const next =
      index < 0
        ? answers.find(isAnswerFilled) || (direction === "next" ? answers[0] : answers[answers.length - 1])
        : answers[(index + (direction === "next" ? 1 : -1) + answers.length) % answers.length];
    if (!next || next === current) return false;
    // Native radio groups move between their own radios.
    if (index >= 0 && isRadioTarget(current) && isRadioTarget(next)) return false;
    next.focus();
    if (isChoice(next) && isRadioTarget(next)) next.click();
    return true;
  }

  // ----- root (use-questionnaire-root.ts) -------------------------------------

  function rootState(root) {
    return root._templQ;
  }

  function controlled(root) {
    return root.hasAttribute("data-templ-item");
  }

  function compute(root) {
    const st = rootState(root);
    const collection = collectionOf(root);
    const runtimeItems = partsOf(root, ITEM).filter((item) => !itemDisabled(item));
    const byName = new Map(runtimeItems.map((item) => [itemName(item), item]));
    const logical = collection ? collection.filter((it) => !it.disabled).map((it) => it.name) : runtimeItems.map(itemName);
    const activeName = controlled(root) ? root.getAttribute("data-templ-item") : st.active;
    const currentIndex = activeName === null ? -1 : logical.indexOf(activeName);
    const activeItem = currentIndex < 0 || !activeName ? null : byName.get(activeName) || null;
    const definition = activeName && collection ? collection.find((it) => it.name === activeName) : undefined;
    const activeRequired =
      currentIndex < 0 ? null : definition ? !!definition.required : activeItem ? itemRequired(activeItem) : false;
    const activeStatus = currentIndex < 0 ? null : activeItem ? statusOf(activeItem) : activeName ? "unanswered" : null;
    const ordered = collection ? logical.map((name) => byName.get(name)).filter(Boolean) : runtimeItems;
    const total = logical.length;
    return {
      collection,
      logical,
      ordered,
      activeName,
      currentIndex,
      activeItem,
      activeRequired,
      activeStatus,
      total,
      current: currentIndex < 0 ? 0 : currentIndex + 1,
      first: total > 0 && currentIndex === 0,
      last: total > 0 && currentIndex === total - 1,
    };
  }

  function setItem(root, next, target) {
    const st = rootState(root);
    const c = compute(root);
    if (next === c.activeName) return;
    st.pendingFocus = { name: next, target: target || "item" };
    if (!controlled(root)) st.active = next;
    root.dispatchEvent(new CustomEvent("questionnaire-item-change", { bubbles: true, detail: { item: next } }));
    sync(root);
  }

  function goPrevious(root) {
    const c = compute(root);
    if (c.currentIndex <= 0) return;
    setItem(root, c.logical[c.currentIndex - 1]);
  }

  function goNext(root) {
    const c = compute(root);
    if (!c.activeItem || c.currentIndex >= c.total - 1) return;
    if (!validate(root, c.activeItem)) {
      sync(root);
      focusInvalid(c.activeItem);
      return;
    }
    setItem(root, c.logical[c.currentIndex + 1]);
  }

  function confirmCurrent(root) {
    const c = compute(root);
    if (!c.activeItem) return;
    if (!validate(root, c.activeItem)) {
      sync(root);
      focusInvalid(c.activeItem);
      return;
    }
    if (c.last) {
      root.requestSubmit();
      return;
    }
    setItem(root, c.logical[c.currentIndex + 1]);
  }

  function skipCurrent(root) {
    const c = compute(root);
    if (!c.activeItem || itemRequired(c.activeItem)) return;
    skipItem(c.activeItem);
    if (!c.last) {
      setItem(root, c.logical[c.currentIndex + 1]);
      return;
    }
    sync(root);
    queueMicrotask(() => root.requestSubmit());
  }

  // ----- render -------------------------------------------------------------

  function syncRootState(el, c) {
    setAttr(el, "data-current", c.current);
    setAttr(el, "data-first", c.first);
    setAttr(el, "data-last", c.last);
    setAttr(el, "data-total", c.total);
  }

  function syncProgress(progress, c) {
    syncRootState(progress, c);
    const label = c.total ? "Question " + c.current + " of " + c.total : null;
    setAttr(progress, "aria-valuemax", c.total || null);
    setAttr(progress, "aria-valuemin", c.total ? 1 : null);
    setAttr(progress, "aria-valuenow", c.total ? c.current : null);
    setAttr(progress, "aria-valuetext", label);
    // Children replace the default label (the render prop pendant).
    const text = progress.textContent.trim();
    if (progress.childElementCount === 0 && (text === "" || DEFAULT_LABEL.test(text)) && text !== (label || "")) {
      progress.textContent = label || "";
    }
  }

  function syncItem(root, item, c) {
    const st = itemState(item);
    const name = itemName(item);
    const disabled = itemDisabled(item);
    const required = itemRequired(item);
    const multiple = itemMultiple(item);
    const active = !disabled && c.activeName === name;
    const { status, invalid } = validity(item);
    const answers = answersOf(item);
    const hasInputAnswer = answers.some((a) => !isChoice(a));
    const mode = shortcutMode(root);

    for (const label of itemParts(item, CHOICE)) {
      const input = label.querySelector(CHOICE_INPUT);
      if (!input) continue;
      const choiceDisabled = disabled || label.hasAttribute("data-templ-disabled");
      const checked = st.selected.has(input);
      const type = multiple ? "checkbox" : "radio";
      const shortcut = shortcutOf(root, item, input);
      if (input.type !== type) input.type = type;
      if (input.checked !== checked) input.checked = checked;
      if (input.disabled !== choiceDisabled) input.disabled = choiceDisabled;
      setAttr(input, "name", status === "skipped" ? null : name);
      setAttr(input, "required", required && !multiple && !hasInputAnswer);
      setAttr(input, "aria-invalid", invalid ? "true" : null);
      setAttr(input, "aria-keyshortcuts", [shortcut, !choiceDisabled && checked ? "Enter" : null].filter(Boolean).join(" ") || null);
      for (const el of [label, input]) {
        setAttr(el, "data-checked", checked);
        setAttr(el, "data-unchecked", !checked);
        setAttr(el, "data-disabled", choiceDisabled);
        setAttr(el, "data-invalid", invalid);
        setAttr(el, "data-shortcut", shortcut);
        setAttr(el, "data-type", type);
      }
      const hint = label.querySelector(SHORTCUT);
      if (hint) {
        setAttr(hint, "data-shortcut", shortcut);
        hint.hidden = shortcut === null;
        if (hint.textContent !== (shortcut || "")) hint.textContent = shortcut || "";
      }
    }

    for (const input of itemParts(item, INPUT)) {
      const inputDisabled = disabled || input.hasAttribute("data-templ-disabled");
      const filled = hasInputValue(input.value);
      const selected = st.selected.has(input);
      if (input.disabled !== inputDisabled) input.disabled = inputDisabled;
      setAttr(input, "name", selected ? name : null);
      setAttr(input, "form", selected ? null : "");
      setAttr(input, "aria-invalid", invalid ? "true" : null);
      setAttr(input, "aria-keyshortcuts", !inputDisabled && filled && selected ? "Enter" : null);
      setAttr(input, "data-disabled", inputDisabled);
      setAttr(input, "data-empty", !filled);
      setAttr(input, "data-filled", filled);
      setAttr(input, "data-invalid", invalid);
    }

    for (const choices of itemParts(item, CHOICES)) setAttr(choices, "data-shortcuts", mode);

    const errors = itemParts(item, ERROR);
    for (const error of errors) {
      error.hidden = !invalid;
      setAttr(error, "role", invalid ? "alert" : null);
      setAttr(error, "data-invalid", invalid);
    }

    const describedBy = [
      ...itemParts(item, DESCRIPTION).map((d) => d.id),
      ...(invalid ? errors.map((e) => e.id) : []),
      st.describedBy,
    ].filter(Boolean);
    const keyShortcuts = [
      st.keyShortcuts,
      active ? "Meta+Enter Control+Enter" : null,
      active && answers.length ? "ArrowUp ArrowDown" : null,
      active && !c.first ? "ArrowLeft" : null,
      active && !c.last && status !== "unanswered" ? "ArrowRight" : null,
    ].filter(Boolean);

    setAttr(item, "aria-describedby", describedBy.join(" ") || null);
    setAttr(item, "aria-invalid", invalid ? "true" : null);
    setAttr(item, "aria-keyshortcuts", keyShortcuts.join(" ") || null);
    setAttr(item, "data-active", active);
    setAttr(item, "data-disabled", disabled);
    setAttr(item, "data-invalid", invalid);
    setAttr(item, "data-status", status);
    setAttr(item, "tabindex", -1);
    item.hidden = !active;
    item.inert = !active;

    if (st.status !== status) {
      st.status = status;
      item.dispatchEvent(new CustomEvent("questionnaire-status-change", { bubbles: true, detail: { status } }));
    }
  }

  function syncNavigation(button, visible, shortcut, status) {
    const disabled = button.disabled;
    const activeShortcut = visible && !disabled ? shortcut || null : null;
    setAttr(button, "aria-hidden", visible ? null : "true");
    setAttr(button, "aria-keyshortcuts", activeShortcut);
    setAttr(button, "data-disabled", disabled);
    setAttr(button, "data-shortcut", activeShortcut);
    setAttr(button, "data-status", status);
    setAttr(button, "data-visible", visible);
    setAttr(button, "data-hidden", !visible);
    setAttr(button, "tabindex", visible ? null : -1);
    button.hidden = !visible;
    button.inert = !visible;
  }

  function sync(root) {
    const st = rootState(root);
    if (!st || st.syncing) return;
    let c = compute(root);
    if (c.total > 0 && c.currentIndex < 0) {
      if (!controlled(root) && st.active === null) {
        st.active = c.logical[0];
        c = compute(root);
      } else if (st.fallback !== c.logical[0]) {
        // A controlled owner that ignores the request keeps the state.
        st.fallback = c.logical[0];
        setItem(root, c.logical[0]);
        return;
      }
    } else {
      st.fallback = null;
    }

    st.syncing = true;
    syncRootState(root, c);
    partsOf(root, PROGRESS).forEach((progress) => syncProgress(progress, c));
    partsOf(root, ITEM).forEach((item) => syncItem(root, item, c));
    partsOf(root, PREVIOUS).forEach((b) => syncNavigation(b, c.total > 1 && !c.first, null, c.activeStatus));
    partsOf(root, SKIP).forEach((b) => syncNavigation(b, c.activeRequired === false, null, c.activeStatus));
    partsOf(root, NEXT).forEach((b) => syncNavigation(b, c.total > 1 && !c.last, "Enter", c.activeStatus));
    partsOf(root, SUBMIT).forEach((b) => syncNavigation(b, c.total > 0 && c.last, "Enter", c.activeStatus));
    st.observer?.takeRecords();
    st.syncing = false;

    // Focus the newly active item (or its answer after failed validation).
    const pending = st.pendingFocus;
    const changed = st.previousActive !== c.activeName;
    st.previousActive = c.activeName;
    if (!pending || pending.name !== c.activeName) {
      if (controlled(root) && changed) {
        st.pendingFocus = null;
        focusItem(c.activeItem);
      }
      return;
    }
    if (pending.target === "invalid") focusInvalid(c.activeItem);
    else focusItem(c.activeItem);
    st.pendingFocus = null;
  }

  // ----- events ---------------------------------------------------------------

  function onKeyDown(root, event) {
    const c = compute(root);
    const target = event.target;
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || !c.activeItem || !(target instanceof Element)) {
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) confirmCurrent(root);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (moveAnswerFocus(c.activeItem, target, event.key === "ArrowDown" ? "next" : "previous")) {
        event.preventDefault();
        return;
      }
    }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !isTextEntryTarget(target) && !isRadioTarget(target)) {
      event.preventDefault();
      if (event.repeat) return;
      if (event.key === "ArrowLeft") goPrevious(root);
      else if (c.activeStatus !== "unanswered") goNext(root);
      return;
    }
    if (event.key === "Enter") {
      const answer = answersOf(c.activeItem).find((a) => a === target);
      if (!answer) return;
      event.preventDefault();
      if (!event.repeat && isAnswerFilled(answer)) confirmCurrent(root);
      return;
    }
    const mode = shortcutMode(root);
    if (!mode || isTextEntryTarget(target)) return;
    const shortcut = getShortcutFromKey(event.key, mode);
    const answer = shortcut
      ? answersOf(c.activeItem).find((a) => isChoice(a) && shortcutOf(root, c.activeItem, a) === shortcut)
      : null;
    if (!answer) return;
    event.preventDefault();
    if (event.repeat) return;
    answer.focus();
    answer.click();
  }

  function onClick(root, event) {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const button = event.target.closest(PREVIOUS + "," + SKIP + "," + NEXT);
    if (!button || button.closest(ROOT) !== root) return;
    if (button.matches(PREVIOUS)) goPrevious(root);
    else if (button.matches(SKIP)) skipCurrent(root);
    else goNext(root);
  }

  // Choice inputs follow their change, the freeform input every input.
  function onAnswer(root, event) {
    const answer = event.target;
    if (!(answer instanceof HTMLInputElement)) return;
    const isChoiceInput = answer.matches(CHOICE_INPUT);
    if (event.type === "change" ? !isChoiceInput : !answer.matches(INPUT)) return;
    const item = answer.closest(ITEM);
    if (!item || item.closest(ROOT) !== root) return;
    selectFromInteraction(item, answer, isChoiceInput ? answer.checked : hasInputValue(answer.value));
    sync(root);
  }

  function onSubmit(root, event) {
    const c = compute(root);
    const firstInvalid = c.ordered.find((item) => !validate(root, item));
    if (!firstInvalid) {
      sync(root);
      return;
    }
    // The owner's onSubmit does not run.
    event.preventDefault();
    event.stopImmediatePropagation();
    const name = itemName(firstInvalid);
    if (name === c.activeName) {
      sync(root);
      focusInvalid(firstInvalid);
      rootState(root).pendingFocus = null;
      return;
    }
    setItem(root, name, "invalid");
  }

  function onReset(root, event) {
    if (event.defaultPrevented) return;
    partsOf(root, ITEM).forEach(resetItem);
    const c = compute(root);
    const resetName = c.collection
      ? getInitialItemName(c.collection, root.getAttribute("data-templ-default-item") || undefined)
      : (c.ordered.find((item) => itemName(item) === root.getAttribute("data-templ-default-item")) || c.ordered[0])?.getAttribute(
          "data-templ-name",
        );
    if (resetName) setItem(root, resetName);
    sync(root);
    // The native reset restores the controls after this event: render the
    // reset selection onto them again.
    setTimeout(() => sync(root), 0);
  }

  function init(root) {
    const collection = collectionOf(root);
    const defaultItem = root.getAttribute("data-templ-default-item") || undefined;
    const st = {
      active: getInitialItemName(collection, defaultItem),
      pendingFocus: null,
      previousActive: null,
      fallback: null,
      syncing: false,
      listeners: [],
    };
    root._templQ = st;
    partsOf(root, ITEM).forEach(itemState);
    st.previousActive = compute(root).activeName;

    const listen = (type, handler, capture) => {
      const fn = (e) => handler(root, e);
      root.addEventListener(type, fn, capture);
      st.listeners.push([type, fn, capture]);
    };
    listen("keydown", onKeyDown, false);
    listen("click", onClick, false);
    listen("change", onAnswer, false);
    listen("input", onAnswer, false);
    // Capture on the form runs before the owner's submit listeners.
    listen("submit", onSubmit, true);
    listen("reset", onReset, false);

    // Prop changes and added or removed parts re-render.
    st.observer = new MutationObserver(() => {
      partsOf(root, ITEM).forEach(itemState);
      sync(root);
    });
    st.observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: PROPS });
    sync(root);
  }

  function destroy(root) {
    const st = root._templQ;
    if (!st) return;
    st.observer.disconnect();
    st.listeners.forEach(([type, fn, capture]) => root.removeEventListener(type, fn, capture));
    root._templQ = null;
  }

  window.templ.lifecycle.register(ROOT, { init, destroy });

  window.templ = window.templ || {};
  window.templ.questionnaire = {
    setItem(root, name) {
      if (!root?._templQ) return;
      if (controlled(root)) root.setAttribute("data-templ-item", name);
      else setItem(root, name);
    },
  };
})();
