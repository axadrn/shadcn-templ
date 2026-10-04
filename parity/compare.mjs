// Usage: node compare.mjs <chromium|webkit> <example...|all|family:<prefix>> [--quiet] [--jobs=N]
// Opens each example on the shadcn reference (SHADCN_URL) and on our preview
// (TEMPL_URL)
// at the same viewport and compares, for the initial render and after every
// step of its scenario (scenarios.json): the DOM tree of what is rendered,
// the focused element, the scroll lock and a screenshot pixel diff. One line
// per step and check, PASS or FAIL with the first difference. Screenshots of
// a failing pixel check land in out/<engine>/.
import fs from "node:fs";
import { chromium, webkit } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const args = process.argv.slice(2);
const engine = args[0] || "chromium";
const quiet = args.includes("--quiet");
const jobs = Number((args.find((a) => a.startsWith("--jobs=")) || "--jobs=1").slice(7));
const targets = args.slice(1).filter((a) => !a.startsWith("--"));
const SHADCN = (process.env.SHADCN_URL || "http://localhost:3100") + "/examples/base/";
const TEMPL = (process.env.TEMPL_URL || "http://localhost:8090") + "/preview/";
const here = new URL(".", import.meta.url).pathname;
const names = fs.readFileSync(here + "examples.txt", "utf8").trim().split("\n");
const scenarios = JSON.parse(fs.readFileSync(here + "scenarios.json", "utf8"));
// Pixels may differ by font hinting and anti aliasing: a step passes when at
// most this share of the viewport differs.
const PIXEL_TOLERANCE = 0.002;

const list = targets.length === 0 || targets[0] === "all" ? names
  : targets[0].startsWith("family:") ? names.filter((n) => n.startsWith(targets[0].slice(7) + "-") || n === targets[0].slice(7))
  : targets;

function scenarioOf(name) {
  if (scenarios[name]) return scenarios[name];
  const family = Object.keys(scenarios).filter((k) => k.startsWith("family:"))
    .map((k) => k.slice(7)).sort((a, b) => b.length - a.length)
    .find((f) => name === f || name.startsWith(f + "-"));
  return family ? scenarios["family:" + family] : [];
}

// The rendered DOM as lines, one per element: depth, tag, slot, the sorted
// attribute names and the values that carry meaning. Infrastructure of
// either app and unrendered subtrees are left out.
function snapshot() {
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "TEMPLATE", "META", "NEXT-ROUTE-ANNOUNCER"]);
  const IDREF = new Set(["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-activedescendant", "for", "form", "aria-errormessage", "aria-details"]);
  const VALUE = (name) => name === "role" || (name.startsWith("aria-") && !IDREF.has(name)) ||
    ["data-slot", "data-side", "data-align", "data-orientation", "data-variant", "data-size", "type", "tabindex", "data-swipe-direction"].includes(name);
  const IGNORE = (name) => name === "class" || name === "style" || name === "id" || name === "nonce" ||
    name.startsWith("data-templ-") || name === "data-rootownerid" || name === "suppresshydrationwarning";
  const infrastructure = (el) =>
    el.matches('[data-slot="toast-viewport"], [data-slot="toast-portal"], section[aria-label^="Notifications"], [data-slot="tailwind-indicator"]') ||
    el.hasAttribute("data-templ-portal");
  const rendered = (el) => {
    if (el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none";
  };
  const lines = [];
  const walk = (el, depth) => {
    for (const child of el.children) {
      if (SKIP_TAGS.has(child.tagName) || infrastructure(child) || !rendered(child)) continue;
      const attrs = [...child.attributes].map((a) => a.name).filter((n) => !IGNORE(n)).sort();
      const parts = attrs.map((n) => (VALUE(n) ? `${n}=${child.getAttribute(n)}` : IDREF.has(n) ? `${n}=ref` : n));
      lines.push(`${"  ".repeat(depth)}${child.tagName.toLowerCase()}${parts.length ? " " + parts.join(" ") : ""}`);
      if (child.tagName !== "svg") walk(child, depth + 1);
    }
  };
  walk(document.body, 0);
  return lines;
}

function focusOf() {
  const a = document.activeElement;
  if (!a || a === document.body) return "body";
  return (a.getAttribute("data-slot") || a.tagName.toLowerCase()) + "|" + (a.getAttribute("role") || "");
}

function scrollLocked() {
  const html = document.documentElement;
  return html.hasAttribute("data-base-ui-scroll-locked") || getComputedStyle(html).overflow === "hidden" || getComputedStyle(document.body).overflow === "hidden";
}

// The first line where the two trees part, with a line of context.
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return null;
  return `line ${i + 1} of ${a.length}/${b.length}: shadcn "${(a[i] ?? "<end>").trim()}" templ "${(b[i] ?? "<end>").trim()}"`;
}

function pixelDiff(bufA, bufB, outPath) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  if (a.width !== b.width || a.height !== b.height) return { ratio: 1, note: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  const diff = new PNG({ width: a.width, height: a.height });
  const count = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const ratio = count / (a.width * a.height);
  if (ratio > PIXEL_TOLERANCE && outPath) {
    fs.mkdirSync(outPath.replace(/\/[^/]*$/, ""), { recursive: true });
    fs.writeFileSync(outPath + "-shadcn.png", bufA);
    fs.writeFileSync(outPath + "-templ.png", bufB);
    fs.writeFileSync(outPath + "-diff.png", PNG.sync.write(diff));
  }
  return { ratio };
}

