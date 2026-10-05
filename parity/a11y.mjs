// Usage: node a11y.mjs [chromium|webkit]
import { webkit, chromium } from "playwright";

const [, , engine = "chromium"] = process.argv;
const base = process.env.TEMPL_URL || "http://localhost:8090";
const browserType = engine === "webkit" ? webkit : chromium;
const results = [];
const log = (name, ok, info = "") => {
  results.push({ name, ok, info });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? " — " + info : ""}`);
};

const browser = await browserType.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

async function goto(path) {
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(300);
}
const active = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return null;
    return {
      tag: a.tagName,
      role: a.getAttribute("role"),
      text: (a.textContent || "").trim().slice(0, 30),
      id: a.id,
      slot: a.getAttribute("data-slot"),
    };
  });
const dupIds = () =>
  page.evaluate(() => {
    const seen = new Map();
    for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) || 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id}x${n}`);
  });

// ---------- Tabs ----------
await goto("/docs/components/tabs");
{
  const info = await page.evaluate(() => {
    const list = document.querySelector("[data-slot=tabs-list]");
    const tabs = [...list.querySelectorAll("[data-slot=tabs-trigger]")];
    return {
      listRole: list.getAttribute("role"),
      orient: list.getAttribute("aria-orientation"),
      tabs: tabs.map((t) => ({
        role: t.getAttribute("role"),
        sel: t.getAttribute("aria-selected"),
        ti: t.getAttribute("tabindex"),
        // TabsTab names its panel while that is mounted, the active tab's.
        controlsOk: (() => {
          if (t.getAttribute("aria-selected") !== "true") return !t.hasAttribute("aria-controls");
          const p = document.getElementById(t.getAttribute("aria-controls") || "");
          return !!p && p.getAttribute("role") === "tabpanel" && p.getAttribute("aria-labelledby") === t.id;
        })(),
      })),
    };
  });
  log("tabs: tablist role", info.listRole === "tablist", JSON.stringify(info));
  log("tabs: roving tabindex + aria-selected", info.tabs.filter((t) => t.ti === "0").length === 1 && info.tabs.every((t) => t.role === "tab"));
  log("tabs: aria-controls/labelledby pair resolves", info.tabs.every((t) => t.controlsOk));
  await page.evaluate(() => document.querySelector("[data-slot=tabs-list] [data-slot=tabs-trigger]").focus());
  const first = await active();
  await page.keyboard.press("ArrowRight");
  const second = await active();
  const selAfterArrow = await page.evaluate(() => document.activeElement.getAttribute("aria-selected"));
  log("tabs: ArrowRight moves focus", second.role === "tab" && second.text !== first.text, `${first.text} -> ${second.text}`);
  log("tabs: focus does not activate (activateOnFocus=false)", selAfterArrow === "false");
  await page.keyboard.press("Enter");
  const selAfterEnter = await page.evaluate(() => document.activeElement.getAttribute("aria-selected"));
  log("tabs: Enter activates", selAfterEnter === "true");
  await page.keyboard.press("End");
  const last = await active();
  await page.keyboard.press("ArrowRight");
  const wrapped = await active();
  log("tabs: End then ArrowRight wraps to first", wrapped.text === first.text, `${last.text} -> ${wrapped.text}`);
  await page.keyboard.press("Home");
  log("tabs: Home", (await active()).text === first.text);
  await page.keyboard.press("ArrowLeft");
  log("tabs: ArrowLeft wraps to last", (await active()).text === last.text);
  log("tabs page: duplicate ids", (await dupIds()).length === 0, (await dupIds()).join(","));
}

// ---------- Dropdown menu ----------
await goto("/docs/components/dropdown-menu");
{
  const trig = page.locator("[aria-haspopup=menu][data-templ-controls]").first();
  const labelOk = await page.evaluate(() => {
    const t = document.querySelector("[aria-haspopup=menu][data-templ-controls]");
    // The trigger links the popup itself, like Base UI's ids.
    const popup = document.getElementById(t.getAttribute("data-templ-controls"));
    return { tid: t.id, lb: popup.getAttribute("aria-labelledby"), ok: !!t.id && popup.getAttribute("aria-labelledby") === t.id };
  });
  log("menu: popup aria-labelledby = trigger id", labelOk.ok, JSON.stringify(labelOk));
  // keyboard: ArrowDown opens with first item focused
  await trig.focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  let a = await active();
  log("menu: ArrowDown opens + focuses first item", a.role === "menuitem", JSON.stringify(a));
  const firstItem = a.text;
  const secondItem = await trig.evaluate(t => {
    const popup = document.getElementById(t.getAttribute("aria-controls"));
    return popup.querySelectorAll('[role="menuitem"]:not([disabled])')[1].textContent.trim().slice(0, 30);
  });
  await page.keyboard.press("ArrowUp");
  // Base UI focuses a wrapped item in the next frame (forceSyncFocus false).
  await page.waitForTimeout(50);
  a = await active();
  log("menu: ArrowUp on first wraps to last", a.role === "menuitem" && a.text !== firstItem, JSON.stringify(a));
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(50);
  a = await active();
  log("menu: ArrowDown on last wraps to first", a.text === firstItem, JSON.stringify(a));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  a = await active();
  log("menu: Escape returns focus to trigger", a.tag === "BUTTON" && a.id === labelOk.tid, JSON.stringify(a));
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  a = await active();
  log("menu: ArrowUp opens + focuses last item", a.role === "menuitem" && a.text !== firstItem, JSON.stringify(a));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // Enter opens with the first item focused
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  a = await active();
  log("menu: Enter opens, focuses first item", a.role === "menuitem" && a.text === firstItem, JSON.stringify(a));
  await page.keyboard.press("ArrowDown");
  a = await active();
  log("menu: ArrowDown after Enter -> second item", a.role === "menuitem" && a.text === secondItem, JSON.stringify(a));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // mouse: click opens, focus lands inside popup (the Safari case)
  await trig.click();
  await page.waitForTimeout(400);
  a = await active();
  log("menu: mouse click -> focus inside popup", a.role === "menu" || a.role === "menuitem", JSON.stringify(a));
  await page.keyboard.press("ArrowDown");
  a = await active();
  log("menu: ArrowDown after mouse open -> first item", a.role === "menuitem", JSON.stringify(a));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  log("menu page: duplicate ids", (await dupIds()).length === 0, (await dupIds()).join(","));
}

