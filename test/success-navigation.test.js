import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../public/success.html", import.meta.url), "utf8");
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/^\s*import .*;\s*$/gm, "");
const fallback = html.match(/id="back-to-store" href="([^"]+)"/)[1];

for (const [page, base, expected] of [
  ["https://sanyang.vovosnap.com/success.html?id=test", "", "https://sanyang.vovosnap.com/"],
  ["https://sanyang.vovosnap.com/success?id=test", "", "https://sanyang.vovosnap.com/"],
  ["https://vovosnap.com/s/sanyang/success.html?id=test", "/s/sanyang", "https://vovosnap.com/s/sanyang/"],
  ["https://vovosnap.com/s/sanyang/success?id=test", "/s/sanyang", "https://vovosnap.com/s/sanyang/"],
]) {
  test(`返回商店保留所屬店家：${page}`, () => {
    // The plain HTML link must also work before the module loads.
    assert.equal(new URL(fallback, page).href, expected);
    const link = { href: fallback };
    vm.runInNewContext(script, {
      window: { __API_BASE: base },
      document: { getElementById: (id) => id === "back-to-store" ? link : {} },
      // No order ID: exercise navigation without fetching a real order.
      location: { search: "" },
      URLSearchParams,
    });
    assert.equal(new URL(link.href, page).href, expected);
  });
}