async function step(page, s) {
  const box = async (sel) => page.locator(sel).filter({ visible: true }).first().boundingBox({ timeout: 2000 }).catch(() => null);
  if (s.click || s.rightclick || s.hover || s.focus) {
    let loc = null;
    for (const sel of [s.click || s.rightclick || s.hover || s.focus].flat()) {
      loc = s.focus ? page.locator(sel).first() : page.locator(sel).filter({ visible: true }).first();
      if (await loc.count()) break;
      loc = null;
    }
    if (!loc) return "no element";
    if (s.click) await loc.click({ timeout: 3000 }).catch(() => loc.evaluate((e) => e.click()));
    try {
      if (s.rightclick) await loc.click({ button: "right", timeout: 3000 });
      // A disabled target intercepts nothing: move the pointer there instead.
      if (s.hover) await loc.hover({ timeout: 3000 }).catch(async () => {
        const b = await loc.boundingBox();
        if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
      });
      if (s.focus) await loc.focus();
    } catch (e) {
      return "step failed (" + String(e.message || e).split("\n")[0] + ")";
    }
  }
  if (s.move) await page.mouse.move(...s.move, { steps: 5 });
  if (s.moveTo) {
    const b = await box(s.moveTo);
    if (!b) return "no element";
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  }
  if (s.down) {
    await page.mouse.move(...s.down);
    await page.mouse.down();
  }
  if (s.up) await page.mouse.up();
  if (s.wheel) await page.mouse.wheel(...s.wheel);
  if (s.key) await page.keyboard.press(s.key);
  if (s.type) await page.keyboard.type(s.type, { delay: 30 });
  await page.waitForTimeout(s.wait || 400);
  return null;
}

const label = (s) => !s ? "initial" : Object.keys(s).filter((k) => k !== "wait").map((k) => (typeof s[k] === "string" && k !== "type" && s[k].length < 18 ? `${k}:${s[k] === " " ? "Space" : s[k]}` : k)).join("+");

const browser = await (engine === "webkit" ? webkit : chromium).launch();
let pass = 0, fail = 0;

// One example on both apps; returns its output lines.
async function compareExample(name) {
  const out = [];
  const steps = [null, ...scenarioOf(name)];
  const pages = [];
  for (const base of [SHADCN, TEMPL]) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    // The pointer starts at 0,0, over whatever an example renders first:
    // whether that counts as a hover depends on when each app attaches its
    // listeners. Park it in the empty corner.
    await p.mouse.move(1279, 899);
    // A dev server that is restarting after an edit refuses the connection or
    // answers 502: wait for it (up to 5 minutes) instead of comparing nothing.
    for (let tries = 0; tries < 100; tries++) {
      const res = await p.goto(base + name, { waitUntil: "load", timeout: 60000 }).catch(() => null);
      if (res && res.status() !== 502 && res.status() !== 503) break;
      await p.waitForTimeout(3000);
    }
    await p.waitForTimeout(800);
    // Images come from the network (ours) or Next's local image proxy
    // (shadcn): wait until the visible ones loaded, up to 5 s.
    await p.waitForFunction(() => [...document.images].every((i) => i.complete || i.getBoundingClientRect().bottom < 0 || i.getBoundingClientRect().top > innerHeight), null, { timeout: 5000 }).catch(() => {});
    pages.push(p);
  }
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const missing = [];
    // Both apps take the step at the same time, so both had the same wait.
    if (s) (await Promise.all(pages.map((p) => step(p, s)))).forEach((r, j) => { if (r) missing.push((j ? "templ " : "shadcn ") + r); });
    const [domA, domB] = await Promise.all(pages.map((p) => p.evaluate(snapshot)));
    const [focusA, focusB] = await Promise.all(pages.map((p) => p.evaluate(focusOf)));
    const [lockA, lockB] = await Promise.all(pages.map((p) => p.evaluate(scrollLocked)));
    const [shotA, shotB] = await Promise.all(pages.map((p) => p.screenshot()));
    const pixels = pixelDiff(shotA, shotB, `${here}out/${engine}/${name}-${i}`);
    const checks = [
      ["dom", firstDiff(domA, domB)],
      ["focus", focusA === focusB ? null : `shadcn=${focusA} templ=${focusB}`],
      ["lock", lockA === lockB ? null : `shadcn=${lockA} templ=${lockB}`],
      ["pixels", pixels.ratio <= PIXEL_TOLERANCE ? null : (pixels.note || `${(pixels.ratio * 100).toFixed(2)}% differ`)],
    ];
    if (missing.length) checks.unshift(["step", missing.join(", ")]);
    for (const [check, diff] of checks) {
      if (diff) fail++; else pass++;
      if (diff || !quiet) out.push(`${diff ? "FAIL" : "PASS"} ${name} ${label(s)} ${check}${diff ? ": " + diff : ""}`);
    }
  }
  await Promise.all(pages.map((p) => p.close()));
  return out;
}

// N workers take the next example each, every example prints as one block.
const queue = [...list];
await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
  while (queue.length) {
    const name = queue.shift();
    const lines = await compareExample(name).catch((e) => [`FAIL ${name} error: ${String(e.message || e).split("\n")[0]}`]);
    if (lines.length) console.log(lines.join("\n"));
  }
}));
await browser.close();
console.log(`${engine}: ${pass} pass, ${fail} fail over ${list.length} examples`);
