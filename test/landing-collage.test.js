import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("landing page uses the collage redesign hooks without dropping critical interactions", () => {
  const requiredSnippets = [
    "/assets/images/logo_new01.png",
    "collage-stage",
    "paper-card",
    "torn-band",
    "讓創作者一鍵開店",
    "dashboard-mockup",
    "查看範例店舖",
    "cta_click",
    "section:'hero'",
    "plan-track",
    "faq-item",
    "開店只要 4 步驟",
    "拍照 / 上傳",
    "成交 / 收款",
    "why-band",
    "為什麼選擇 我拍開店平台",
    "超快速開店",
    "開始你的第一筆自動成交",
    "Start your business today",
    "我拍｜開店平台 — 創作者一鍵開店",
    "AI 生成商品頁，一鍵上架開店",
    "new_sale.webp",
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(html.includes(snippet), `Expected landing page to include ${snippet}`);
  }
});