// ---------- Popover ----------
await goto("/docs/components/popover");
{
  // The first popover's trigger (the header search is a dialog click trigger too).
  const pid = await page.evaluate(() => document.querySelector("[data-slot=popover-content]").id);
  const trig = page.locator(`[data-templ-controls="${pid}"]`).first();
  await trig.click();
  await page.waitForTimeout(400);
  const a = await page.evaluate(() => {
    const a = document.activeElement;
    return { inPopup: !!a.closest("[data-slot=popover-content]"), tag: a.tagName, id: a.id };
  });
  log("popover: mouse click -> focus inside popup", a.inPopup, JSON.stringify(a));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await trig.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const b = await page.evaluate(() => !!document.activeElement.closest("[data-slot=popover-content]"));
  log("popover: Enter -> focus inside popup", b);
  await page.keyboard.press("Escape");
}

// ---------- Select ----------
await goto("/docs/components/select");
{
  const trig = page.locator("[data-slot=select-trigger]").first();
  await trig.click();
  await page.waitForTimeout(400);
  let a = await active();
  // Base UI focuses the selected item, or the popup when nothing is selected.
  log("select: mouse click -> focus in popup", a.role === "option" || a.slot === "select-content", JSON.stringify(a));
  await page.keyboard.press("ArrowDown");
  const b = await active();
  log("select: ArrowDown moves to next option", b.role === "option" && b.text !== a.text, `${a.text} -> ${b.text}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await trig.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  a = await active();
  log("select: Enter -> item focused", a.role === "option", JSON.stringify(a));
  await page.keyboard.press("Escape");
  const ti = await page.evaluate(() => document.querySelector("[data-slot=select-trigger]").getAttribute("tabindex"));
  log("select: trigger tabindex=0", ti === "0", `tabindex=${ti}`);
}

// ---------- Accordion ----------
await goto("/docs/components/accordion");
{
  const r = await page.evaluate(() => {
    const t = document.querySelector("[data-slot=accordion-trigger]");
    const p = document.getElementById(t.getAttribute("aria-controls") || "");
    return { ctrl: t.getAttribute("aria-controls"), role: p && p.getAttribute("role"), lb: p && p.getAttribute("aria-labelledby"), tid: t.id, exp: t.getAttribute("aria-expanded") };
  });
  log("accordion: trigger aria-controls -> region labelled by trigger", r.role === "region" && r.lb === r.tid, JSON.stringify(r));
}

// ---------- Combobox ----------
await goto("/docs/components/combobox");
{
  const input = page.locator("[data-templ-combobox-anchor] input[role=combobox]").first();
  const has = await input.count();
  if (has) {
    await input.click();
    await page.waitForTimeout(300);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const i = document.activeElement;
      const ad = i.getAttribute("aria-activedescendant");
      const el = ad && document.getElementById(ad);
      return { tag: i.tagName, ad, resolves: !!el, highlighted: !!(el && el.hasAttribute("data-highlighted")) };
    });
    log("combobox: aria-activedescendant names highlighted option", r.resolves && r.highlighted, JSON.stringify(r));
    await page.keyboard.press("Escape");
  } else log("combobox: input found", false, "no combobox input");
}

// ---------- Buttons tabindex ----------
await goto("/docs/components/button");
{
  const r = await page.evaluate(() => {
    const all = [...document.querySelectorAll("button[data-slot=button]")];
    return { total: all.length, without: all.filter((b) => !b.hasAttribute("tabindex")).length };
  });
  log("button: every data-slot=button carries tabindex", r.without === 0, JSON.stringify(r));
}

await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${engine} ${base}: ${results.length - fails} pass / ${fails} fail`);

process.exitCode = fails ? 1 : 0;
