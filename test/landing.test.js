import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("landing page carries the SaaS redesign without dropping critical behaviors", () => {
  const required = [
    // SEO / meta
    "拍一張照，商品就上架了",
    "AI 自動辨識商品",
    // GA 與追蹤
    "G-E3TD4YZSWY",
    "cta_click",
    "trackCta('hero')",
    "trackCta('nav')",
    "trackCta('pricing')",
    // Hero
    'id="ai-demo"',
    "免費開店",
    "查看範例店舖",
    // 痛點對比區
    "還在這樣上架商品嗎",
    "一天上架 30 件",
    // 四步驟與功能
    "開店只要 4 步驟",
    "拍照上傳",
    "成交收款",
    "匯率自動定價",
    // 定價（行為不可 regress）
    'id="plan-track"',
    'data-plan="pro"',
    "billing-toggle-btn",
    'id="offer-backdrop"',
    "startPlanCheckout",
    "/assets/billing-checkout.js",
    "立即開通",
    // FAQ
    'id="faq-list"',
    "faq-item",
    // 動態資料
    "/api/plan-offers",
    "/api/plan-limits",
    "/api/faq",
    // auth 切換
    "/auth/me",
    'id="nav-auth-btn"',
    // 可近性
    "prefers-reduced-motion",
  ];
  for (const s of required) {
    assert.ok(html.includes(s), `Expected landing page to include ${s}`);
  }
});

test("collage-era assets and fonts are gone", () => {
  const banned = [
    "collage-stage",
    "torn-band",
    "hero-bg-konbini.webp",
    "collage-camera.webp",
    "family=Caveat",
    "Zen Maru Gothic",
    "聯繫客服開啟方案",
  ];
  for (const s of banned) {
    assert.ok(!html.includes(s), `Expected landing page NOT to include ${s}`);
  }
});
