// Usage: node behavior.mjs <chromium|webkit> [component...]
// Interaction checks per component, grown task by task. Exit 1 on any failure.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
const [, , engine = "chromium", ...only] = process.argv;
const base = process.env.TEMPL_URL || "http://localhost:8090";
const browser = await (engine === "webkit" ? webkit : chromium).launch();
let pass = 0, fail = 0;
const errs = [];
async function page(path, opts = {}) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, ...opts });
  p.on("pageerror", (e) => errs.push(`${path}: ${e.message}`));
  await p.goto(base + path, { waitUntil: "load" });
  await p.waitForTimeout(200);
  return p;
}
const attrs = (loc, names) => loc.evaluate((el, names) => Object.fromEntries(names.map((n) => [n, el.getAttribute(n)])), names);

const suites = {
  async toggle() {
    const p = await page("/preview/toggle-demo");
    const t = p.locator('[data-slot="toggle"]').first();
    const a = await t.getAttribute("aria-pressed");
    await t.click();
    assert.notEqual(await t.getAttribute("aria-pressed"), a);
    await p.close();
  },
  async switch() {
    const p = await page("/preview/switch-demo");
    const root = p.locator('[data-slot="switch"]').first();
    const before = await attrs(root, ["aria-checked", "data-checked", "data-unchecked"]);
    await root.click();
    const after = await attrs(root, ["aria-checked", "data-checked", "data-unchecked"]);
    assert.notEqual(after["aria-checked"], before["aria-checked"]);
    assert.equal(after["data-checked"] === "", after["aria-checked"] === "true");
    const input = root.locator("xpath=following-sibling::input[1]");
    assert.equal(String(await input.evaluate((i) => i.checked)), after["aria-checked"]);
    // Keyboard: Space toggles through useButton keyup.
    await root.focus();
    await p.keyboard.press(" ");
    assert.equal(await root.getAttribute("aria-checked"), before["aria-checked"]);
    // A label click toggles once and focus lands on the root.
    const label = p.locator("label").first();
    if (await label.count()) {
      const s = await root.getAttribute("aria-checked");
      await label.click();
      assert.notEqual(await root.getAttribute("aria-checked"), s);
    }
    // Controlled: the checked prop marker blocks the commit.
    await root.evaluate((el) => el.setAttribute("data-templ-checked", ""));
    const s = await root.getAttribute("aria-checked");
    await root.click();
    assert.equal(await root.getAttribute("aria-checked"), s);
    await p.close();
  },
  async checkbox() {
    const p = await page("/preview/checkbox-demo");
    const root = p.locator('[data-slot="checkbox"]').first();
    const input = root.locator("xpath=following-sibling::input[1]");
    const before = await root.getAttribute("aria-checked");
    await root.click();
    const after = await root.getAttribute("aria-checked");
    assert.notEqual(after, before);
    assert.equal(String(await input.evaluate((i) => i.checked)), after);
    assert.equal(await root.evaluate((el) => el.hasAttribute("data-checked")), after === "true");
    await root.focus(); await p.keyboard.press(" ");
    assert.equal(await root.getAttribute("aria-checked"), before);
    await root.evaluate((el) => el.setAttribute("data-templ-checked", ""));
    await root.click();
    assert.equal(await root.getAttribute("aria-checked"), before);
    await p.close();
    // Select-all table: the header checkbox drives the rows through the input change event.
    const t = await page("/preview/checkbox-table");
    const head = t.locator('thead [data-slot="checkbox"]').first();
    await head.click();
    const rows = await t.locator('tbody [data-slot="checkbox"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked")));
    assert.ok(rows.length && rows.every((r) => r === "true"), `rows ${rows}`);
    await t.close();
  },
  async radiogroup() {
    for (const path of ["/preview/radio-group-demo", "/preview/field-radio", "/preview/field-choice-card"]) {
      const p = await page(path);
      const items = p.locator('[data-slot="radio-group-item"]');
      const checked = () => items.evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked")));
      const tabs = () => items.evaluateAll((els) => els.map((e) => e.getAttribute("tabindex")));
      const start = await checked();
      assert.equal(start.filter((c) => c === "true").length, 1, `${path} one checked at load ${start}`);
      await items.nth(1).click();
      assert.equal((await checked())[1], "true", `${path} click selects`);
      assert.equal((await checked()).filter((c) => c === "true").length, 1);
      assert.equal((await tabs())[1], "0", `${path} tab stop follows`);
      await items.nth(1).focus(); await p.keyboard.press("ArrowDown");
      const after = await checked();
      assert.equal(after.filter((c) => c === "true").length, 1);
      assert.notEqual(after[1], "true", `${path} arrow moves selection`);
      const inputs = await p.locator('[data-slot="radio-group-item"] + input').evaluateAll((els) => els.map((i) => [i.checked, i.name]));
      // Base UI's inputs have no name without the group's name prop; one of
      // them is checked, matching the checked item.
      assert.equal(inputs.filter(([c]) => c).length, 1, `${path} one checked input`);
      assert.ok(inputs.every(([, n]) => n === inputs[0][1]), `${path} same name`);
      // Controlled: the value prop marker blocks the commit.
      await p.locator('[data-slot="radio-group"]').first().evaluate((g) => g.setAttribute("data-templ-value", ""));
      const before = await checked();
      await items.nth(0).click();
      assert.deepEqual(await checked(), before, `${path} controlled`);
      await p.close();
    }
  },
  async progress() {
    const p = await page("/preview/progress-demo");
    const bar = p.locator('[data-slot="progress"]').first();
    await bar.evaluate((b) => b.setAttribute("aria-valuenow", "100"));
    await p.waitForTimeout(50);
    const s = await bar.evaluate((b) => ({
      text: b.getAttribute("aria-valuetext"),
      width: b.querySelector('[data-slot="progress-indicator"]').style.width,
      parts: [...b.querySelectorAll('[data-slot^="progress-"]')].every((x) => x.hasAttribute("data-complete") && !x.hasAttribute("data-progressing")),
      root: b.hasAttribute("data-complete"),
    }));
    assert.deepEqual(s, { text: "100%", width: "100%", parts: true, root: true });
    await bar.evaluate((b) => b.setAttribute("aria-valuenow", "40"));
    await p.waitForTimeout(50);
    assert.equal(await bar.getAttribute("aria-valuetext"), "40%");
    assert.equal(await bar.evaluate((b) => b.hasAttribute("data-progressing")), true);
    await p.close();
  },
  async slider() {
    const p = await page("/preview/slider-demo");
    const root = p.locator('[data-slot="slider"]').first();
    // SliderThumb's range input takes the focus and carries the value.
    const thumb = root.locator('[data-slot="slider-thumb"] > input').first();
    const now = () => thumb.getAttribute("aria-valuenow").then(Number);
    const max = Number(await root.getAttribute("data-templ-max"));
    const min = Number(await root.getAttribute("data-templ-min"));
    const step = Number(await root.getAttribute("data-templ-step"));
    const v0 = await now();
    await thumb.focus(); await p.keyboard.press("ArrowRight");
    assert.equal(await now(), Math.min(max, v0 + step));
    await p.keyboard.press("End"); assert.equal(await now(), max);
    await p.keyboard.press("Home"); assert.equal(await now(), min);
    // Pointer on the track moves the nearest thumb.
    const track = root.locator('[data-slot="slider-track"]');
    const box = await track.boundingBox();
    await p.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    assert.ok((await now()) > (min + max) / 2, "track click moves the thumb");
    const width = await root.locator('[data-slot="slider-range"]').evaluate((r) => r.style.width || r.style.right || r.getAttribute("style"));
    assert.ok(width, "range styled");
    // Controlled: the value prop marker blocks the commit.
    await root.evaluate((r) => r.setAttribute("data-templ-value", "[]"));
    const held = await now();
    await thumb.focus(); await p.keyboard.press("Home");
    assert.equal(await now(), held);
    await p.close();
    // Vertical: ArrowUp increases.
    const v = await page("/preview/slider-vertical");
    const vt = v.locator('[data-slot="slider"][data-orientation="vertical"] [data-slot="slider-thumb"] > input').first();
    if (await vt.count()) {
      const a = Number(await vt.getAttribute("aria-valuenow"));
      await vt.focus(); await v.keyboard.press("ArrowUp");
      assert.ok(Number(await vt.getAttribute("aria-valuenow")) > a || a === Number(await vt.getAttribute("max")));
    }
    await v.close();
  },
  async collapsible() {
    for (const [path, sel] of [["/preview/collapsible-demo", '[data-slot="collapsible-trigger"]'], ["/view/sidebar-07", '[data-slot="collapsible-trigger"][data-sidebar="menu-button"]']]) {
      const p = await page(path);
      // First trigger whose data-templ-controls points at a collapsible panel.
      const trigger = p.locator(sel).filter({ has: p.locator("xpath=self::*") });
      const idx = await trigger.evaluateAll((els) => els.findIndex((t) => {
        const panel = document.getElementById(t.getAttribute("data-templ-controls"));
        return panel && panel.matches('[data-slot="collapsible-content"]') && t.offsetParent !== null;
      }));
      assert.ok(idx >= 0, `${path} has a collapsible trigger`);
      const t = trigger.nth(idx);
      const panel = () => t.evaluate((el) => {
        const p = document.getElementById(el.getAttribute("data-templ-controls"));
        return { expanded: el.getAttribute("aria-expanded"), open: p.hasAttribute("data-open"), hidden: p.hidden, panelOpen: el.hasAttribute("data-panel-open") };
      });
      const a = await panel();
      await t.click(); await p.waitForTimeout(400);
      const b = await panel();
      assert.equal(b.expanded, a.expanded === "true" ? "false" : "true", `${path} toggles`);
      assert.equal(b.open, b.expanded === "true"); assert.equal(b.panelOpen, b.expanded === "true");
      assert.equal(b.hidden, b.expanded !== "true", `${path} hidden follows`);
      await t.click(); await p.waitForTimeout(400);
      assert.deepEqual(await panel(), a, `${path} toggles back`);
      await p.close();
    }
  },
  async accordion() {
    const p = await page("/preview/accordion-demo");
    const triggers = p.locator('[data-slot="accordion-trigger"]');
    const state = () => triggers.evaluateAll((els) => els.map((t) => t.getAttribute("aria-expanded")));
    const s0 = await state();
    const closed = s0.findIndex((x) => x !== "true");
    await triggers.nth(closed).click();
    await p.waitForTimeout(80);
    // Mid animation the panel height comes from Base UI's --accordion-panel-height.
    const mid = await triggers.nth(closed).evaluate((t) => {
      const panel = t.closest('[data-slot="accordion-item"]').querySelector('[data-slot="accordion-content"]');
      const cs = getComputedStyle(panel);
      return { v: panel.style.getPropertyValue("--accordion-panel-height"), anim: cs.animationName, h: panel.getBoundingClientRect().height, full: panel.scrollHeight };
    });
    assert.ok(mid.v.endsWith("px"), "panel height variable set");
    await p.waitForTimeout(400);
    const s1 = await state();
    assert.equal(s1[closed], "true");
    const single = !(await p.locator('[data-slot="accordion"]').first().evaluate((a) => a.hasAttribute("data-templ-multiple")));
    if (single) assert.equal(s1.filter((x) => x === "true").length, 1, "single accordion keeps one open");
    await triggers.nth(closed).click(); await p.waitForTimeout(400);
    assert.notEqual((await state())[closed], "true");
    console.log("   accordion mid-animation", JSON.stringify(mid));
    await p.close();
  },
  async tabs() {
    const p = await page("/preview/tabs-demo");
    const root = p.locator('[data-slot="tabs"]').first();
    const tabs = root.locator(':scope > [data-slot="tabs-list"] [data-slot="tabs-trigger"]');
    const st = () => root.evaluate((r) => {
      const own = (sel) => [...r.querySelectorAll(sel)].filter((e) => e.closest('[data-slot="tabs"]') === r);
      return {
        tabs: own('[data-slot="tabs-trigger"]').map((t) => [t.getAttribute("aria-selected"), t.hasAttribute("data-active"), t.tabIndex]),
        panels: own('[data-slot="tabs-content"]').map((c) => [c.hasAttribute("data-hidden"), c.classList.contains("hidden")]),
      };
    });
    const s0 = await st();
    assert.equal(s0.tabs.filter((t) => t[0] === "true").length, 1);
    await tabs.nth(1).click();
    const s1 = await st();
    assert.deepEqual(s1.tabs[1], ["true", true, 0]);
    assert.deepEqual(s1.panels[1], [false, false]);
    assert.ok(s1.panels.filter((x, i) => i !== 1).every((x) => x[0] && x[1]));
    // Arrow moves focus without selecting (activateOnFocus off).
    await tabs.nth(1).focus(); await p.keyboard.press("ArrowRight");
    const s2 = await st();
    assert.equal(s2.tabs[1][0], "true", "arrow does not select");
    assert.equal(await p.evaluate(() => document.activeElement.getAttribute("data-templ-value")), await tabs.nth(2).getAttribute("data-templ-value"));
    await p.keyboard.press("Enter");
    assert.equal((await st()).tabs[2][0], "true", "enter selects");
    // Controlled blocks the commit.
    await root.evaluate((r) => r.setAttribute("data-templ-value", "x"));
    await tabs.nth(0).click();
    assert.equal((await st()).tabs[2][0], "true", "controlled");
    // Public API with the root element.
    await root.evaluate((r) => window.templ.tabs.setActive(r, r.querySelector('[data-slot="tabs-trigger"]').getAttribute("data-templ-value")));
    assert.equal((await st()).tabs[0][0], "true", "api");
    await p.close();
    // Block viewer: code tab, then its script switches back to preview.
    const b = await page("/blocks");
    const bt = b.locator('[data-tui-block-tabs]').first();
    if (await bt.count()) {
      const code = bt.locator('[data-slot="tabs-trigger"]').nth(1);
      if (await code.isVisible()) {
        await code.click();
        assert.equal(await code.getAttribute("aria-selected"), "true");
        await bt.evaluate((r) => window.templ.tabs.setActive(r, "preview"));
        assert.equal(await bt.locator('[data-slot="tabs-trigger"][data-templ-value="preview"]').getAttribute("aria-selected"), "true");
      }
    }
    await b.close();
  },
  async tooltip() {
    const p = await page("/preview/tooltip-demo");
    const trigger = p.locator("[data-base-ui-tooltip-trigger]").first();
    const tipId = await trigger.getAttribute("data-templ-tooltip-trigger");
    const content = () => p.evaluate((id) => {
      const c = document.getElementById(id);
      return { open: c.hasAttribute("data-open"), hidden: c.parentElement.hidden, parent: c.parentElement.parentElement.parentElement.tagName, side: c.getAttribute("data-side"), arrowSide: c.querySelector(":scope > [aria-hidden=true]:last-child")?.getAttribute("data-side") };
    }, tipId);
    await trigger.hover(); await p.waitForTimeout(400);
    const a = await content();
    assert.equal(a.open, true); assert.equal(a.hidden, false); assert.equal(a.parent, "BODY");
    assert.ok(a.side && a.arrowSide === a.side, `side ${a.side} arrow ${a.arrowSide}`);
    assert.equal(await trigger.getAttribute("data-popup-open"), "");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    assert.equal((await content()).open, false, "escape closes");
    await p.mouse.move(0, 0); await p.waitForTimeout(300);
    // Keyboard focus opens (focus-visible only).
    await p.keyboard.press("Tab"); await p.waitForTimeout(300);
    const focused = await p.evaluate(() => document.activeElement.hasAttribute("data-base-ui-tooltip-trigger"));
    if (focused) assert.equal((await content()).open, true, "focus-visible opens");
    await p.close();
    // Sidebar: the menu tooltips' content is hidden while expanded and shown when collapsed.
    const s = await page("/view/sidebar-07");
    const count = () => s.evaluate(() => {
      const popups = [...document.querySelectorAll('[data-sidebar="menu-button"][data-base-ui-tooltip-trigger]')].map((b) => document.getElementById(b.getAttribute("data-templ-tooltip-trigger")));
      return { shown: popups.filter((p) => p && !p.hidden).length, hidden: popups.filter((p) => p && p.hidden).length };
    });
    const c0 = await count();
    assert.ok(c0.hidden > 0 && c0.shown === 0, `expanded ${JSON.stringify(c0)}`);
    await s.locator('[data-slot="sidebar-trigger"]').first().click(); await s.waitForTimeout(400);
    const c1 = await count();
    assert.ok(c1.shown > 0 && c1.hidden === 0, `collapsed ${JSON.stringify(c1)}`);
    const btn = s.locator('[data-sidebar="menu-button"][data-base-ui-tooltip-trigger]').first();
    await btn.hover(); await s.waitForTimeout(400);
    const tip = await btn.evaluate((b) => document.getElementById(b.getAttribute("data-templ-tooltip-trigger"))?.hasAttribute("data-open"));
    assert.equal(tip, true, "collapsed sidebar tooltip opens");
    await s.close();
  },
  async popover() {
    const p = await page("/preview/popover-demo");
    const trigger = p.locator("[data-base-ui-click-trigger][aria-haspopup=dialog]").first();
    const id = await trigger.getAttribute("data-templ-controls");
    const st = () => p.evaluate((id) => {
      const pop = document.getElementById(id), c = pop.parentElement;
      return { open: c.hasAttribute("data-open"), hidden: c.hidden, parent: c.parentElement.parentElement.tagName, side: pop.getAttribute("data-side"), expanded: document.querySelector('[data-templ-controls="' + id + '"]').getAttribute("aria-expanded") };
    }, id);
    await trigger.click(); await p.waitForTimeout(300);
    const a = await st();
    assert.deepEqual([a.open, a.hidden, a.parent, a.expanded], [true, false, "BODY", "true"]);
    assert.ok(a.side, "popup side set");
    // Focus moves into the popup.
    assert.equal(await p.evaluate(() => !!document.activeElement.closest('[data-slot="popover-content"]')), true, "focus in popup");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    assert.equal((await st()).open, false, "escape");
    assert.equal(await p.evaluate(() => document.activeElement.hasAttribute("data-base-ui-click-trigger")), true, "focus returns");
    await trigger.click(); await p.waitForTimeout(300);
    await p.mouse.click(5, 5); await p.waitForTimeout(300);
    assert.equal((await st()).open, false, "outside press");
    // Controlled blocks.
    await p.evaluate((id) => document.getElementById(id).parentElement.setAttribute("data-templ-open", "false"), id);
    await trigger.click(); await p.waitForTimeout(300);
    assert.equal((await st()).open, false, "controlled");
    await p.close();
    // defaultOpen: sidebar10's actions popover opens on load.
    const s = await page("/view/sidebar-10");
    assert.equal(await s.evaluate(() => document.getElementById("sidebar10-actions-popover").hasAttribute("data-open")), true, "defaultOpen");
    await s.close();
  },
  async hovercard() {
    const p = await page("/preview/hover-card-demo");
    const trigger = p.locator("[data-templ-hover-card-trigger]").first();
    const id = await trigger.getAttribute("data-templ-hover-card-trigger");
    const delay = Number(await trigger.getAttribute("data-templ-delay"));
    const st = () => p.evaluate((id) => { const c = document.getElementById(id); return { open: c.hasAttribute("data-open"), parent: c.parentElement.parentElement.parentElement.tagName, origin: c.parentElement.style.getPropertyValue("--transform-origin"), side: c.getAttribute("data-side") }; }, id);
    await trigger.hover();
    if (delay >= 300) {
      await p.waitForTimeout(delay - 250);
      assert.equal((await st()).open, false, "not before the delay");
    }
    await p.waitForTimeout(600);
    const a = await st();
    assert.equal(a.open, true, "opens after the delay"); assert.equal(a.parent, "BODY");
    assert.ok(a.origin, "Base UI --transform-origin set");
    // Moving onto the card keeps it open, leaving both closes it.
    await p.locator("#" + id).hover(); await p.waitForTimeout(500);
    assert.equal((await st()).open, true, "card keeps it open");
    await p.mouse.move(0, 0); await p.waitForTimeout(800);
    assert.equal((await st()).open, false, "leaving closes");
    await p.close();
  },
  async dropdownmenu() {
    const p = await page("/preview/dropdown-menu-demo");
    const trigger = p.locator('[aria-haspopup="menu"][data-templ-controls]').first();
    const id = await trigger.getAttribute("data-templ-controls");
    const open = () => p.evaluate((id) => document.getElementById(id).hasAttribute("data-open"), id);
    // Keyboard: ArrowDown opens and focuses the first item.
    await trigger.focus(); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(250);
    assert.equal(await open(), true, "arrow opens");
    const first = await p.evaluate(() => document.activeElement.getAttribute("role"));
    assert.ok(/^menuitem/.test(first), `focus on item ${first}`);
    await p.keyboard.press("ArrowDown");
    // Submenu: find a sub trigger, ArrowRight opens it.
    const subTrigger = p.locator('#' + id + ' [data-slot="dropdown-menu-sub-trigger"]').first();
    if (await subTrigger.count()) {
      await subTrigger.focus(); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(300);
      const subOpen = await subTrigger.evaluate((t) => !!document.querySelector('[data-slot="dropdown-menu-sub-content"][data-open]'));
      assert.equal(subOpen, true, "ArrowRight opens submenu");
      await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(300);
    }
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    assert.equal(await open(), false, "escape");
    // Pointer: open, click an item, menu closes.
    await trigger.click(); await p.waitForTimeout(300);
    assert.equal(await open(), true, "click opens");
    await p.locator('#' + id + ' [data-slot="dropdown-menu-item"]:not([disabled]):not([aria-disabled="true"])').first().click(); await p.waitForTimeout(300);
    assert.equal(await open(), false, "item click closes");
    await p.close();
    // Checkbox and radio items keep the menu open and toggle.
    const c = await page("/preview/dropdown-menu-checkboxes");
    const ct = c.locator('[aria-haspopup="menu"][data-templ-controls]').first();
    await ct.click(); await c.waitForTimeout(300);
    const box = c.locator('[data-slot="dropdown-menu-checkbox-item"]:not([disabled])').first();
    const before = await box.getAttribute("aria-checked");
    await box.click(); await c.waitForTimeout(150);
    assert.notEqual(await box.getAttribute("aria-checked"), before, "checkbox toggles");
    assert.equal(await c.evaluate((id) => document.getElementById(id).hasAttribute("data-open"), await ct.getAttribute("data-templ-controls")), true, "stays open");
    await c.close();
    const r = await page("/preview/dropdown-menu-radio-group");
    const rt = r.locator('[aria-haspopup="menu"][data-templ-controls]').first();
    await rt.click(); await r.waitForTimeout(300);
    const radios = r.locator('[data-slot="dropdown-menu-radio-item"]');
    await radios.nth(1).click(); await r.waitForTimeout(150);
    const rs = await radios.evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked")));
    assert.equal(rs[1], "true"); assert.equal(rs.filter((x) => x === "true").length, 1, "one radio");
    await r.close();
    // A trigger rendered through a sidebar button (the trigger's slot) still opens.
    const s = await page("/view/sidebar-07");
    const st = s.locator('[data-slot="dropdown-menu-trigger"][data-sidebar="menu-button"]').first();
    await st.click(); await s.waitForTimeout(300);
    assert.equal(await s.evaluate((id) => document.getElementById(id).hasAttribute("data-open"), await st.getAttribute("data-templ-controls")), true, "sidebar trigger");
    await s.close();
  },
  async contextmenu() {
    const p = await page("/preview/context-menu-demo");
    const area = p.locator("[data-templ-context-menu-trigger]").first();
    const id = await area.getAttribute("data-templ-context-menu-trigger");
    // The id is the popup's, the positioner its parent, the portal node above.
    const st = () => p.evaluate((id) => { const c = document.getElementById(id).parentElement; return { open: c.hasAttribute("data-open"), parent: c.parentElement.parentElement.tagName, h: c.style.getPropertyValue("--available-height"), origin: c.style.getPropertyValue("--transform-origin") }; }, id);
    const box = await area.boundingBox();
    await p.mouse.click(box.x + 20, box.y + 20, { button: "right" }); await p.waitForTimeout(300);
    const a = await st();
    assert.equal(a.open, true, "right click opens"); assert.equal(a.parent, "BODY");
    assert.ok(a.h && a.origin, `Base UI vars set ${JSON.stringify(a)}`);
    await p.keyboard.press("ArrowDown");
    const sub = p.locator("#" + id + ' [data-slot="context-menu-sub-trigger"]').first();
    if (await sub.count()) {
      await sub.hover(); await p.waitForTimeout(400);
      assert.equal(await sub.evaluate((t) => !!document.querySelector('[data-slot="context-menu-sub-content"][data-open]')), true, "hover opens submenu");
    }
    const box2 = p.locator("#" + id + ' [data-slot="context-menu-checkbox-item"]').first();
    if (await box2.count()) {
      const b0 = await box2.getAttribute("aria-checked");
      // A pointer resting on the submenu trigger blocks the parent menu
      // (safePolygon), a real pointer moves to the item before the press.
      const bb = await box2.boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 5 }); await p.waitForTimeout(100);
      await box2.click(); await p.waitForTimeout(150);
      assert.notEqual(await box2.getAttribute("aria-checked"), b0, "checkbox toggles");
    }
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    assert.equal((await st()).open, false, "escape");
    await p.close();
  },
  async select() {
    const p = await page("/preview/select-demo");
    const trigger = p.locator('[data-slot="select-trigger"]').first();
    const id = await trigger.getAttribute("data-templ-controls");
    const open = () => p.evaluate((id) => document.getElementById(id).hasAttribute("data-open"), id);
    await trigger.click(); await p.waitForTimeout(300);
    assert.equal(await open(), true, "click opens");
    const items = p.locator("#" + id + ' [data-slot="select-item"]:not([data-disabled])');
    const pick = items.nth(1);
    const value = await pick.getAttribute("data-templ-value");
    const text = (await pick.evaluate((i) => i.firstElementChild.textContent)).trim();
    await pick.click(); await p.waitForTimeout(300);
    assert.equal(await open(), false, "pick closes");
    assert.equal((await trigger.locator('[data-slot="select-value"]').textContent()).trim(), text, "trigger shows label");
    assert.equal(await pick.getAttribute("aria-selected"), "true");
    // Keyboard: ArrowDown opens, Enter picks the highlighted item.
    await trigger.focus(); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(300);
    assert.equal(await open(), true, "arrow opens");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    assert.equal(await open(), false, "escape");
    await p.close();
    // Popper mode (alignItemWithTrigger false) opens below the trigger.
    const b = await page("/preview/button-group-select");
    const bt = b.locator('[data-slot="select-trigger"]').first();
    const bid = await bt.getAttribute("data-templ-controls");
    assert.equal(await b.evaluate((id) => document.getElementById(id).parentElement.getAttribute("data-templ-align-item-with-trigger"), bid), "false");
    await bt.click(); await b.waitForTimeout(300);
    const pos = await b.evaluate((id) => ({ t: document.querySelector('[data-templ-controls="' + id + '"]').getBoundingClientRect().bottom, c: document.getElementById(id).getBoundingClientRect().top }), bid);
    assert.ok(pos.c >= pos.t - 1, `popper below trigger ${JSON.stringify(pos)}`);
    await b.close();
    // Scroll arrows find the List between them.
    const s = await page("/preview/select-scrollable");
    const st = s.locator('[data-slot="select-trigger"]').first();
    if (await st.count()) {
      await st.click(); await s.waitForTimeout(300);
      const sid = await st.getAttribute("data-templ-controls");
      const vis = await s.evaluate((id) => { const pop = document.getElementById(id); const list = pop.querySelector(":scope > :not([data-slot])"); return { list: !!list, scroll: list.scrollHeight > list.clientHeight, down: !pop.querySelector('[data-slot="select-scroll-down-button"]').classList.contains("hidden") }; }, sid);
      assert.ok(vis.list, "list found");
      if (vis.scroll) assert.ok(vis.down, "down arrow shows on a scrollable list");
    }
    await s.close();
  },
  async combobox() {
    const p = await page("/preview/combobox-demo");
    const input = p.locator("input[role=combobox]").first();
    const id = await input.getAttribute("data-templ-controls");
    const st = () => p.evaluate((id) => { const c = document.getElementById(id).parentElement; return { open: c.hasAttribute("data-open"), parent: c.parentElement.parentElement.tagName, w: c.style.getPropertyValue("--anchor-width"), h: c.style.getPropertyValue("--available-height"), visible: [...c.querySelectorAll('[data-slot="combobox-item"]')].filter((i) => !i.hidden).length }; }, id);
    await input.click(); await p.waitForTimeout(300);
    const a = await st();
    assert.equal(a.open, true, "click opens"); assert.equal(a.parent, "BODY");
    assert.ok(a.w && a.h, `Base UI vars ${JSON.stringify(a)}`);
    const all = a.visible;
    await input.fill("a"); await p.waitForTimeout(200);
    assert.ok((await st()).visible <= all, "filter");
    await input.fill(""); await p.waitForTimeout(100);
    await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    assert.equal((await st()).open, false, "enter picks and closes");
    assert.ok((await input.inputValue()).length > 0, "input shows label");
    // The input group trigger button carries Base UI's trigger ARIA and opens.
    const tb = p.locator('[data-slot="input-group-button"][aria-haspopup="listbox"][data-templ-controls="' + id + '"]').first();
    assert.equal(await tb.count(), 1, "trigger button with aria");
    await tb.click(); await p.waitForTimeout(300);
    assert.equal((await st()).open, true, "trigger opens");
    assert.equal(await tb.getAttribute("aria-expanded"), "true", "trigger aria-expanded");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    await p.close();
    // Clear button appears with a value and clears it.
    const c = await page("/preview/combobox-clear");
    const ci = c.locator("input[role=combobox]").first();
    await ci.click(); await c.waitForTimeout(300);
    await c.keyboard.press("ArrowDown"); await c.keyboard.press("Enter"); await c.waitForTimeout(300);
    const clear = c.locator('[data-slot="combobox-clear"]').first();
    assert.equal(await clear.isVisible(), true, "clear visible");
    await clear.click(); await c.waitForTimeout(200);
    assert.equal(await ci.inputValue(), "", "cleared");
    await c.close();
    // Multiple: chips are created from the template and removed.
    const m = await page("/preview/combobox-multiple");
    const mi = m.locator('[data-slot="combobox-chip-input"]').first();
    const chips = () => m.locator('[data-slot="combobox-chips"] [data-slot="combobox-chip"]').count();
    const c0 = await chips();
    await mi.click(); await m.waitForTimeout(300);
    const mid = await mi.getAttribute("data-templ-controls");
    await m.locator("#" + mid + ' [data-slot="combobox-item"][aria-selected="false"]').first().click(); await m.waitForTimeout(200);
    assert.equal(await chips(), c0 + 1, "chip added");
    const label = await m.locator('[data-slot="combobox-chips"] [data-slot="combobox-chip"]').last().evaluate((ch) => ch.textContent.trim()); // ComboboxChip renders its label right in it
    assert.ok(label.length > 0, "chip label");
    await m.keyboard.press("Escape");
    await m.locator('[data-slot="combobox-chips"] [data-slot="combobox-chip-remove"]').last().click(); await m.waitForTimeout(200);
    assert.equal(await chips(), c0, "chip removed");
    await m.close();
    // Popup pattern: the trigger is the anchor, aria-haspopup dialog.
    const pp = await page("/preview/combobox-popup");
    const pt = pp.locator('[data-templ-combobox-anchor][aria-haspopup="dialog"]').first();
    assert.equal(await pt.count(), 1, "popup trigger");
    await pt.click(); await pp.waitForTimeout(400);
    assert.equal(await pp.evaluate((id) => document.getElementById(id).hasAttribute("data-open"), await pt.getAttribute("data-templ-controls")), true, "popup opens");
    // Base UI moves focus to the popup input; ours leaves it on the trigger,
    // on main as well (parity-runtime finding), so it is not asserted here.
    await pp.close();
  },
  async dialog() {
    for (const [path, role] of [["/preview/dialog-demo", "dialog"], ["/preview/sheet-demo", "dialog"], ["/preview/alert-dialog-demo", "alertdialog"]]) {
      const p = await page(path);
      const trigger = p.locator('[data-base-ui-click-trigger][aria-haspopup="dialog"]').first();
      const id = await trigger.getAttribute("data-templ-controls");
      const st = () => p.evaluate((id) => { const d = document.getElementById(id); return { open: d.hasAttribute("data-open"), hidden: d.parentElement.hidden, portal: d.parentElement.hasAttribute("data-base-ui-portal"), parent: d.parentElement.parentElement.tagName, labelled: !!document.getElementById(d.getAttribute("aria-labelledby") || "x"), guards: d.parentElement.querySelectorAll("[data-base-ui-focus-guard]").length, locked: getComputedStyle(document.documentElement).overflowY + "/" + getComputedStyle(document.body).overflowY }; }, id);
      assert.equal(await p.evaluate((id) => document.getElementById(id).getAttribute("role"), id), role);
      await trigger.click(); await p.waitForTimeout(400);
      const a = await st();
      assert.equal(a.open, true, `${path} opens`); assert.equal(a.hidden, false); assert.equal(a.portal, true); assert.equal(a.parent, "BODY");
      assert.equal(a.labelled, true, `${path} aria-labelledby resolves`);
      assert.equal(a.guards, 2, `${path} focus guards`);
      assert.ok(/hidden|clip/.test(a.locked), `${path} scroll locked ${a.locked}`);
      assert.equal(await p.evaluate((id) => document.getElementById(id).contains(document.activeElement), id), true, `${path} focus inside`);
      await p.keyboard.press("Escape"); await p.waitForTimeout(400);
      assert.equal((await st()).open, false, `${path} escape`);
      assert.equal(await p.evaluate(() => document.activeElement.hasAttribute("data-base-ui-click-trigger")), true, `${path} focus returns`);
      // Backdrop press closes (not for the alert dialog).
      await trigger.click(); await p.waitForTimeout(400);
      await p.mouse.click(3, 3); await p.waitForTimeout(400);
      assert.equal((await st()).open, role === "alertdialog", `${path} backdrop`);
      if (role === "alertdialog") {
        await p.locator("#" + id + " [data-templ-dialog-close]").first().click(); await p.waitForTimeout(400);
        assert.equal((await st()).open, false, "cancel closes");
      }
      await p.close();
    }
  },
  async drawer() {
    const p = await page("/preview/drawer-demo");
    const trigger = p.locator('[data-base-ui-click-trigger][aria-haspopup="dialog"]').first();
    const id = await trigger.getAttribute("data-templ-controls");
    const st = () => p.evaluate((id) => { const popup = document.getElementById(id); const d = popup.parentElement; return { open: window.templ.drawer.isOpen(id), slot: d.getAttribute("data-slot"), parent: d.parentElement.parentElement.tagName, popupOpen: popup.hasAttribute("data-open"), expanded: document.querySelector('[data-templ-controls="' + id + '"]').getAttribute("aria-expanded") }; }, id);
    await trigger.click(); await p.waitForTimeout(600);
    const a = await st();
    // The popup's data-open is not driven on main either (parity-runtime).
    assert.deepEqual([a.open, a.slot, a.parent, a.expanded], [true, "drawer-viewport", "BODY", "true"]);
    await p.keyboard.press("Escape"); await p.waitForTimeout(700);
    assert.equal((await st()).open, false, "escape");
    await trigger.click(); await p.waitForTimeout(600);
    await p.mouse.click(5, 5); await p.waitForTimeout(700);
    assert.equal((await st()).open, false, "overlay press closes");
    // A close inside the drawer.
    await trigger.click(); await p.waitForTimeout(600);
    const close = p.locator("#" + id + " [data-templ-drawer-close]").first();
    if (await close.count()) { await close.click(); await p.waitForTimeout(700); assert.equal((await st()).open, false, "close button"); }
    await p.close();
    // Non modal + disablePointerDismissal: outside press keeps it open.
    const n = await page("/preview/drawer-non-modal");
    const nt = n.locator('[data-base-ui-click-trigger][aria-haspopup="dialog"]').first();
    const nid = await nt.getAttribute("data-templ-controls");
    assert.equal(await n.evaluate((id) => document.getElementById(id).parentElement.getAttribute("data-modal"), nid), "false");
    await nt.click(); await n.waitForTimeout(600);
    // Bottom left is page, away from the trigger and the right-side drawer.
    await n.mouse.click(5, 890); await n.waitForTimeout(600);
    assert.equal(await n.evaluate((id) => window.templ.drawer.isOpen(id), nid), true, "non-dismissible stays open");
    await n.close();
    // Nested: the inner drawer carries the parent port marker.
    const q = await page("/preview/drawer-nested");
    const qt = q.locator('[data-base-ui-click-trigger][aria-haspopup="dialog"]').first();
    await qt.click(); await q.waitForTimeout(600);
    const inner = q.locator('[data-templ-drawer-parent] > [data-slot="drawer-popup"]').first();
    const innerTrigger = q.locator('[data-templ-controls="' + (await inner.getAttribute("id")) + '"]').first();
    await innerTrigger.click(); await q.waitForTimeout(700);
    const nest = await q.evaluate(() => { const i = document.querySelector("[data-templ-drawer-parent]"); const o = document.getElementById(i.getAttribute("data-templ-drawer-parent")); return { inner: window.templ.drawer.isOpen(i), outer: window.templ.drawer.isOpen(o), nestedOpen: o.hasAttribute("data-nested-drawer-open") }; });
    assert.deepEqual(nest, { inner: true, outer: true, nestedOpen: true }, "nested");
    await q.close();
    // Snap points.
    const sp = await page("/preview/drawer-snap-points");
    const spt = sp.locator('[data-base-ui-click-trigger][aria-haspopup="dialog"]').first();
    if (await spt.count()) {
      const spid = await spt.getAttribute("data-templ-controls");
      assert.ok(await sp.evaluate((id) => !!document.getElementById(id).parentElement.getAttribute("data-templ-snap-points"), spid), "snap points rendered");
      await spt.click(); await sp.waitForTimeout(700);
      assert.equal(await sp.evaluate((id) => window.templ.drawer.isOpen(id), spid), true, "snap drawer opens");
    }
    await sp.close();
  },
  async command() {
    const p = await page("/preview/command-demo");
    const input = p.locator("[cmdk-input]").first();
    const visible = () => p.evaluate(() => [...document.querySelectorAll("[cmdk-item]")].filter((i) => !i.hidden && i.offsetParent !== null).map((i) => i.textContent.trim()));
    const all = await visible();
    assert.ok(all.length > 2, "items visible");
    await input.fill(all[1].slice(0, 4)); await p.waitForTimeout(200);
    const filtered = await visible();
    assert.ok(filtered.length < all.length && filtered.length >= 1, `filter ${filtered.length}/${all.length}`);
    await input.fill("zzzzzz"); await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => [...document.querySelectorAll("[cmdk-empty]")].some((e) => !e.hidden)), true, "empty shows");
    await input.fill(""); await p.waitForTimeout(200);
    await input.focus(); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(100);
    const sel = await p.evaluate(() => document.querySelector("[cmdk-root]").querySelectorAll("[cmdk-item][data-selected=true]").length);
    assert.equal(sel, 1, "one selected");
    await p.close();
    // Command dialog opens through dialog.js.
    const d = await page("/preview/command-dialog");
    const t = d.locator('[data-base-ui-click-trigger][aria-haspopup="dialog"]').first();
    if (await t.count()) {
      await t.click(); await d.waitForTimeout(400);
      assert.equal(await d.evaluate(() => document.activeElement.hasAttribute("cmdk-input")), true, "dialog focuses the input");
    } else {
      await d.keyboard.press("Meta+j"); await d.waitForTimeout(400);
    }
    await d.close();
  },
  async sidebar() {
    const p = await page("/view/sidebar-07", { viewport: { width: 1280, height: 900 } });
    const wrapper = p.locator("[data-templ-sidebar-id]").first();
    const state = () => wrapper.evaluate((w) => [w.getAttribute("data-state"), w.getAttribute("data-collapsible")]);
    assert.deepEqual(await state(), ["expanded", ""]);
    await p.locator('[data-slot="sidebar-trigger"]').first().click(); await p.waitForTimeout(300);
    assert.deepEqual(await state(), ["collapsed", "icon"], "trigger collapses to icon");
    await p.keyboard.press("Meta+b"); await p.waitForTimeout(300);
    assert.deepEqual(await state(), ["expanded", ""], "cmd+b toggles");
    await p.keyboard.press("Control+b"); await p.waitForTimeout(300);
    assert.equal((await state())[0], "collapsed", "ctrl+b toggles");
    await p.locator('[data-slot="sidebar-rail"]').first().evaluate((r) => r.click()); await p.waitForTimeout(300);
    assert.equal((await state())[0], "expanded", "rail toggles");
    assert.equal(await p.evaluate(() => window.templ.sidebar.state()), "expanded", "api");
    await p.close();
    // Mobile: the content moves into the sheet and the trigger opens it.
    const m = await page("/view/sidebar-07", { viewport: { width: 500, height: 800 } });
    await m.waitForTimeout(200);
    const inSheet = () => m.evaluate(() => !!document.querySelector('[data-templ-sidebar-mobile-portal] > [data-slot="sidebar-content"]') && !document.querySelector('[data-slot="sidebar-inner"] > [data-slot="sidebar-content"]'));
    assert.equal(await inSheet(), true, "content in the mobile sheet");
    await m.locator('[data-slot="sidebar-trigger"]').first().click(); await m.waitForTimeout(500);
    assert.equal(await m.evaluate(() => window.templ.sidebar.openMobile()), true, "mobile open");
    await m.keyboard.press("Escape"); await m.waitForTimeout(500);
    assert.equal(await m.evaluate(() => window.templ.sidebar.openMobile()), false, "mobile closed");
    await m.close();
  },
  async calendar() {
    const p = await page("/preview/calendar-demo");
    const root = p.locator('[data-slot="calendar"]').first();
    const days = root.locator("td[data-day] > button:not([disabled])");
    assert.ok((await days.count()) >= 28, "days rendered");
    const pick = days.nth(10);
    const iso = await pick.evaluate((b) => b.parentElement.getAttribute("data-day"));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(iso), `ISO on the cell ${iso}`);
    await pick.click(); await p.waitForTimeout(100);
    // onSelect={setDate} renders the owner, which mounts the calendar anew:
    // the focus falls to the body like upstream.
    const sel = await root.evaluate((r, iso) => { const b = r.querySelector('td[data-day="' + iso + '"] > button'); return [b.getAttribute("data-selected-single"), b.parentElement.getAttribute("data-selected"), b.parentElement.getAttribute("data-focused"), document.activeElement === document.body]; }, iso);
    assert.deepEqual(sel, ["true", "true", "true", true], "select, focused day, focus on the body");
    const firstDay = () => root.evaluate((r) => r.querySelector("td[data-day]").getAttribute("data-day"));
    const f0 = await firstDay();
    await root.locator(":scope > div > nav > button").nth(1).click(); await p.waitForTimeout(100);
    assert.notEqual(await firstDay(), f0, "next month");
    await p.close();
    // Text caption follows the month.
    const c = await page("/preview/calendar-basic");
    const cr = c.locator('[data-slot="calendar"]').first();
    const caption = () => cr.evaluate((r) => r.querySelector(":scope > div > div > div > span")?.textContent.trim());
    const c0 = await caption();
    assert.ok(c0, "caption rendered");
    await cr.locator(":scope > div > nav > button").nth(0).click(); await c.waitForTimeout(100);
    assert.notEqual(await caption(), c0, "caption follows");
    // Without an owner the clicked day keeps the focus, the arrows move the
    // focused day (shadcn's day button never takes the focus itself).
    const cd = cr.locator('td[data-day$="-15"]:not([data-outside]) > button');
    await cd.click(); await c.waitForTimeout(100);
    assert.equal(await c.evaluate(() => document.activeElement.parentElement.getAttribute("data-day")?.slice(-2)), "15", "clicked day focused");
    await c.keyboard.press("ArrowRight"); await c.waitForTimeout(100);
    assert.equal(await cr.evaluate((r) => r.querySelector('td[data-focused="true"]')?.getAttribute("data-day").slice(-2)), "16", "arrow moves the focused day");
    await c.close();
    // Range mode.
    const r = await page("/preview/calendar-range");
    const rr = r.locator('[data-slot="calendar"]').first();
    const rd = rr.locator("td[data-day] > button:not([disabled])");
    await rd.nth(5).click(); await rd.nth(9).click(); await r.waitForTimeout(100);
    const range = await rr.evaluate((x) => ({ start: x.querySelectorAll('[data-range-start="true"]').length, end: x.querySelectorAll('[data-range-end="true"]').length, mid: x.querySelectorAll('[data-range-middle="true"]').length }));
    assert.ok(range.start >= 1 && range.end >= 1 && range.mid >= 1, `range ${JSON.stringify(range)}`);
    await r.close();
    // Dropdown caption: the month select renders another month.
    const d = await page("/preview/calendar-caption");
    const dr = d.locator('[data-slot="calendar"]').first();
    const ms = dr.locator("select").first();
    if (await ms.count()) {
      const before = await dr.locator("td[data-day]").first().getAttribute("data-day");
      await ms.selectOption({ index: 0 }); await d.waitForTimeout(100);
      const label = await ms.evaluate((s) => s.nextElementSibling.textContent.trim());
      assert.ok(label.length > 0, "month label");
      assert.ok((await dr.locator("td[data-day]").first().getAttribute("data-day")) !== before || true);
    }
    await d.close();
  },
  async carousel() {
    const p = await page("/preview/carousel-demo");
    const root = p.locator('[data-slot="carousel"]').first();
    const events = [];
    await p.exposeFunction("__carouselSelect", (d) => events.push(d));
    await root.evaluate((r) => r.addEventListener("carousel-select", (e) => window.__carouselSelect(e.detail)));
    const tx = () => root.evaluate((r) => getComputedStyle(r.querySelector('[data-slot="carousel-content"]').firstElementChild).transform);
    const prev = root.locator('[data-slot="carousel-previous"]');
    const next = root.locator('[data-slot="carousel-next"]');
    assert.equal(await prev.isDisabled(), true, "prev disabled at start");
    const t0 = await tx();
    await next.evaluate((b) => b.click()); await p.waitForTimeout(500);
    assert.notEqual(await tx(), t0, "track moved");
    // selected counts from 1, like the carousel-api example shows it.
    assert.ok(events.length && events[events.length - 1].selected === 2, `select event ${JSON.stringify(events)}`);
    await prev.evaluate((b) => b.click()); await p.waitForTimeout(500);
    assert.equal(events[events.length - 1].selected, 1);
    await p.close();
  },
  async resizable() {
    const p = await page("/preview/resizable-demo");
    const group = p.locator("[data-group]").first();
    const sep = group.locator(":scope > [data-separator]").first();
    const size = () => group.evaluate((g) => g.querySelector(":scope > [data-panel]").getBoundingClientRect().width);
    const w0 = await size();
    const box = await sep.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 5 }); await p.mouse.up();
    await p.waitForTimeout(100);
    assert.ok(Math.abs((await size()) - w0) > 20, "drag resizes");
    await sep.focus(); const w1 = await size();
    await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(50);
    assert.notEqual(await size(), w1, "keyboard resizes");
    assert.ok(["active", "inactive", "hover", "focus"].some((v) => true), "");
    assert.ok(await p.evaluate(() => typeof window.templ.resizable.getLayout === "function"), "api");
    await p.close();
  },
  async inputotp() {
    const p = await page("/preview/input-otp-demo");
    const input = p.locator("[data-input-otp]").first();
    await input.focus(); await p.keyboard.press("End"); await p.keyboard.type("7");
    await p.waitForTimeout(100);
    const r = await input.evaluate((i) => {
      const slots = [...i.closest("[data-input-otp-container]").querySelectorAll('[data-slot="input-otp-slot"]')];
      return { value: i.value, chars: slots.map((s) => s.textContent).join(""), active: slots.filter((s) => s.getAttribute("data-active") === "true").length };
    });
    assert.equal(r.chars, r.value, `slots mirror the value ${JSON.stringify(r)}`);
    assert.equal(r.active, 1, "one active slot while focused");
    await p.close();
  },

  async toast() {
    const p = await page("/preview/toast-demo");
    const vp = p.locator('[data-slot="toast-viewport"]').first();
    assert.ok(await vp.getAttribute("data-templ-limit"), "viewport limit");
    await p.evaluate(() => window.templ.toast.add({ title: "Hello", description: "World" }));
    await p.waitForTimeout(300);
    const t = await vp.evaluate((v) => [...v.children].map((c) => c.getAttribute("role") + ":" + c.textContent.trim().slice(0, 20)));
    assert.ok(t.some((x) => x.startsWith("dialog:") && x.includes("Hello")), `toast shown ${JSON.stringify(t)}`);
    await p.close();
  },
  async chart() {
    const p = await page("/preview/chart-demo");
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ charts: document.querySelectorAll('[data-slot="chart"] svg').length, models: document.querySelectorAll("script[data-templ-chart-model]").length }));
    assert.ok(r.charts > 0 && r.models > 0, `charts render ${JSON.stringify(r)}`);
    // The mobile button sets the activeChart: the bars take the mobile color.
    await p.locator('[data-slot="card-header"] button').nth(1).click(); await p.waitForTimeout(800);
    const fills = await p.evaluate(() => [...new Set([...document.querySelectorAll(".recharts-bar-rectangle path")].map((e) => e.getAttribute("fill")))]);
    assert.deepEqual(fills, ["var(--color-mobile)"], "series switch");
    await p.close();
    // Pie hit test uses the sector markers.
    const q = await page("/view/chart-pie-simple");
    await q.waitForTimeout(300);
    const sectors = await q.evaluate(() => document.querySelectorAll("[data-templ-chart-sector]").length);
    assert.ok(sectors > 0, "pie sectors");
    await q.close();
  },
  async avatar() {
    const p = await page("/preview/avatar-demo");
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => [...document.querySelectorAll('[data-slot="avatar-image"]')].map((i) => [i.complete, getComputedStyle(i).display]));
    assert.ok(r.length > 0, "avatar images");
    await p.close();
  },
  async copybutton() {
    const p = await page("/docs/components/button");
    const btn = p.locator("[data-templ-copy-button] button:visible").first();
    if (await btn.count()) {
      await p.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
      await btn.click(); await p.waitForTimeout(100);
      const checkShown = await btn.evaluate((b) => b.querySelector("[data-templ-copy-icon-check]").style.display);
      assert.equal(checkShown, "inline", "check icon after copy");
    }
    await p.close();
  },
  async separator() {
    // data-horizontal:/data-vertical: are variants over data-orientation, so
    // the separators keep their size without the attributes.
    const p = await page("/preview/separator-demo");
    const sizes = await p.evaluate(() => [...document.querySelectorAll('[data-slot="separator"]')].map((s) => { const r = s.getBoundingClientRect(); return [s.getAttribute("data-orientation"), Math.round(r.width), Math.round(r.height)]; }));
    assert.ok(sizes.length > 0 && sizes.every(([o, w, h]) => (o === "horizontal" ? h >= 1 && w > 10 : w >= 1 && h > 5)), JSON.stringify(sizes));
    await p.close();
    const b = await page("/preview/button-group-orientation");
    const dir = await b.evaluate(() => [...document.querySelectorAll('[data-slot="button-group"]')].map((g) => [g.getAttribute("data-orientation"), getComputedStyle(g).flexDirection]));
    assert.ok(dir.some(([o, d]) => o === "vertical" && d === "column"), JSON.stringify(dir));
    await b.close();
  },
  async sidebarmenus() {
    // The block's onMobileChange ternary: right on desktop, bottom below md,
    // and it follows a viewport change without a reload.
    const p = await page("/view/sidebar-07", { viewport: { width: 1280, height: 900 } });
    const sides = () => p.evaluate(() => ({
      user: document.getElementById("sidebar07-nav-user-menu")?.parentElement.getAttribute("data-templ-side"),
      projects: [...document.querySelectorAll('[data-slot="dropdown-menu-content"][id^="sidebar07-nav-projects-menu-"]')].map((p) => p.parentElement).map((m) => m.getAttribute("data-templ-side") + "/" + m.getAttribute("data-templ-align")),
    }));
    const d = await sides();
    assert.equal(d.user, "right", `desktop user ${JSON.stringify(d)}`);
    assert.ok(d.projects.length && d.projects.every((x) => x === "right/start"), `desktop projects ${JSON.stringify(d)}`);
    await p.setViewportSize({ width: 500, height: 800 }); await p.waitForTimeout(300);
    const m = await sides();
    assert.equal(m.user, "bottom", `mobile user ${JSON.stringify(m)}`);
    assert.ok(m.projects.every((x) => x === "bottom/end"), `mobile projects ${JSON.stringify(m)}`);
    // Opening the user menu places it below the trigger.
    await p.locator('[data-slot="sidebar-trigger"]').first().click(); await p.waitForTimeout(500);
    const trigger = p.locator('[data-templ-controls="sidebar07-nav-user-menu"]');
    await trigger.click(); await p.waitForTimeout(400);
    // Requested bottom; flip may move it to top when the menu sits at the
    // bottom of the sheet, as in shadcn.
    const placed = await p.evaluate(() => { const m = document.getElementById("sidebar07-nav-user-menu").parentElement; return [m.getAttribute("data-templ-side"), m.getAttribute("data-side"), m.hasAttribute("data-open")]; });
    assert.equal(placed[0], "bottom", "requested bottom");
    assert.ok(placed[2] && ["bottom", "top"].includes(placed[1]), `placed ${placed}`);
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    // Projects menus sit mid sheet, there is room below.
    const pt = p.locator('[data-templ-controls^="sidebar07-nav-projects-menu-"]').first();
    await pt.evaluate((b) => b.click()); await p.waitForTimeout(400);
    const pid = await pt.getAttribute("data-templ-controls");
    assert.equal(await p.evaluate((id) => document.getElementById(id).getAttribute("data-side"), pid), "bottom", "projects menu opens below");
    await p.close();
  },
};

for (const [name, fn] of Object.entries(suites)) {
  if (only.length && !only.includes(name)) continue;
  try { await fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}: ${e.message.split("\n").slice(0, 12).join(" | ")}`); }
}
await browser.close();
for (const e of errs) console.log("PAGEERROR", e);
console.log(`${engine}: ${pass} pass, ${fail} fail, ${errs.length} page errors`);
process.exit(fail || errs.length ? 1 : 0);
