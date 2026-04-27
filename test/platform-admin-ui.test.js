import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const platformAdminHtml = readFileSync(new URL("../public/platform-admin.html", import.meta.url), "utf8");
const adminHtml = readFileSync(new URL("../public/admin.html", import.meta.url), "utf8");

test("platform admin members page exposes a structured management toolbar and table", () => {
  const requiredSnippets = [
    'class="members-shell"',
    'id="member-search"',
    'id="member-plan-filter"',
    'id="member-status-filter"',
    'id="member-sort"',
    'class="members-table"',
    'id="member-table-body"',
    'class="member-mobile-list"',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(
      platformAdminHtml.includes(snippet),
      `Expected platform admin members UI to include ${snippet}`
    );
  }
});

test("member admin banner section uses an accessible button-based collapse control", () => {
  const requiredSnippets = [
    'id="banner-collapse-toggle"',
    'aria-expanded="false"',
    'aria-controls="banner-collapse-body"',
    "syncBannerCollapse",
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(adminHtml.includes(snippet), `Expected admin banner collapse control to include ${snippet}`);
  }
});
