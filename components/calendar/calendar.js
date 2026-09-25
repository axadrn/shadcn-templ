(function () {
  // Verbatim class strings from base/ui/calendar.tsx (react-day-picker
  // classNames slots). The look lives in the vendored style-*.css via the
  // cn-calendar-* classes; none of the grid slots below has a cn- class in
  // any style, they are pure structural utilities. The day button template
  // (cn-calendar-day-button) lives in the templ file; the grid below is
  // (re)built here.
  const CLS = {
    week: "mt-2 flex w-full",
    weekday:
      "flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none",
    weekNumberHeader: "w-(--cell-size) select-none",
    weekNumber: "text-[0.8rem] text-muted-foreground select-none",
    weekNumberInner: "flex size-(--cell-size) items-center justify-center text-center",
    day: "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
    dayFirstRound: "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
    dayFirstRoundWeekNumbers: "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)",
    rangeStart:
      "relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted",
    rangeMiddle: "rounded-none",
    rangeEnd:
      "relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted",
    today: "rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none",
    outside: "text-muted-foreground aria-selected:text-muted-foreground",
    disabled: "text-muted-foreground opacity-50",
    // shadcn-templ extension, no shadcn slot or cn- class for booked days exists.
    booked: "[&>button]:line-through opacity-100",
  };

  const ROOT = '[data-slot="calendar"]';
  // react-day-picker puts the ISO date on the day cell (<td data-day>); the
  // button inside carries shadcn's locale data-day.
  const DAY = "td[data-day] > button";

  function containers() {
    return document.querySelectorAll(ROOT);
  }

  function dayISO(btn) {
    return btn.parentElement.getAttribute("data-day");
  }

  function dayButton(root, iso) {
    return root.querySelector('td[data-day="' + iso + '"] > button');
  }

  // react-day-picker's structure: the months container (the root's first
  // div) holds the <nav> and one block per month, in offset order.
  function monthBlocks(root) {
    const months = root.querySelector(":scope > div");
    return months ? [...months.children].filter((el) => el.tagName !== "NAV") : [];
  }

  function navButtons(root) {
    return root.querySelectorAll(":scope > div > nav > button");
  }

  function parseISO(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function toISO(d) {
    if (!d) return "";
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function sameDay(a, b) {
    return !!(a && b) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function state(root) {
    if (!root._templState) {
      const selected = parseISO(root.getAttribute("data-templ-selected"));
      const end = parseISO(root.getAttribute("data-templ-selected-to"));
      const view = parseISO(root.getAttribute("data-templ-month")) || selected || new Date();
      root._templState = {
        mode: root.getAttribute("data-templ-mode") || "single",
        locale: root.getAttribute("data-templ-locale") || "en-US",
        startOfWeek: parseInt(root.getAttribute("data-templ-week-starts-on"), 10) || 0,
        outsideDays: root.getAttribute("data-templ-show-outside-days") !== "false",
        fixedWeeks: root.hasAttribute("data-templ-fixed-weeks"),
        weekNumbers: root.hasAttribute("data-templ-show-week-number"),
        min: parseISO(root.getAttribute("data-templ-min-date")),
        max: parseISO(root.getAttribute("data-templ-max-date")),
        disabledDates: (root.getAttribute("data-templ-disabled") || "")
          .split(",").map(parseISO).filter(Boolean),
        bookedDates: (root.getAttribute("data-templ-booked-dates") || "")
          .split(",").map(parseISO).filter(Boolean),
        month: new Date(view.getFullYear(), view.getMonth(), 1),
        selected: selected,
        end: end,
      };
    }
    return root._templState;
  }

  function isDisabled(s, date) {
    if (s.min && date < s.min && !sameDay(date, s.min)) return true;
    if (s.max && date > s.max && !sameDay(date, s.max)) return true;
    return s.disabledDates.some((d) => sameDay(d, date)) || s.bookedDates.some((d) => sameDay(d, date));
  }

  function render(root) {
    const s = state(root);
    monthBlocks(root).forEach((block, offset) => {
      const month = new Date(s.month.getFullYear(), s.month.getMonth() + offset, 1);
      renderCaption(block, s, month);
      renderWeekdays(block, s);
      renderWeeks(root, block, s, month);
    });
    updateNav(root, s);
    root.dispatchEvent(new CustomEvent("calendar-rendered", { bubbles: true }));
  }

  function renderCaption(block, s, month) {
    const label = block.querySelector(":scope > div > span");
    if (label) {
      label.textContent = month.toLocaleDateString(s.locale, { month: "long", year: "numeric" });
    }
    // Caption dropdowns: month select first, year select second, each with
    // its visible label as the following span's first child.
    const [monthSelect, yearSelect] = block.querySelectorAll("select");
    if (monthSelect) {
      monthSelect.value = String(month.getMonth());
      const monthLabel = monthSelect.nextElementSibling?.firstElementChild;
      if (monthLabel) {
        monthLabel.textContent = new Date(2000, month.getMonth(), 1).toLocaleDateString(s.locale, { month: "short" });
      }
    }
    if (yearSelect) {
      yearSelect.value = String(month.getFullYear());
      const yearLabel = yearSelect.nextElementSibling?.firstElementChild;
      if (yearLabel) yearLabel.textContent = String(month.getFullYear());
    }
  }

  function renderWeekdays(block, s) {
    const row = block.querySelector("thead tr");
    if (!row) return;
    row.innerHTML = "";
    if (s.weekNumbers) {
      const th = document.createElement("th");
      th.className = CLS.weekNumberHeader;
      row.appendChild(th);
    }
    for (let i = 0; i < 7; i++) {
      const day = (s.startOfWeek + i) % 7;
      const th = document.createElement("th");
      th.className = CLS.weekday;
      th.scope = "col";
      // 2021-08-01 was a Sunday; the offset picks the right weekday name.
      th.textContent = new Date(2021, 7, 1 + day)
        .toLocaleDateString(s.locale, { weekday: "short" }).slice(0, 2);
      row.appendChild(th);
    }
  }

  function dayCellClasses(s, mods) {
    let cls = CLS.day + " " + (s.weekNumbers ? CLS.dayFirstRoundWeekNumbers : CLS.dayFirstRound);
    // A single-day range gets both classes, exactly like react-day-picker.
    if (mods.rangeStart) cls += " " + CLS.rangeStart;
    if (mods.rangeEnd) cls += " " + CLS.rangeEnd;
    if (mods.rangeMiddle) cls += " " + CLS.rangeMiddle;
    if (mods.today) cls += " " + CLS.today;
    if (mods.outside) cls += " " + CLS.outside;
    if (mods.disabled) cls += " " + CLS.disabled;
    if (mods.booked) cls += " " + CLS.booked;
    return cls;
  }

  function renderWeeks(root, block, s, month) {
    const tbody = block.querySelector("tbody");
    const template = root.querySelector(":scope > template");
    if (!tbody || !template) return;
    tbody.innerHTML = "";

    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() - s.startOfWeek + 7) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const rows = s.fixedWeeks ? 6 : Math.ceil((lead + daysInMonth) / 7);
    const today = new Date();

    for (let w = 0; w < rows; w++) {
      const tr = document.createElement("tr");
      tr.className = CLS.week;
      if (s.weekNumbers) {
        const td = document.createElement("td");
        td.className = CLS.weekNumber;
        const inner = document.createElement("div");
        inner.className = CLS.weekNumberInner;
        inner.textContent = String(isoWeek(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7))).padStart(2, "0");
        td.appendChild(inner);
        tr.appendChild(td);
      }
      for (let i = 0; i < 7; i++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
        const outside = date.getMonth() !== month.getMonth();
        const mods = {
          outside: outside,
          today: sameDay(date, today),
          disabled: isDisabled(s, date),
          booked: s.bookedDates.some((d) => sameDay(d, date)),
          selectedSingle: false,
          rangeStart: false,
          rangeMiddle: false,
          rangeEnd: false,
        };
        if (s.mode === "range" && s.selected) {
          const from = s.selected;
          const to = s.end;
          if (to && !sameDay(from, to)) {
            mods.rangeStart = sameDay(date, from);
            mods.rangeEnd = sameDay(date, to);
            mods.rangeMiddle = date > from && date < to;
          } else {
            mods.rangeStart = sameDay(date, from);
            mods.rangeEnd = sameDay(date, from);
          }
        } else if (s.selected) {
          mods.selectedSingle = sameDay(date, s.selected);
        }
        const selected = mods.selectedSingle || mods.rangeStart || mods.rangeMiddle || mods.rangeEnd;

        const td = document.createElement("td");
        td.className = dayCellClasses(s, mods) + (outside && !s.outsideDays ? " invisible" : "");
        td.setAttribute("data-day", toISO(date));
        td.setAttribute("data-selected", selected ? "true" : "false");

        const btn = template.content.firstElementChild.cloneNode(true);
        btn.textContent = String(date.getDate());
        btn.setAttribute("data-day", date.toLocaleDateString(s.locale));
        btn.setAttribute("data-outside", outside ? "true" : "false");
        btn.setAttribute("data-selected-single", mods.selectedSingle ? "true" : "false");
        btn.setAttribute("data-range-start", mods.rangeStart ? "true" : "false");
        btn.setAttribute("data-range-middle", mods.rangeMiddle ? "true" : "false");
        btn.setAttribute("data-range-end", mods.rangeEnd ? "true" : "false");
        if (selected) btn.setAttribute("aria-selected", "true");
        if (mods.disabled || (outside && !s.outsideDays)) btn.disabled = true;
        td.appendChild(btn);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function updateNav(root, s) {
    const [prev, next] = navButtons(root);
    if (prev && s.min) {
      prev.disabled = s.month <= new Date(s.min.getFullYear(), s.min.getMonth(), 1);
    }
    if (next && s.max) {
      next.disabled = new Date(s.month.getFullYear(), s.month.getMonth() + 1, 1) > s.max;
    }
  }

  function sync(root, s) {
    // The form inputs: the value first, the range end second.
    const [hidden, hiddenEnd] = root.querySelectorAll(':scope > input[type="hidden"]');
    if (hiddenEnd) hiddenEnd.value = toISO(s.end);
    if (hidden && hidden.value !== toISO(s.selected)) {
      hidden.value = toISO(s.selected);
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    }
    root.dispatchEvent(
      new CustomEvent("calendar-change", {
        bubbles: true,
        detail: { value: s.selected, endValue: s.end, valueISO: toISO(s.selected), endValueISO: toISO(s.end) },
      }),
    );
  }

  // Range selection is react-day-picker's addToRange (min 0, not required):
  // every click yields a complete range, a single day means from == to.
  // Clicking that single day again clears, clicking the start collapses to
  // it, clicking the end makes it the new start, clicks before/after extend,
  // clicks inside move the end.
  function selectDate(root, date) {
    const s = state(root);
    if (s.mode === "range") {
      const from = s.selected;
      const to = s.end || s.selected;
      if (!from) {
        s.selected = date;
        s.end = date;
      } else if (sameDay(from, date) && sameDay(to, date)) {
        s.selected = null;
        s.end = null;
      } else if (sameDay(from, date)) {
        s.end = date;
      } else if (sameDay(to, date)) {
        s.selected = date;
        s.end = date;
      } else if (date < from) {
        s.selected = date;
      } else {
        s.end = date;
      }
    } else {
      s.selected = sameDay(s.selected, date) ? null : date;
    }
    render(root);
    sync(root, s);
    // Re-rendering destroyed the clicked button; refocus its replacement so
    // the focus ring stays on the day, exactly like react-day-picker.
    const btn = dayButton(root, toISO(date));
    if (btn) btn.focus();
  }

  function setDate(root, date) {
    const s = state(root);
    s.selected = date;
    s.end = s.mode === "range" ? date : null;
    s.month = new Date(date.getFullYear(), date.getMonth(), 1);
    render(root);
    sync(root, s);
  }

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const root = e.target.closest(ROOT);
    if (!root) return;
    const s = state(root);

    const day = e.target.closest(DAY);
    if (day && !day.disabled) {
      selectDate(root, parseISO(dayISO(day)));
      return;
    }
    const [prev, next] = navButtons(root);
    if (prev && prev.contains(e.target)) {
      s.month = new Date(s.month.getFullYear(), s.month.getMonth() - 1, 1);
      render(root);
      return;
    }
    if (next && next.contains(e.target)) {
      s.month = new Date(s.month.getFullYear(), s.month.getMonth() + 1, 1);
      render(root);
    }
  });

  document.addEventListener("change", (e) => {
    if (!(e.target instanceof Element)) return;
    const root = e.target.closest(ROOT);
    if (!root || e.target.tagName !== "SELECT") return;
    const s = state(root);
    const block = monthBlocks(root).find((b) => b.contains(e.target));
    const [monthSelect, yearSelect] = block ? block.querySelectorAll("select") : [];
    if (e.target === monthSelect) {
      s.month = new Date(s.month.getFullYear(), parseInt(e.target.value, 10), 1);
      render(root);
    } else if (e.target === yearSelect) {
      s.month = new Date(parseInt(e.target.value, 10), s.month.getMonth(), 1);
      render(root);
    }
  });

  // Programmatic selection, e.g. from preset buttons: dispatch a
  // "calendar-set" CustomEvent with detail.date (ISO) on/inside the calendar.
  document.addEventListener("calendar-set", (e) => {
    const root = e.target instanceof Element && e.target.closest(ROOT);
    if (!root) return;
    const date = parseISO(e.detail && e.detail.date);
    if (date) setDate(root, date);
  });

  // Keyboard: arrows move day focus, Enter/Space activate natively.
  document.addEventListener("keydown", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches(DAY)) return;
    const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    const root = e.target.closest(ROOT);
    const s = state(root);
    const current = parseISO(dayISO(e.target));
    const nextDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + delta);
    if (nextDate.getMonth() !== s.month.getMonth() || nextDate.getFullYear() !== s.month.getFullYear()) {
      s.month = new Date(nextDate.getFullYear(), nextDate.getMonth(), 1);
      render(root);
    }
    const btn = dayButton(root, toISO(nextDate));
    if (btn) btn.focus();
  });

  // The focus ring lives on the cell (group/day) like react-day-picker.
  document.addEventListener("focusin", (e) => {
    if (e.target instanceof Element && e.target.matches(DAY)) {
      const td = e.target.closest("td");
      if (td) td.setAttribute("data-focused", "true");
    }
  });
  document.addEventListener("focusout", (e) => {
    if (e.target instanceof Element && e.target.matches(DAY)) {
      const td = e.target.closest("td");
      if (td) td.removeAttribute("data-focused");
    }
  });

  function init() {
    containers().forEach((root) => {
      if (!root._templRendered) {
        root._templRendered = true;
        render(root);
      }
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
