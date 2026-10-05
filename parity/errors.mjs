// Usage: node errors.mjs <chromium|webkit> [path...]
// Loads every docs page of the site (components, utils, the rest of
// /docs), every preview and every create example on our app and reports
// what the browser reports as broken: script errors, console errors and
// warnings, failed requests and HTTP errors. Without paths it builds the
// list from the sitemap and the example registry.
import { chromium, webkit } from "playwright";
import fs from "node:fs";

const TEMPL = process.env.TEMPL_URL || "http://localhost:8090";
const engine = process.argv[2] || "chromium";
const here = new URL(".", import.meta.url).pathname;
let paths = process.argv.slice(3);
if (!paths.length) {
  const sitemap = await (await fetch(TEMPL + "/sitemap.xml")).text();
  paths = [...sitemap.matchAll(/<loc>[^<]*?(\/docs[^<]*)<\/loc>/g)].map((m) => m[1]);
  const examples = fs.readFileSync(here + "examples.txt", "utf8").trim().split("\n");
  paths.push(...examples.map((n) => "/preview/" + n));
  const creates = fs.readdirSync(here + "../internal/ui/examples", { recursive: true })
    .filter((f) => f.endsWith("_example.templ")).length;
  console.error(`${paths.length} pages (${creates} create examples are in the previews via their registry names)`);
}

const browser = await (engine === "webkit" ? webkit : chromium).launch();
const queue = [...new Set(paths)];
let broken = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const path = queue.shift();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push("page error: " + String(e.message || e).split("\n")[0]));
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(m.type() + ": " + m.text().split("\n")[0].slice(0, 200)));
    page.on("requestfailed", (r) => errors.push("request failed: " + r.url()));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`));
    await page.goto(TEMPL + path, { waitUntil: "load", timeout: 60000 }).catch((e) => errors.push("load: " + e.message.split("\n")[0]));
    await page.waitForTimeout(1500);
    const unique = [...new Set(errors)];
    if (unique.length) {
      broken++;
      console.log(`FAIL ${path}\n  ${unique.slice(0, 5).join("\n  ")}`);
    }
    await page.close();
  }
}));
await browser.close();
console.log(`${engine}: ${paths.length - broken} clean, ${broken} with errors over ${paths.length} pages`);
