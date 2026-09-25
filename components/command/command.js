(function () {
  // 1:1 port of cmdk v1.1.1 (pacocoursey/cmdk), the primitive behind shadcn's
  // base/ui/command.tsx: command-score fuzzy filtering with result sorting,
  // a roving selection, vim bindings and aria-activedescendant wiring.

  const ITEM_SELECTOR = "[cmdk-item]";
  const VALID_ITEM_SELECTOR = ITEM_SELECTOR + ':not([aria-disabled="true"]):not([hidden])';
  const GROUP_SELECTOR = "[cmdk-group]";
  const GROUP_ITEMS_SELECTOR = "[cmdk-group-items]";
  const GROUP_HEADING_SELECTOR = "[cmdk-group-heading]";

  // ----- command-score ------------------------------------------------------
  // 1:1 port of cmdk's command-score.ts (the default filter).

  const SCORE_CONTINUE_MATCH = 1,
    SCORE_SPACE_WORD_JUMP = 0.9,
    SCORE_NON_SPACE_WORD_JUMP = 0.8,
    SCORE_CHARACTER_JUMP = 0.17,
    SCORE_TRANSPOSITION = 0.1,
    PENALTY_SKIPPED = 0.999,
    PENALTY_CASE_MISMATCH = 0.9999,
    PENALTY_NOT_COMPLETE = 0.99;

  const IS_GAP_REGEXP = /[\\\/_+.#"@\[\(\{&]/,
    COUNT_GAPS_REGEXP = /[\\\/_+.#"@\[\(\{&]/g,
    IS_SPACE_REGEXP = /[\s-]/,
    COUNT_SPACE_REGEXP = /[\s-]/g;

  function commandScoreInner(
    string,
    abbreviation,
    lowerString,
    lowerAbbreviation,
    stringIndex,
    abbreviationIndex,
    memoizedResults,
  ) {
    if (abbreviationIndex === abbreviation.length) {
      if (stringIndex === string.length) {
        return SCORE_CONTINUE_MATCH;
      }
      return PENALTY_NOT_COMPLETE;
    }

    const memoizeKey = stringIndex + "," + abbreviationIndex;
    if (memoizedResults[memoizeKey] !== undefined) {
      return memoizedResults[memoizeKey];
    }

    const abbreviationChar = lowerAbbreviation.charAt(abbreviationIndex);
    let index = lowerString.indexOf(abbreviationChar, stringIndex);
    let highScore = 0;

    let score, transposedScore, wordBreaks, spaceBreaks;

    while (index >= 0) {
      score = commandScoreInner(
        string,
        abbreviation,
        lowerString,
        lowerAbbreviation,
        index + 1,
        abbreviationIndex + 1,
        memoizedResults,
      );
      if (score > highScore) {
        if (index === stringIndex) {
          score *= SCORE_CONTINUE_MATCH;
        } else if (IS_GAP_REGEXP.test(string.charAt(index - 1))) {
          score *= SCORE_NON_SPACE_WORD_JUMP;
          wordBreaks = string.slice(stringIndex, index - 1).match(COUNT_GAPS_REGEXP);
          if (wordBreaks && stringIndex > 0) {
            score *= Math.pow(PENALTY_SKIPPED, wordBreaks.length);
          }
        } else if (IS_SPACE_REGEXP.test(string.charAt(index - 1))) {
          score *= SCORE_SPACE_WORD_JUMP;
          spaceBreaks = string.slice(stringIndex, index - 1).match(COUNT_SPACE_REGEXP);
          if (spaceBreaks && stringIndex > 0) {
            score *= Math.pow(PENALTY_SKIPPED, spaceBreaks.length);
          }
        } else {
          score *= SCORE_CHARACTER_JUMP;
          if (stringIndex > 0) {
            score *= Math.pow(PENALTY_SKIPPED, index - stringIndex);
          }
        }

        if (string.charAt(index) !== abbreviation.charAt(abbreviationIndex)) {
          score *= PENALTY_CASE_MISMATCH;
        }
      }

      if (
        (score < SCORE_TRANSPOSITION &&
          lowerString.charAt(index - 1) === lowerAbbreviation.charAt(abbreviationIndex + 1)) ||
        (lowerAbbreviation.charAt(abbreviationIndex + 1) === lowerAbbreviation.charAt(abbreviationIndex) &&
          lowerString.charAt(index - 1) !== lowerAbbreviation.charAt(abbreviationIndex))
      ) {
        transposedScore = commandScoreInner(
          string,
          abbreviation,
          lowerString,
          lowerAbbreviation,
          index + 1,
          abbreviationIndex + 2,
          memoizedResults,
        );

        if (transposedScore * SCORE_TRANSPOSITION > score) {
          score = transposedScore * SCORE_TRANSPOSITION;
        }
      }

      if (score > highScore) {
        highScore = score;
      }

      index = lowerString.indexOf(abbreviationChar, index + 1);
    }

    memoizedResults[memoizeKey] = highScore;
    return highScore;
  }

  function formatInput(string) {
    return string.toLowerCase().replace(COUNT_SPACE_REGEXP, " ");
  }

  function commandScore(string, abbreviation) {
    return commandScoreInner(string, abbreviation, formatInput(string), formatInput(abbreviation), 0, 0, {});
  }

  // ----- helpers ------------------------------------------------------------

  function rootFor(el) {
    return el.closest("[cmdk-root]");
  }

  function inputOf(root) {
    return root.querySelector("[cmdk-input]");
  }

  function listOf(root) {
    return root.querySelector("[cmdk-list]");
  }

  function sizerOf(root) {
    return root.querySelector("[cmdk-list-sizer]");
  }

  function searchOf(root) {
    return root._templCommandSearch || "";
  }

  function valueOf(item) {
    return item.getAttribute("data-value") || "";
  }

  function getValidItems(root) {
    return [...root.querySelectorAll(VALID_ITEM_SELECTOR)];
  }

  function getSelectedItem(root) {
    return root.querySelector(ITEM_SELECTOR + '[aria-selected="true"]');
  }

  function score(root, value) {
    return value ? commandScore(value, searchOf(root)) : 0;
  }

  function findNextSibling(el, selector) {
    let sibling = el.nextElementSibling;
    while (sibling) {
      if (sibling.matches(selector)) return sibling;
      sibling = sibling.nextElementSibling;
    }
  }

  function findPreviousSibling(el, selector) {
    let sibling = el.previousElementSibling;
    while (sibling) {
      if (sibling.matches(selector)) return sibling;
      sibling = sibling.previousElementSibling;
    }
  }

  // ----- selection ----------------------------------------------------------

  function scrollSelectedIntoView(root) {
    const item = getSelectedItem(root);
    if (!item) return;
    if (item.parentElement?.firstElementChild === item) {
      // First item in a group: ensure the heading is in view.
      item.closest(GROUP_SELECTOR)?.querySelector(GROUP_HEADING_SELECTOR)?.scrollIntoView({ block: "nearest" });
    }
    item.scrollIntoView({ block: "nearest" });
  }

  // opts.scroll false mirrors cmdk's pointer selection, which skips the
  // scroll-into-view that keyboard selection performs.
  function setSelected(root, item, opts) {
    root.querySelectorAll(ITEM_SELECTOR).forEach((i) => {
      const selected = i === item;
      i.setAttribute("data-selected", selected ? "true" : "false");
      i.setAttribute("aria-selected", selected ? "true" : "false");
    });

    // cmdk re-focuses the input so accessibility works when focus sits on
    // the root or the input itself.
    const input = inputOf(root);
    if (document.activeElement === root || document.activeElement === input) {
      if (input) input.focus();
      else listOf(root)?.focus();
    }

    const id = item ? item.id : null;
    [input, listOf(root)].forEach((el) => {
      if (!el) return;
      if (id) el.setAttribute("aria-activedescendant", id);
      else el.removeAttribute("aria-activedescendant");
    });

    if (item && !(opts && opts.scroll === false)) scrollSelectedIntoView(root);
  }

  function selectFirstItem(root) {
    setSelected(root, getValidItems(root)[0] || null);
  }

  function updateSelectedToIndex(root, index) {
    const item = getValidItems(root)[index];
    if (item) setSelected(root, item);
  }

  // Roving selection without wrapping: cmdk only loops with the loop prop,
  // which shadcn's command.tsx does not set.
  function updateSelectedByItem(root, change) {
    const selected = getSelectedItem(root);
    const items = getValidItems(root);
    const index = items.indexOf(selected);
    const newSelected = items[index + change];
    if (newSelected) setSelected(root, newSelected);
  }

  function updateSelectedByGroup(root, change) {
    const selected = getSelectedItem(root);
    let group = selected?.closest(GROUP_SELECTOR);
    let item;

    while (group && !item) {
      group = change > 0 ? findNextSibling(group, GROUP_SELECTOR) : findPreviousSibling(group, GROUP_SELECTOR);
      item = group?.querySelector(VALID_ITEM_SELECTOR);
    }

    if (item) {
      setSelected(root, item);
    } else {
      updateSelectedByItem(root, change);
    }
  }

  // Activation = cmdk's SELECT_EVENT on Enter or click: the item stays
  // selected and a bubbling command-select event carries its value.
  function activateItem(root, item) {
    setSelected(root, item, { scroll: false });
    item.dispatchEvent(
      new CustomEvent("command-select", { bubbles: true, detail: { value: valueOf(item) } }),
    );
  }

  // ----- filtering ----------------------------------------------------------

  function filterItems(root) {
    const search = searchOf(root);
    const scores = (root._templCommandScores = new Map());
    const items = [...root.querySelectorAll(ITEM_SELECTOR)];
    let count = items.length;

    if (search) {
      count = 0;
      items.forEach((item) => {
        const rank = score(root, valueOf(item));
        scores.set(item, rank);
        item.hidden = !(rank > 0);
        if (rank > 0) count++;
      });
    } else {
      items.forEach((item) => {
        item.hidden = false;
      });
    }

    // A group is shown while at least one of its items is.
    root.querySelectorAll(GROUP_SELECTOR).forEach((group) => {
      group.hidden = !group.querySelector(ITEM_SELECTOR + ":not([hidden])");
    });

    // cmdk renders separators only while the search is empty.
    root.querySelectorAll("[cmdk-separator]").forEach((sep) => {
      sep.hidden = !!search && !sep.hasAttribute("data-templ-always-render");
    });

    // Empty renders only at zero results.
    root.querySelectorAll("[cmdk-empty]").forEach((empty) => {
      empty.hidden = count !== 0;
    });
  }

  /** Sorts items by score, and groups by their highest item score (cmdk sort()). */
  function sort(root) {
    const sizer = sizerOf(root);
    if (!sizer) return;

    if (!searchOf(root)) {
      // cmdk unmounts filtered items and remounts them in source order once
      // the search clears; restoring the recorded order is our equivalent.
      [sizer, ...root.querySelectorAll(GROUP_ITEMS_SELECTOR)].forEach((container) => {
        (container._templCommandOrder || []).forEach((child) => container.appendChild(child));
      });
      return;
    }

    const scores = root._templCommandScores || new Map();

    // Sort the items within their group (or the list) by score.
    getValidItems(root)
      .sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0))
      .forEach((item) => {
        const group = item.closest(GROUP_ITEMS_SELECTOR);
        if (group) {
          group.appendChild(item.parentElement === group ? item : item.closest(GROUP_ITEMS_SELECTOR + " > *"));
        } else {
          sizer.appendChild(item.parentElement === sizer ? item : item.closest("[cmdk-list-sizer] > *"));
        }
      });

    // Sort the groups by the maximum score of their items.
    [...root.querySelectorAll(GROUP_SELECTOR)]
      .filter((group) => !group.hidden)
      .map((group) => {
        let max = 0;
        group.querySelectorAll(ITEM_SELECTOR).forEach((item) => {
          max = Math.max(scores.get(item) ?? 0, max);
        });
        return [group, max];
      })
      .sort((a, b) => b[1] - a[1])
      .forEach(([group]) => {
        group.parentElement.appendChild(group);
      });
  }

  function onSearchChange(root, search) {
    root._templCommandSearch = search;
    // cmdk: filter synchronously, sort, then select the first item.
    filterItems(root);
    sort(root);
    selectFirstItem(root);
  }

  // ----- setup ---------------------------------------------------------------

  function setup(root) {
    if (root._templCommandInit) return;
    root._templCommandInit = true;
    root._templCommandSearch = "";

    // cmdk infers a missing value from the rendered textContent, and every
    // item needs an id for aria-activedescendant.
    let n = 0;
    root.querySelectorAll(ITEM_SELECTOR).forEach((item) => {
      n++;
      if (!item.id) item.id = root.id + "-item-" + n;
      if (!item.hasAttribute("data-value")) {
        item.setAttribute("data-value", (item.textContent || "").trim());
      }
    });

    // Record source order so clearing the search can undo result sorting.
    const sizer = sizerOf(root);
    [sizer, ...root.querySelectorAll(GROUP_ITEMS_SELECTOR)].forEach((container) => {
      if (container) container._templCommandOrder = [...container.children];
    });

    // cmdk selects the first item on mount and scrolls it into view.
    selectFirstItem(root);
  }

  function init() {
    document.querySelectorAll("[cmdk-root]").forEach(setup);
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

  // ----- events -------------------------------------------------------------

  document.addEventListener("input", (e) => {
    if (!(e.target instanceof Element) || !e.target.hasAttribute("cmdk-input")) return;
    const root = rootFor(e.target);
    if (root) onSearchChange(root, e.target.value);
  });

  document.addEventListener("keydown", (e) => {
    if (!(e.target instanceof Element)) return;
    const root = rootFor(e.target);
    if (!root) return;

    // Ignore keystrokes while an IME composition is in progress.
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;

    const next = () => {
      e.preventDefault();
      if (e.metaKey) {
        updateSelectedToIndex(root, getValidItems(root).length - 1);
      } else if (e.altKey) {
        updateSelectedByGroup(root, 1);
      } else {
        updateSelectedByItem(root, 1);
      }
    };
    const prev = () => {
      e.preventDefault();
      if (e.metaKey) {
        updateSelectedToIndex(root, 0);
      } else if (e.altKey) {
        updateSelectedByGroup(root, -1);
      } else {
        updateSelectedByItem(root, -1);
      }
    };

    switch (e.key) {
      case "n":
      case "j": {
        // vim keybind down
        if (e.ctrlKey) next();
        break;
      }
      case "ArrowDown": {
        next();
        break;
      }
      case "p":
      case "k": {
        // vim keybind up
        if (e.ctrlKey) prev();
        break;
      }
      case "ArrowUp": {
        prev();
        break;
      }
      case "Home": {
        e.preventDefault();
        updateSelectedToIndex(root, 0);
        break;
      }
      case "End": {
        e.preventDefault();
        updateSelectedToIndex(root, getValidItems(root).length - 1);
        break;
      }
      case "Enter": {
        e.preventDefault();
        const item = getSelectedItem(root);
        if (item && item.getAttribute("aria-disabled") !== "true") activateItem(root, item);
        break;
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const item = e.target.closest(ITEM_SELECTOR);
    if (!item || item.getAttribute("aria-disabled") === "true") return;
    const root = rootFor(item);
    if (root) activateItem(root, item);
  });

  // Moving the pointer over an item selects it, exactly like cmdk.
  document.addEventListener("pointermove", (e) => {
    if (!(e.target instanceof Element)) return;
    const item = e.target.closest(ITEM_SELECTOR);
    if (!item || item.getAttribute("aria-disabled") === "true" || item.getAttribute("aria-selected") === "true")
      return;
    const root = rootFor(item);
    if (root) setSelected(root, item, { scroll: false });
  });

  // A closing dialog unmounts cmdk's state in shadcn's CommandDialog; reset
  // the palette so the next open starts fresh. dialog.js dispatches the
  // bubbling dialog-close event once the dialog finished closing.
  document.addEventListener("dialog-close", (e) => {
    if (!(e.target instanceof Element)) return;
    e.target.querySelectorAll("[cmdk-root]").forEach((root) => {
      const input = inputOf(root);
      if (input) input.value = "";
      onSearchChange(root, "");
    });
  });
})();
