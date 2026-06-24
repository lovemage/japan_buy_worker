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

test("member payment toggles expose clear disabled and pending-save feedback", () => {
  const requiredSnippets = [
    'id = "payment-toggle-hint"',
    '請先完成金鑰設定並測試連線成功，才能開啟收款。',
    '目前無法直接關閉收款',
    '已切換環境，請按下方「儲存」才會生效。',
    '需先開啟收款並通過連線測試，才能啟用下單後直接前往付款。',
    '已切換下單付款流程，請按下方「儲存」才會生效。',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(adminHtml.includes(snippet), `Expected payment toggle UI to include ${snippet}`);
  }

  assert.match(adminHtml, /var enableWrap = document\.createElement\("div"\);/);
  assert.match(adminHtml, /var sandboxWrap = document\.createElement\("div"\);/);
  assert.match(adminHtml, /var directWrap = document\.createElement\("div"\);/);
});
