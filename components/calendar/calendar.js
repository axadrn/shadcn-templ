// Port of react-day-picker 9.8.1's DayPicker with shadcn's Calendar
// (classNames, Root, Chevron, CalendarDayButton, WeekNumber). The root
// carries the props, the template the parts with shadcn's style classes; each
// render builds the tree like React and patches the DOM in place.
(function () {
  "use strict";

  const ROOT = '[data-slot="calendar"]';

  // ----- DateLib: the date-fns functions DayPicker uses, local time -------

  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

  function newDate(y, m, d) {
    return new Date(y, m, d);
  }
  const startOfDay = (d) => newDate(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfMonth = (d) => newDate(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d) => newDate(d.getFullYear(), d.getMonth() + 1, 0);
  const startOfYear = (d) => newDate(d.getFullYear(), 0, 1);
  const endOfYear = (d) => newDate(d.getFullYear(), 11, 31);
  const addDays = (d, n) => newDate(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const addWeeks = (d, n) => addDays(d, n * 7);
  function addMonths(d, n) {
    const target = newDate(d.getFullYear(), d.getMonth() + n, 1);
    const days = endOfMonth(target).getDate();
    return newDate(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), days));
  }
  const addYears = (d, n) => addMonths(d, n * 12);
  const setMonth = (d, m) => addMonths(d, m - d.getMonth());
  const setYear = (d, y) => addMonths(d, (y - d.getFullYear()) * 12);
  const isSameDay = (a, b) => +startOfDay(a) === +startOfDay(b);
  const isSameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const isSameYear = (a, b) => a.getFullYear() === b.getFullYear();
  const isBefore = (a, b) => +a < +b;
  const isAfter = (a, b) => +a > +b;
  const differenceInCalendarDays = (a, b) => Math.round((+startOfDay(a) - +startOfDay(b)) / 864e5);
  const differenceInCalendarMonths = (a, b) => (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  const isDate = (v) => v instanceof Date;
  const max = (dates) => new Date(Math.max(...dates.map(Number)));
  const min = (dates) => new Date(Math.min(...dates.map(Number)));

  function createDateLib(options) {
    const weekStartsOn = options.weekStartsOn ?? 0;
    // enUS: the first week contains January 1st.
    const firstWeekContainsDate = 1;
    const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() - weekStartsOn + 7) % 7));
    const endOfWeek = (d) => addDays(startOfWeek(d), 6);
    const startOfISOWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
    const endOfISOWeek = (d) => addDays(startOfISOWeek(d), 6);
    function getWeekYear(d) {
      const year = d.getFullYear();
      if (+d >= +startOfWeek(newDate(year + 1, 0, firstWeekContainsDate))) return year + 1;
      if (+d >= +startOfWeek(newDate(year, 0, firstWeekContainsDate))) return year;
      return year - 1;
    }
    const getWeek = (d) =>
      Math.round((+startOfWeek(d) - +startOfWeek(newDate(getWeekYear(d), 0, firstWeekContainsDate))) / MS_WEEK) + 1;
    function getISOWeek(d) {
      const thursday = addDays(startOfISOWeek(d), 3);
      const firstThursday = addDays(startOfISOWeek(newDate(thursday.getFullYear(), 0, 4)), 3);
      return Math.round((+thursday - +firstThursday) / MS_WEEK) + 1;
    }
    return {
      options,
      today: () => startOfDay(new Date()),
      startOfWeek,
      endOfWeek,
      startOfISOWeek,
      endOfISOWeek,
      getWeek,
      getISOWeek,
      format: (date, fmt) => format(date, fmt, options.locale),
    };
  }

  // date-fns enUS for the tokens DayPicker formats with; another locale
  // goes through Intl.
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  function ordinal(n) {
    const rem100 = n % 100;
    if (rem100 > 20 || rem100 < 10) {
      if (rem100 % 10 === 1) return n + "st";
      if (rem100 % 10 === 2) return n + "nd";
      if (rem100 % 10 === 3) return n + "rd";
    }
    return n + "th";
  }
  function format(date, fmt, locale) {
    switch (fmt) {
      case "yyyy-MM-dd":
        return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      case "yyyy-MM":
        return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}`;
      case "yyyy":
        return pad(date.getFullYear(), 4);
      case "d":
        return String(date.getDate());
    }
    if (locale && !/^en(-US)?$/.test(locale)) {
      const opts = {
        "LLLL y": { month: "long", year: "numeric" },
        LLLL: { month: "long" },
        PPPP: { dateStyle: "full" },
        cccc: { weekday: "long" },
        cccccc: { weekday: "short" },
      }[fmt];
      return new Intl.DateTimeFormat(locale, opts).format(date);
    }
    switch (fmt) {
      case "LLLL y":
        return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
      case "LLLL":
        return MONTHS[date.getMonth()];
      case "PPPP":
        return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
      case "cccc":
        return WEEKDAYS[date.getDay()];
      case "cccccc":
        return WEEKDAYS[date.getDay()].slice(0, 2);
    }
    return date.toString();
  }

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    return m ? newDate(+m[1], +m[2] - 1, +m[3]) : undefined;
  }

  // A matcher from its JSON: a date string, an array of matchers or an
  // object with Date strings.
  function parseMatcher(v) {
    if (typeof v === "string") return parseDate(v);
    if (Array.isArray(v)) return v.map(parseMatcher);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = k === "dayOfWeek" ? x : parseMatcher(x);
      return out;
    }
    return v;
  }

  // ----- utils --------------------------------------------------------------

  const isDateInterval = (m) => Boolean(m && typeof m === "object" && "before" in m && "after" in m);
  const isDateRange = (v) => Boolean(v && typeof v === "object" && "from" in v);
  const isDateAfterType = (v) => Boolean(v && typeof v === "object" && "after" in v);
  const isDateBeforeType = (v) => Boolean(v && typeof v === "object" && "before" in v);
  const isDayOfWeekType = (v) => Boolean(v && typeof v === "object" && "dayOfWeek" in v);
  const isDatesArray = (v) => Array.isArray(v) && v.every(isDate);

  function rangeIncludesDate(range, date, excludeEnds = false) {
    let { from, to } = range;
    if (from && to) {
      if (differenceInCalendarDays(to, from) < 0) [from, to] = [to, from];
      return (
        differenceInCalendarDays(date, from) >= (excludeEnds ? 1 : 0) &&
        differenceInCalendarDays(to, date) >= (excludeEnds ? 1 : 0)
      );
    }
    if (!excludeEnds && to) return isSameDay(to, date);
    if (!excludeEnds && from) return isSameDay(from, date);
    return false;
  }

  function dateMatchModifiers(date, matchers) {
    const matchersArr = !Array.isArray(matchers) ? [matchers] : matchers;
    return matchersArr.some((matcher) => {
      if (typeof matcher === "boolean") return matcher;
      if (isDate(matcher)) return isSameDay(date, matcher);
      if (isDatesArray(matcher)) return matcher.includes(date);
      if (isDateRange(matcher)) return rangeIncludesDate(matcher, date, false);
      if (isDayOfWeekType(matcher)) {
        if (!Array.isArray(matcher.dayOfWeek)) return matcher.dayOfWeek === date.getDay();
        return matcher.dayOfWeek.includes(date.getDay());
      }
      if (isDateInterval(matcher)) {
        const diffBefore = differenceInCalendarDays(matcher.before, date);
        const diffAfter = differenceInCalendarDays(matcher.after, date);
        const isDayBefore = diffBefore > 0;
        const isDayAfter = diffAfter < 0;
        if (isAfter(matcher.before, matcher.after)) return isDayAfter && isDayBefore;
        return isDayBefore || isDayAfter;
      }
      if (isDateAfterType(matcher)) return differenceInCalendarDays(date, matcher.after) > 0;
      if (isDateBeforeType(matcher)) return differenceInCalendarDays(matcher.before, date) > 0;
      if (typeof matcher === "function") return matcher(date);
      return false;
    });
  }

  function addToRange(date, initialRange, minDays = 0, maxDays = 0, required = false) {
    const { from, to } = initialRange || {};
    let range;
    if (!from && !to) {
      range = { from: date, to: minDays > 0 ? undefined : date };
    } else if (from && !to) {
      if (isSameDay(from, date)) range = required ? { from, to: undefined } : undefined;
      else if (isBefore(date, from)) range = { from: date, to: from };
      else range = { from, to: date };
    } else if (from && to) {
      if (isSameDay(from, date) && isSameDay(to, date)) range = required ? { from, to } : undefined;
      else if (isSameDay(from, date)) range = { from, to: minDays > 0 ? undefined : date };
      else if (isSameDay(to, date)) range = { from: date, to: minDays > 0 ? undefined : date };
      else if (isBefore(date, from)) range = { from: date, to };
      else if (isAfter(date, from)) range = { from, to: date };
      else if (isAfter(date, to)) range = { from, to: date };
      else throw new Error("Invalid range");
    }
    if (range?.from && range?.to) {
      const diff = differenceInCalendarDays(range.to, range.from);
      if (maxDays > 0 && diff > maxDays) range = { from: date, to: undefined };
      else if (minDays > 1 && diff < minDays) range = { from: date, to: undefined };
    }
    return range;
  }

  // ----- the calendar model -------------------------------------------------

  class CalendarDay {
    constructor(date, displayMonth) {
      this.date = date;
      this.displayMonth = displayMonth;
      this.outside = Boolean(displayMonth && !isSameMonth(date, displayMonth));
    }
    isEqualTo(day) {
      return isSameDay(day.date, this.date) && isSameMonth(day.displayMonth, this.displayMonth);
    }
  }

  function getNavMonths(props, dateLib) {
    let { startMonth, endMonth } = props;
    const hasYearDropdown = props.captionLayout === "dropdown" || props.captionLayout === "dropdown-years";
    if (startMonth) startMonth = startOfMonth(startMonth);
    else if (hasYearDropdown) startMonth = startOfYear(addYears(dateLib.today(), -100));
    if (endMonth) endMonth = endOfMonth(endMonth);
    else if (hasYearDropdown) endMonth = endOfYear(dateLib.today());
    return [startMonth ? startOfDay(startMonth) : startMonth, endMonth ? startOfDay(endMonth) : endMonth];
  }

  function getInitialMonth(props, navStart, navEnd, dateLib) {
    const { month, defaultMonth, numberOfMonths = 1 } = props;
    let initialMonth = month || defaultMonth || dateLib.today();
    if (navEnd && differenceInCalendarMonths(navEnd, initialMonth) < numberOfMonths - 1) {
      initialMonth = addMonths(navEnd, -1 * (numberOfMonths - 1));
    }
    if (navStart && differenceInCalendarMonths(initialMonth, navStart) < 0) initialMonth = navStart;
    return startOfMonth(initialMonth);
  }

  // useCalendar: the displayed months with their weeks and days.
  function getCalendar(props, firstMonth, navStart, navEnd, dateLib) {
    const { numberOfMonths = 1, fixedWeeks, ISOWeek } = props;
    const displayMonths = [];
    for (let i = 0; i < numberOfMonths; i++) {
      const month = addMonths(firstMonth, i);
      if (navEnd && month > navEnd) break;
      displayMonths.push(month);
    }
    const sow = (d) => (ISOWeek ? dateLib.startOfISOWeek(d) : dateLib.startOfWeek(d));
    const eow = (d) => (ISOWeek ? dateLib.endOfISOWeek(d) : dateLib.endOfWeek(d));
    // getDates
    const maxDate = props.endMonth ? endOfMonth(props.endMonth) : undefined;
    const firstMonthOf = displayMonths[0];
    const lastMonth = displayMonths[displayMonths.length - 1];
    const startWeekFirstDate = sow(firstMonthOf);
    const endWeekLastDate = eow(endOfMonth(lastMonth));
    const nOfDays = differenceInCalendarDays(endWeekLastDate, startWeekFirstDate);
    const nOfMonths = differenceInCalendarMonths(lastMonth, firstMonthOf) + 1;
    const dates = [];
    for (let i = 0; i <= nOfDays; i++) {
      const date = addDays(startWeekFirstDate, i);
      if (maxDate && isAfter(date, maxDate)) break;
      dates.push(date);
    }
    const extraDates = 42 * nOfMonths;
    if (fixedWeeks && dates.length < extraDates) {
      const daysToAdd = extraDates - dates.length;
      for (let i = 0; i < daysToAdd; i++) dates.push(addDays(dates[dates.length - 1], 1));
    }
    // getMonths
    const months = displayMonths.map((month) => {
      const firstDateOfFirstWeek = sow(month);
      const lastDateOfLastWeek = eow(endOfMonth(month));
      const monthDates = dates.filter((date) => date >= firstDateOfFirstWeek && date <= lastDateOfLastWeek);
      if (fixedWeeks && monthDates.length < 42) {
        const daysToAdd = 42 - monthDates.length;
        monthDates.push(...dates.filter((date) => date > lastDateOfLastWeek && date <= addDays(lastDateOfLastWeek, daysToAdd)));
      }
      const weeks = [];
      for (const date of monthDates) {
        const weekNumber = ISOWeek ? dateLib.getISOWeek(date) : dateLib.getWeek(date);
        const day = new CalendarDay(date, month);
        const week = weeks.find((w) => w.weekNumber === weekNumber);
        if (!week) weeks.push({ weekNumber, days: [day] });
        else week.days.push(day);
      }
      return { date: month, weeks };
    });
    const days = months.flatMap((m) => m.weeks.flatMap((w) => w.days));
    // getPreviousMonth and getNextMonth
    const month = startOfMonth(firstMonth);
    let previousMonth = addMonths(month, -1);
    if (navStart && differenceInCalendarMonths(month, navStart) <= 0) previousMonth = undefined;
    let nextMonth = addMonths(month, 1);
    if (navEnd && differenceInCalendarMonths(navEnd, firstMonth) < numberOfMonths) nextMonth = undefined;
    return { months, days, previousMonth, nextMonth };
  }

  // createGetModifiers
  function createGetModifiers(days, props, navStart, navEnd, dateLib) {
    const { disabled, hidden, modifiers, showOutsideDays } = props;
    const computedNavStart = navStart && startOfMonth(navStart);
    const computedNavEnd = navEnd && endOfMonth(navEnd);
    const internal = { focused: [], outside: [], disabled: [], hidden: [], today: [] };
    const custom = {};
    for (const day of days) {
      const { date, displayMonth } = day;
      const isOutside = Boolean(displayMonth && !isSameMonth(date, displayMonth));
      const isBeforeNavStart = Boolean(computedNavStart && isBefore(date, computedNavStart));
      const isAfterNavEnd = Boolean(computedNavEnd && isAfter(date, computedNavEnd));
      const isDisabled = Boolean(disabled && dateMatchModifiers(date, disabled));
      const isHidden =
        Boolean(hidden && dateMatchModifiers(date, hidden)) || isBeforeNavStart || isAfterNavEnd || (!showOutsideDays && isOutside);
      if (isOutside) internal.outside.push(day);
      if (isDisabled) internal.disabled.push(day);
      if (isHidden) internal.hidden.push(day);
      if (isSameDay(date, dateLib.today())) internal.today.push(day);
      if (modifiers) {
        Object.keys(modifiers).forEach((name) => {
          const value = modifiers[name];
          if (!(value ? dateMatchModifiers(date, value) : false)) return;
          (custom[name] ||= []).push(day);
        });
      }
    }
    return (day) => {
      const dayFlags = { focused: false, disabled: false, hidden: false, outside: false, today: false };
      const customModifiers = {};
      for (const name in internal) dayFlags[name] = internal[name].some((d) => d === day);
      for (const name in custom) customModifiers[name] = custom[name].some((d) => d === day);
      return { ...dayFlags, ...customModifiers };
    };
  }

  // calculateFocusTarget
  function calculateFocusTarget(days, getModifiers, isSelected, lastFocused) {
    const focusable = (m) => !m.disabled && !m.hidden && !m.outside;
    let focusTarget;
    let priority = -1;
    for (const day of days) {
      const m = getModifiers(day);
      if (!focusable(m)) continue;
      if (m.focused && priority < 3) {
        focusTarget = day;
        priority = 3;
      } else if (lastFocused?.isEqualTo(day) && priority < 2) {
        focusTarget = day;
        priority = 2;
      } else if (isSelected(day.date) && priority < 1) {
        focusTarget = day;
        priority = 1;
      } else if (m.today && priority < 0) {
        focusTarget = day;
        priority = 0;
      }
    }
    return focusTarget || days.find((day) => focusable(getModifiers(day)));
  }

  // getNextFocus with getFocusableDate
  function getNextFocus(moveBy, moveDir, refDay, navStart, navEnd, props, dateLib, attempt = 0) {
    if (attempt > 365) return undefined;
    const moveFns = {
      day: addDays,
      week: addWeeks,
      month: addMonths,
      year: addYears,
      startOfWeek: (d) => (props.ISOWeek ? dateLib.startOfISOWeek(d) : dateLib.startOfWeek(d)),
      endOfWeek: (d) => (props.ISOWeek ? dateLib.endOfISOWeek(d) : dateLib.endOfWeek(d)),
    };
    let date = moveFns[moveBy](refDay.date, moveDir === "after" ? 1 : -1);
    if (moveDir === "before" && navStart) date = max([navStart, date]);
    else if (moveDir === "after" && navEnd) date = min([navEnd, date]);
    const isDisabled = Boolean(props.disabled && dateMatchModifiers(date, props.disabled));
    const isHidden = Boolean(props.hidden && dateMatchModifiers(date, props.hidden));
    const focusDay = new CalendarDay(date, date);
    if (!isDisabled && !isHidden) return focusDay;
    return getNextFocus(moveBy, moveDir, focusDay, navStart, navEnd, props, dateLib, attempt + 1);
  }

  // ----- props and state ------------------------------------------------------

  function json(root, name) {
    const v = root.getAttribute(name);
    return v ? JSON.parse(v) : undefined;
  }

  // weekStartsOn: the prop, else the locale's first day like a date-fns
  // locale's options carry it, else Sunday (enUS).
  function weekStartsOn(root) {
    const prop = root.getAttribute("data-templ-week-starts-on");
    if (prop) return parseInt(prop, 10);
    const locale = root.getAttribute("data-templ-locale");
    if (!locale) return 0;
    try {
      const l = new Intl.Locale(locale);
      const info = l.getWeekInfo?.() ?? l.weekInfo;
      return info ? info.firstDay % 7 : 0;
    } catch {
      return 0;
    }
  }

  function readProps(root) {
    const numberOfMonths = parseInt(root.getAttribute("data-templ-number-of-months"), 10) || 1;
    const props = {
      mode: root.getAttribute("data-mode") || undefined,
      captionLayout: root.getAttribute("data-templ-caption-layout") || "label",
      numberOfMonths,
      showOutsideDays: root.getAttribute("data-templ-show-outside-days") !== "false",
      fixedWeeks: root.hasAttribute("data-templ-fixed-weeks"),
      showWeekNumber: root.hasAttribute("data-week-numbers"),
      ISOWeek: false,
      dir: root.getAttribute("dir") || undefined,
      locale: root.getAttribute("data-templ-locale") || undefined,
      weekStartsOn: weekStartsOn(root),
      month: parseDate(root.getAttribute("data-templ-month")),
      defaultMonth: parseDate(root.getAttribute("data-templ-default-month")),
      startMonth: parseDate(root.getAttribute("data-templ-start-month")),
      endMonth: parseDate(root.getAttribute("data-templ-end-month")),
      disabled: parseMatcher(json(root, "data-templ-disabled")),
      modifiers: parseMatcher(json(root, "data-templ-modifiers")),
      modifiersClassNames: json(root, "data-templ-modifiers-class-names") || {},
      required: root.getAttribute("data-required") === "true",
    };
    const selected = json(root, "data-templ-selected");
    props.selected = selected === undefined ? undefined : parseMatcher(selected);
    return props;
  }

  function stateOf(root) {
    if (!root._templCalendar) {
      const props = readProps(root);
      const dateLib = createDateLib({ locale: props.locale, weekStartsOn: props.weekStartsOn });
      const [navStart, navEnd] = getNavMonths(props, dateLib);
      root._templCalendar = {
        props,
        dateLib,
        navStart,
        navEnd,
        firstMonth: getInitialMonth(props, navStart, navEnd, dateLib),
        selected: props.selected,
        focused: undefined,
        lastFocused: undefined,
        formatters: {},
        components: {},
        // The first render is the server's, unless the calendar sits in a
        // popup that mounts it on open.
        serverRendered: !root.closest("[hidden]"),
      };
    }
    return root._templCalendar;
  }

  // useSelection
  function selection(s) {
    const { mode, required } = s.props;
    const selected = s.selected;
    if (mode === "single") {
      return {
        isSelected: (date) => (selected ? isSameDay(selected, date) : false),
        select: (date) => (!required && selected && isSameDay(date, selected) ? undefined : date),
      };
    }
    if (mode === "multiple") {
      const isSelected = (date) => selected?.some((d) => isSameDay(d, date)) ?? false;
      return {
        isSelected,
        select: (date) => {
          if (isSelected(date)) {
            if (required && selected?.length === 1) return selected;
            return selected?.filter((d) => !isSameDay(d, date));
          }
          return [...(selected ?? []), date];
        },
      };
    }
    if (mode === "range") {
      return {
        isSelected: (date) => selected && rangeIncludesDate(selected, date, false),
        select: (date) => addToRange(date, selected, 0, 0, required),
      };
    }
    return undefined;
  }

  // ----- render ---------------------------------------------------------------

  const CLASS = {
    months: "relative flex flex-col gap-4 md:flex-row rdp-months",
    month: "flex w-full flex-col gap-4 rdp-month",
    monthCaption: "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size) rdp-month_caption",
    dropdowns: "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium rdp-dropdowns",
    dropdown: "absolute inset-0 bg-popover opacity-0 rdp-dropdown",
    monthGrid: "w-full border-collapse rdp-month_grid",
    weekdays: "flex rdp-weekdays",
    weekday: "flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none rdp-weekday",
    weeks: "rdp-weeks",
    week: "mt-2 flex w-full rdp-week",
    weekNumberHeader: "w-(--cell-size) select-none rdp-week_number_header",
    weekNumber: "text-[0.8rem] text-muted-foreground select-none rdp-week_number",
    weekNumberContent: "flex size-(--cell-size) items-center justify-center text-center",
    // classNames per day flag and selection state.
    day: "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
    focused: "rdp-focused",
    disabled: "text-muted-foreground opacity-50 rdp-disabled",
    hidden: "invisible rdp-hidden",
    outside: "text-muted-foreground aria-selected:text-muted-foreground rdp-outside",
    today: "rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none rdp-today",
    selected: "rdp-selected",
    range_start:
      "relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted rdp-range_start",
    range_middle: "rounded-none rdp-range_middle",
    range_end:
      "relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted rdp-range_end",
  };

  const STATUS_STYLE =
    "border: 0px; clip: rect(0px, 0px, 0px, 0px); height: 1px; margin: -1px; overflow: hidden; padding: 0px; position: absolute; width: 1px; white-space: nowrap; overflow-wrap: normal;";

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      node.setAttribute(k, v === true ? "true" : String(v));
    }
    node.append(...children.filter((c) => c !== undefined && c !== null && c !== false));
    return node;
  }

  // The template holds the parts with shadcn's style classes, in order: the
  // nav, the caption label, the dropdown root, the dropdown chevron and the
  // day button.
  function parts(root) {
    const [nav, captionLabel, dropdownRoot, dropdownChevron, dayButton] = root.querySelector(":scope > template").content.children;
    return { nav, captionLabel, dropdownRoot, dropdownChevron, dayButton };
  }

  const clone = (node) => node.cloneNode(true);

  function formatMonthDropdown(s, date) {
    if (s.formatters.formatMonthDropdown) return s.formatters.formatMonthDropdown(date);
    return date.toLocaleString(s.props.locale, { month: "short" });
  }

  function dropdown(s, p, { className, ariaLabel, options, value }) {
    const selectedOption = options?.find((o) => o.value === value);
    const select = el(
      "select",
      { class: `${CLASS.dropdown} ${className}`, "aria-label": ariaLabel },
      // The server render marks the selected option, a client render sets
      // the value only.
      (options || []).map((o) =>
        el("option", { value: o.value, disabled: o.disabled ? "" : undefined, selected: s.serverRendered && o.value === value ? "" : undefined }, [o.label]),
      ),
    );
    select.value = String(value);
    const caption = clone(p.captionLabel);
    caption.setAttribute("aria-hidden", "true");
    caption.append(selectedOption ? selectedOption.label : "", clone(p.dropdownChevron));
    const root = clone(p.dropdownRoot);
    root.setAttribute("data-disabled", "false");
    root.append(select, caption);
    return root;
  }

  function build(root) {
    const s = stateOf(root);
    const { props, dateLib } = s;
    const p = parts(root);
    const firstMonth = props.month ? startOfMonth(props.month) : s.firstMonth;
    const calendar = getCalendar(props, firstMonth, s.navStart, s.navEnd, dateLib);
    s.calendar = calendar;
    const { months, days, previousMonth, nextMonth } = calendar;
    const getModifiers = createGetModifiers(days, props, s.navStart, s.navEnd, dateLib);
    const sel = selection(s);
    const isSelected = sel?.isSelected ?? (() => false);
    const focusTarget = calculateFocusTarget(days, getModifiers, isSelected, s.lastFocused);
    const isInteractive = props.mode !== undefined;
    const weekStart = props.ISOWeek ? dateLib.startOfISOWeek(dateLib.today()) : dateLib.startOfWeek(dateLib.today());
    const weekdays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    s.dayCells = new Map();

    // Nav
    const nav = clone(p.nav);
    nav.setAttribute("aria-label", "");
    const [prev, next] = nav.children;
    for (const [button, month, label] of [
      [prev, previousMonth, "Go to the Previous Month"],
      [next, nextMonth, "Go to the Next Month"],
    ]) {
      button.setAttribute("aria-label", label);
      if (!month) {
        button.setAttribute("tabindex", "-1");
        button.setAttribute("aria-disabled", "true");
        button.firstElementChild?.setAttribute("disabled", "");
      }
    }

    const monthEls = months.map((calendarMonth, displayIndex) => {
      // MonthCaption
      const caption = el("div", { class: CLASS.monthCaption });
      const captionText = dateLib.format(calendarMonth.date, "LLLL y");
      if (props.captionLayout.startsWith("dropdown")) {
        const nav = el("div", { class: CLASS.dropdowns });
        const monthOptions = Array.from({ length: 12 }, (_, m) => {
          const month = newDate(calendarMonth.date.getFullYear(), m, 1);
          const disabled = (s.navStart && month < startOfMonth(s.navStart)) || (s.navEnd && month > startOfMonth(s.navEnd)) || false;
          return { value: m, label: formatMonthDropdown(s, month), disabled };
        });
        let yearOptions;
        if (s.navStart && s.navEnd) {
          yearOptions = [];
          for (let y = s.navStart.getFullYear(); y <= s.navEnd.getFullYear(); y++) {
            yearOptions.push({ value: y, label: dateLib.format(newDate(y, 0, 1), "yyyy"), disabled: false });
          }
        }
        nav.append(
          props.captionLayout === "dropdown" || props.captionLayout === "dropdown-months"
            ? dropdown(s, p, {
                className: "rdp-months_dropdown",
                ariaLabel: "Choose the Month",
                options: monthOptions,
                value: calendarMonth.date.getMonth(),
              })
            : el("span", {}, [formatMonthDropdown(s, calendarMonth.date)]),
          props.captionLayout === "dropdown" || props.captionLayout === "dropdown-years"
            ? dropdown(s, p, {
                className: "rdp-years_dropdown",
                ariaLabel: "Choose the Year",
                options: yearOptions,
                value: calendarMonth.date.getFullYear(),
              })
            : el("span", {}, [dateLib.format(calendarMonth.date, "yyyy")]),
          el("span", { role: "status", "aria-live": "polite", style: STATUS_STYLE }, [captionText]),
        );
        caption.append(nav);
      } else {
        const label = clone(p.captionLabel);
        label.setAttribute("role", "status");
        label.setAttribute("aria-live", "polite");
        label.textContent = captionText;
        caption.append(label);
      }

      // MonthGrid
      const headRow = el("tr", { class: CLASS.weekdays }, [
        props.showWeekNumber && el("th", { "aria-label": "Week Number", class: CLASS.weekNumberHeader, scope: "col" }),
        ...weekdays.map((weekday) =>
          el("th", { "aria-label": dateLib.format(weekday, "cccc"), class: CLASS.weekday, scope: "col" }, [dateLib.format(weekday, "cccccc")]),
        ),
      ]);
      const tbody = el(
        "tbody",
        { class: CLASS.weeks },
        calendarMonth.weeks.map((week) =>
          el("tr", { class: CLASS.week }, [
            props.showWeekNumber &&
              el("td", { week: "[object Object]", "aria-label": `Week ${week.weekNumber}`, class: CLASS.weekNumber, scope: "row", role: "rowheader" }, [
                el("div", { class: CLASS.weekNumberContent }, [week.weekNumber < 10 ? `0${week.weekNumber}` : `${week.weekNumber}`]),
              ]),
            ...week.days.map((day) => dayCell(s, p, day, getModifiers, isSelected, focusTarget, isInteractive)),
          ]),
        ),
      );
      const table = el(
        "table",
        {
          role: "grid",
          "aria-multiselectable": String(props.mode === "multiple" || props.mode === "range"),
          "aria-label": dateLib.format(calendarMonth.date, "LLLL y") || undefined,
          class: CLASS.monthGrid,
        },
        [el("thead", { "aria-hidden": "true" }, [headRow]), tbody],
      );
      return el("div", { class: CLASS.month }, [caption, table]);
    });

    return [el("div", { class: CLASS.months }, [nav, ...monthEls])];
  }

  function dayCell(s, p, day, getModifiers, isSelected, focusTarget, isInteractive) {
    const { date } = day;
    const { props, dateLib } = s;
    const modifiers = getModifiers(day);
    modifiers.focused = !modifiers.hidden && Boolean(s.focused?.isEqualTo(day));
    modifiers.selected = isSelected(date) || modifiers.selected;
    if (isDateRange(s.selected)) {
      const { from, to } = s.selected;
      modifiers.range_start = Boolean(from && to && isSameDay(date, from));
      modifiers.range_end = Boolean(from && to && isSameDay(date, to));
      modifiers.range_middle = rangeIncludesDate(s.selected, date, true);
    }
    // getClassNamesForModifiers
    const classNames = [CLASS.day];
    if (!props.showWeekNumber) classNames[0] += " [&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)";
    else classNames[0] += " [&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)";
    classNames[0] += " rdp-day";
    for (const [key, active] of Object.entries(modifiers)) {
      if (active !== true) continue;
      if (props.modifiersClassNames[key]) classNames.push(props.modifiersClassNames[key]);
      else if (CLASS[key] && key !== "day") classNames.push(CLASS[key]);
    }
    const label = (base) => {
      let l = dateLib.format(date, "PPPP");
      if (modifiers.today) l = `Today, ${l}`;
      if (base && modifiers.selected) l = `${l}, selected`;
      return l;
    };
    const td = el("td", {
      class: classNames.join(" "),
      role: "gridcell",
      "aria-selected": modifiers.selected || undefined,
      "aria-label": !isInteractive && !modifiers.hidden ? label(false) : undefined,
      "data-day": dateLib.format(date, "yyyy-MM-dd"),
      "data-month": day.outside ? dateLib.format(date, "yyyy-MM") : undefined,
      "data-selected": modifiers.selected || undefined,
      "data-disabled": modifiers.disabled || undefined,
      "data-hidden": modifiers.hidden || undefined,
      "data-outside": day.outside || undefined,
      "data-focused": modifiers.focused || undefined,
      "data-today": modifiers.today || undefined,
    });
    td._templDay = day;
    if (!modifiers.hidden && isInteractive) {
      // CalendarDayButton
      const button = clone(p.dayButton);
      button.setAttribute("tabindex", focusTarget?.isEqualTo(day) ? "0" : "-1");
      if (modifiers.disabled) {
        button.setAttribute("data-disabled", "");
        button.setAttribute("disabled", "");
      }
      button.setAttribute("data-day", date.toLocaleDateString(props.locale));
      const selectedSingle = modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle;
      for (const [name, v] of [
        ["data-selected-single", selectedSingle],
        ["data-range-start", modifiers.range_start],
        ["data-range-end", modifiers.range_end],
        ["data-range-middle", modifiers.range_middle],
      ]) {
        if (v !== undefined) button.setAttribute(name, String(v));
      }
      button.setAttribute("aria-label", label(true));
      button.append(dateLib.format(date, "d"));
      s.components.DayButton?.(button, { day, modifiers });
      td.append(button);
    } else if (!modifiers.hidden) {
      td.append(dateLib.format(day.date, "d"));
    }
    return td;
  }

  // Patches the live DOM to the new tree, like React's reconciliation keeps
  // the elements and with them the focus.
  // React's key of a day: its date and displayed month.
  const dayKey = (td) => td._templDay && `${format(td._templDay.date, "yyyy-MM-dd")}_${format(td._templDay.displayMonth, "yyyy-MM")}`;

  function morph(from, to) {
    if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName || (to.nodeName === "TD" && dayKey(from) !== dayKey(to))) {
      from.replaceWith(to);
      return;
    }
    if (from.nodeType === Node.TEXT_NODE) {
      if (from.data !== to.data) from.data = to.data;
      return;
    }
    // A mounted option keeps the selected attribute of its first render,
    // React sets the select's value afterwards.
    const keep = from.nodeName === "OPTION" ? "selected" : null;
    for (const { name } of [...from.attributes]) {
      if (name !== keep && !to.hasAttribute(name)) from.removeAttribute(name);
    }
    for (const { name, value } of [...to.attributes]) {
      if (name !== keep && from.getAttribute(name) !== value) from.setAttribute(name, value);
    }
    from._templDay = to._templDay;
    morphChildren(from, [...to.childNodes]);
    if (from.nodeName === "SELECT") from.value = to.value;
    if (from.nodeName === "BUTTON") from.disabled = to.hasAttribute("disabled");
  }

  function morphChildren(parent, next, skip = 0) {
    const current = [...parent.childNodes].slice(skip);
    next.forEach((node, i) => {
      if (current[i]) morph(current[i], node);
      else parent.append(node);
    });
    current.slice(next.length).forEach((n) => n.remove());
  }

  let rendering = false;
  // remount is a render of the owner: shadcn's Calendar passes Root and
  // DayButton as components defined inline, so every render of the owner
  // mounts the calendar anew and the focus falls to the body.
  function render(root, { remount = false } = {}) {
    if (rendering) return;
    rendering = true;
    try {
      if (remount) [...root.childNodes].slice(1).forEach((node) => node.remove());
      // The template stays the root's first child, the render follows it.
      morphChildren(root, build(root), 1);
      stateOf(root).serverRendered = false;
    } finally {
      rendering = false;
    }
    // DayButton's effect would focus the focused day, but shadcn's
    // CalendarDayButton never hands its ref to the Button: nothing moves the
    // focus.
  }

  // ----- events ---------------------------------------------------------------

  function emit(root, type, detail) {
    root.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }

  // useCalendar's goToMonth: a controlled month only reports the change.
  function goToMonth(root, date) {
    const s = stateOf(root);
    let newMonth = startOfMonth(date);
    if (s.navStart && newMonth < startOfMonth(s.navStart)) newMonth = startOfMonth(s.navStart);
    if (s.navEnd && newMonth > startOfMonth(s.navEnd)) newMonth = startOfMonth(s.navEnd);
    if (!s.props.month) s.firstMonth = newMonth;
    render(root);
    emit(root, "calendar-month-change", { month: newMonth });
  }

  function dayOf(target) {
    const td = target.closest("td");
    return td?._templDay;
  }

  function setFocused(root, day) {
    stateOf(root).focused = day;
    render(root);
  }

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const root = e.target.closest(ROOT);
    if (!root || !root._templCalendar) return;
    const s = stateOf(root);
    // Nav: the previous month button first, the next second.
    const navButton = e.target.closest("nav > button");
    if (navButton && root.contains(navButton)) {
      const month = navButton.previousElementSibling ? s.calendar.nextMonth : s.calendar.previousMonth;
      if (month) goToMonth(root, month);
      return;
    }
    const button = e.target.closest("td > button");
    const day = button && dayOf(button);
    if (!day || button.disabled) return;
    // handleDayClick
    e.preventDefault();
    e.stopPropagation();
    s.focused = day;
    const sel = selection(s);
    if (sel) s.selected = sel.select(day.date);
    render(root);
    if (sel) emit(root, "calendar-select", { selected: s.selected, triggerDate: day.date });
  });

  // The dropdowns: in a month's DropdownNav the months dropdown comes
  // first, the years dropdown second.
  document.addEventListener("change", (e) => {
    if (!(e.target instanceof Element) || e.target.tagName !== "SELECT") return;
    const root = e.target.closest(ROOT);
    if (!root || !root._templCalendar) return;
    const s = stateOf(root);
    const dropdownRoot = e.target.parentElement;
    const month = dropdownRoot.closest("nav ~ div");
    const index = [...month.parentElement.children].filter((c) => c.tagName !== "NAV").indexOf(month);
    const date = startOfMonth(s.calendar.months[index].date);
    const value = Number(e.target.value);
    goToMonth(root, dropdownRoot.previousElementSibling ? setYear(date, value) : setMonth(date, value));
  });

  document.addEventListener("focusin", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches("td > button")) return;
    const root = e.target.closest(ROOT);
    const day = root && root._templCalendar && dayOf(e.target);
    if (!day) return;
    const s = stateOf(root);
    if (s.focused?.isEqualTo(day)) return;
    setFocused(root, day);
  });

  document.addEventListener("focusout", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches("td > button")) return;
    const root = e.target.closest(ROOT);
    if (!root || !root._templCalendar || rendering) return;
    // useFocus's blur.
    const s = stateOf(root);
    s.lastFocused = s.focused;
    setFocused(root, undefined);
  });

  document.addEventListener("keydown", (e) => {
    if (!(e.target instanceof Element) || !e.target.matches("td > button")) return;
    const root = e.target.closest(ROOT);
    const day = root && root._templCalendar && dayOf(e.target);
    if (!day) return;
    const s = stateOf(root);
    const rtl = s.props.dir === "rtl";
    const keyMap = {
      ArrowLeft: [e.shiftKey ? "month" : "day", rtl ? "after" : "before"],
      ArrowRight: [e.shiftKey ? "month" : "day", rtl ? "before" : "after"],
      ArrowDown: [e.shiftKey ? "year" : "week", "after"],
      ArrowUp: [e.shiftKey ? "year" : "week", "before"],
      PageUp: [e.shiftKey ? "year" : "month", "before"],
      PageDown: [e.shiftKey ? "year" : "month", "after"],
      Home: ["startOfWeek", "before"],
      End: ["endOfWeek", "after"],
    };
    if (!keyMap[e.key]) return;
    e.preventDefault();
    e.stopPropagation();
    // useFocus's moveFocus
    const focusedDay = s.focused;
    if (!focusedDay) return;
    const [moveBy, moveDir] = keyMap[e.key];
    const nextFocus = getNextFocus(moveBy, moveDir, focusedDay, s.navStart, s.navEnd, s.props, s.dateLib);
    if (!nextFocus) return;
    // goToDay: navigate when the day is not in the calendar.
    const inCalendar = s.calendar.months.some((m) => m.weeks.some((w) => w.days.some((d) => d.isEqualTo(nextFocus))));
    s.focused = nextFocus;
    if (!inCalendar) goToMonth(root, nextFocus.date);
    else render(root);
  });

  window.templ.lifecycle.register(ROOT, { init: render });

  // The owner's API: setSelected and setMonth are the pendant of the
  // selected and month props a page re-renders the calendar with, so they
  // render like the owner (remount); update
  // takes formatters and components, the pendant of their functions.
  window.templ = window.templ || {};
  window.templ.calendar = {
    setSelected(root, selected) {
      stateOf(root).selected = selected;
      render(root, { remount: true });
    },
    setMonth(root, month) {
      const s = stateOf(root);
      if (s.props.month) s.props.month = startOfMonth(month);
      else s.firstMonth = startOfMonth(month);
      render(root, { remount: true });
    },
    update(root, { formatters, components } = {}) {
      const s = stateOf(root);
      if (formatters) s.formatters = { ...s.formatters, ...formatters };
      if (components) s.components = { ...s.components, ...components };
      render(root);
    },
  };
})();
