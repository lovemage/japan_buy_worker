# 首頁全面改版（現代 SaaS 俐落風）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重寫 `public/index.html` 為現代 SaaS 俐落風（痛點直擊＋AI 上架動畫演示），定價 CTA 接上 PAYUNi 線上付款。

**Architecture:** 維持單檔 HTML、無框架、inline CSS。新 DOM ＋ 新文案；既有 JS 行為（GA、/auth/me 切換、plan carousel、FAQ accordion）從舊檔移植並適配新 selector。守護測試由 `test/landing-collage.test.js` 換成 `test/landing.test.js`。

**Tech Stack:** 純 HTML/CSS/JS、Noto Sans TC、GA4（G-E3TD4YZSWY）。

**Spec:** `docs/superpowers/specs/2026-06-11-homepage-redesign-design.md`
**前置：** PAYUNi 金流計畫（`2026-06-11-payuni-subscription-billing.md`）已完成——本計畫會用到 `public/assets/billing-checkout.js`。

**舊檔移植清單（現行 `public/index.html` 行號）：**
- `22-28` GA snippet（原樣保留）
- `1170-1175` `trackCta()`（原樣保留）
- `1192-1203` `/api/faq` 載入 + FAQ accordion 渲染（保留邏輯，容器 id 沿用 `faq-list`）
- `1205-1235` `/api/plan-limits` 載入（保留）
- `1237-1430` `PLAN_OFFERS` 載入、`switchBilling()`、`updatePlanPrice()`、`openPlanOfferPopup()`、plan-track 拖曳（保留邏輯，DOM id 沿用：`plan-track`、`offer-backdrop`、`offer-content`、`.billing-toggle-btn`、`.plan[data-plan=…]`）
- `1498-1520` `/auth/me` nav 切換（保留，改寫入新 nav 的 `#nav-auth-btn`、`#nav-cta-btn`）
- 「查看範例店舖」連結 href 沿用舊檔現值（搜 `查看範例店舖` 取得）

---

### Task 1: 新守護測試（先寫、先紅）

**Files:**
- Create: `test/landing.test.js`
- Delete: `test/landing-collage.test.js`

- [ ] **Step 1: 建立 `test/landing.test.js`**

```js
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
```

- [ ] **Step 2: 刪除舊測試、確認新測試失敗**

```bash
git rm test/landing-collage.test.js
node --test test/landing.test.js
```
Expected: FAIL（新文案尚未存在）。

- [ ] **Step 3: Commit（紅燈一起進，重寫完成後轉綠）**

```bash
git add test/landing.test.js
git commit -m "test(landing): replace collage guard with SaaS redesign guard (red)"
```

---

### Task 2: 新 index.html — head / 設計 tokens / nav / footer 骨架

**Files:**
- Modify: `public/index.html`（整檔重寫的第一階段：先建立完整骨架與頭尾，section 以註解佔位、後續 Task 逐段填入）

- [ ] **Step 1: 重寫 head 與骨架**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>我拍 VOVOSnap｜拍一張照，商品就上架了 — AI 自動辨識上架的開店平台</title>
<meta name="description" content="拍照上傳，AI 自動辨識商品、寫文案、抓規格、換算匯率定價，60 秒生成可下單的商品頁。給任何想快速上架並擁有自己電商網站的賣家。" />
<meta property="og:title" content="我拍 VOVOSnap｜拍一張照，商品就上架了" />
<meta property="og:description" content="AI 自動辨識商品、生成文案與售價，60 秒上架開賣。不抽成、不用學電商系統。" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://vovosnap.com/" />
<link rel="icon" href="/assets/images/logo_new01.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap" rel="stylesheet" />
<!-- Google tag (gtag.js)：自舊檔 22-28 行原樣搬入 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-E3TD4YZSWY"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-E3TD4YZSWY');
</script>
<style>
/* ── Design tokens ───────────────────────────── */
:root {
  --ink: #14181f;          /* 主文字 */
  --muted: #5c636e;        /* 次文字 */
  --faint: #8a919c;        /* 弱文字 */
  --bg: #ffffff;
  --bg-alt: #f7f8fa;       /* 分區交替底 */
  --line: #e6e8eb;         /* 邊框 */
  --orange: #f26b1d;       /* 品牌橘（沿用） */
  --orange-dark: #d8550b;
  --orange-soft: #fef0e7;  /* 橘色淡底 */
  --green: #1a9e6e;
  --radius: 14px;
  --shadow: 0 8px 24px rgba(20,24,31,0.07);
  --maxw: 1080px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { font-family: "Noto Sans TC", -apple-system, sans-serif; color: var(--ink); background: var(--bg);
       font-size: 16px; line-height: 1.7; -webkit-font-smoothing: antialiased; }
img { max-width: 100%; display: block; }
a { color: inherit; }
.wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 20px; }
section { padding: 88px 0; }
section.alt { background: var(--bg-alt); }
.sec-kicker { display: inline-block; font-size: 13px; font-weight: 700; color: var(--orange);
              background: var(--orange-soft); border-radius: 999px; padding: 4px 14px; margin-bottom: 14px; }
.sec-title { font-size: clamp(26px, 4vw, 38px); font-weight: 900; line-height: 1.35; letter-spacing: 0.01em; }
.sec-sub { font-size: 16px; color: var(--muted); margin-top: 12px; max-width: 560px; }
.center { text-align: center; }
.center .sec-sub { margin-left: auto; margin-right: auto; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700;
       border-radius: 10px; text-decoration: none; cursor: pointer; border: none;
       transition: transform .15s ease, box-shadow .15s ease, background .15s ease; }
.btn:active { transform: scale(.97); }
.btn-primary { background: var(--orange); color: #fff; box-shadow: 0 6px 16px rgba(242,107,29,.3); }
.btn-primary:hover { background: var(--orange-dark); transform: translateY(-2px); }
.btn-ghost { background: #fff; color: var(--ink); border: 1.5px solid var(--line); }
.btn-ghost:hover { border-color: var(--orange); color: var(--orange-dark); }
.btn-lg { padding: 16px 34px; font-size: 17px; }
.btn-sm { padding: 9px 20px; font-size: 14px; }
/* 各 section 專屬樣式由 Task 3-6 加在這之後 */
</style>
</head>
<body>

<!-- ── Nav ─────────────────────────────────── -->
<header class="nav">
  <div class="wrap nav-inner">
    <a href="/" class="nav-logo"><img src="/assets/images/logo_new01.png" alt="我拍 VOVOSnap" /><span>我拍｜開店平台</span></a>
    <nav class="nav-links">
      <a href="#features">功能</a>
      <a href="#compare">為什麼需要</a>
      <a href="#pricing">方案價格</a>
      <a href="/blog/" >教學資源</a>
    </nav>
    <div class="nav-actions">
      <a href="/login.html" class="btn btn-ghost btn-sm" id="nav-auth-btn">登入</a>
      <a href="/login.html" class="btn btn-primary btn-sm" id="nav-cta-btn" onclick="trackCta('nav')">免費開店</a>
    </div>
  </div>
</header>

<!-- TASK 3: HERO -->
<!-- TASK 4: PAIN COMPARE -->
<!-- TASK 5: STEPS / FEATURES / PROOF -->
<!-- TASK 6: PRICING / FAQ / FINAL CTA -->

<!-- ── Footer ──────────────────────────────── -->
<footer class="footer">
  <div class="wrap footer-inner">
    <div>
      <strong>我拍｜開店平台 VOVOSnap</strong>
      <p>拍照上傳，AI 自動上架，把時間還給你。</p>
    </div>
    <nav>
      <a href="/terms.html">服務條款</a>
      <a href="/privacy.html">隱私權政策</a>
      <a href="/blog/">教學資源</a>
    </nav>
  </div>
  <p class="footer-copy">© 2026 VOVOSnap. All rights reserved.</p>
</footer>

<script src="/assets/billing-checkout.js"></script>
<script>
/* trackCta：自舊檔 1170-1175 原樣搬入 */
function trackCta(section) {
  if (typeof gtag === "function") {
    gtag("event", "cta_click", { section: section });
  }
}
/* TASK 3-6 的 JS 加在這之後；
   舊檔 1192-1430（faq/plan-limits/plan-offers/carousel）與 1498-1520（auth/me）
   於 Task 5、6 搬入並適配新 DOM */
</script>
</body>
</html>
```

nav / footer CSS（加進 `<style>` 尾端）：

```css
.nav { position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,.92);
       backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
.nav-inner { display: flex; align-items: center; gap: 28px; height: 64px; }
.nav-logo { display: flex; align-items: center; gap: 10px; font-weight: 900; font-size: 16px; text-decoration: none; }
.nav-logo img { width: 32px; height: 32px; border-radius: 8px; }
.nav-links { display: flex; gap: 22px; margin-left: auto; }
.nav-links a { font-size: 14px; font-weight: 500; color: var(--muted); text-decoration: none; }
.nav-links a:hover { color: var(--ink); }
.nav-actions { display: flex; gap: 10px; }
.footer { background: var(--bg-alt); border-top: 1px solid var(--line); padding: 48px 0 28px; }
.footer-inner { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.footer-inner p { color: var(--muted); font-size: 14px; margin-top: 6px; }
.footer-inner nav { display: flex; gap: 18px; }
.footer-inner nav a { font-size: 14px; color: var(--muted); text-decoration: none; }
.footer-copy { text-align: center; color: var(--faint); font-size: 12px; margin-top: 32px; }
@media (max-width: 760px) { .nav-links { display: none; } }
```

- [ ] **Step 2: 本機確認骨架**

Run: `npx wrangler dev`，瀏覽 `http://localhost:8787/`
Expected: nav＋footer 正常、無 console error（section 仍空）。

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): rewrite shell — clean SaaS tokens, nav, footer"
```

---

### Task 3: Hero ＋ AI 上架動畫演示

**Files:**
- Modify: `public/index.html`（`<!-- TASK 3: HERO -->` 位置）

- [ ] **Step 1: Hero markup**

```html
<!-- ── Hero ────────────────────────────────── -->
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="sec-kicker">AI 自動辨識・自動上架</span>
      <h1>拍一張照，<br /><em>商品就上架了</em></h1>
      <p class="hero-sub">AI 自動辨識商品、寫文案、抓規格、換算匯率定價——60 秒生成可以直接下單的商品頁。不用學電商系統，不用排版。</p>
      <div class="hero-cta">
        <a href="/login.html" class="btn btn-primary btn-lg" onclick="trackCta('hero')">免費開店</a>
        <a href="〔沿用舊檔「查看範例店舖」的 href〕" class="btn btn-ghost btn-lg" target="_blank" rel="noopener">查看範例店舖</a>
      </div>
      <p class="hero-proof">已有 <strong>10,000+</strong> 位賣家使用・平台<strong>不抽成</strong></p>
    </div>
    <div class="hero-demo" id="ai-demo" aria-label="AI 上架流程演示">
      <div class="demo-phone">
        <div class="demo-shot">
          <div class="demo-flash"></div>
          <div class="demo-photo">📷 拍下商品照片</div>
        </div>
        <div class="demo-scan">
          <div class="demo-scanline"></div>
          <p class="demo-scan-label">AI 辨識中…</p>
          <ul class="demo-found">
            <li>✓ 商品名稱：橙楓陶瓷花瓶組</li>
            <li>✓ 規格：高 18cm／一組兩入</li>
            <li>✓ 建議售價：NT$ 1,280（含匯率換算）</li>
          </ul>
        </div>
        <div class="demo-card">
          <div class="demo-card-img">🏺</div>
          <p class="demo-card-name">橙楓陶瓷花瓶組</p>
          <p class="demo-card-desc">日本職人手作，秋季限定釉色，一組兩入。</p>
          <p class="demo-card-price">NT$ 1,280</p>
          <span class="demo-card-btn">加入購物車</span>
          <p class="demo-card-done">✓ 已上架到你的商店</p>
        </div>
      </div>
      <div class="demo-steps">
        <span class="demo-step" data-step="0">1. 拍照</span>
        <span class="demo-step" data-step="1">2. AI 辨識</span>
        <span class="demo-step" data-step="2">3. 上架完成</span>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Hero CSS**

```css
.hero { padding: 96px 0 80px; background: linear-gradient(180deg, var(--orange-soft) 0%, #fff 55%); }
.hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 48px; align-items: center; }
.hero h1 { font-size: clamp(34px, 5.4vw, 56px); font-weight: 900; line-height: 1.25; letter-spacing: .01em; }
.hero h1 em { font-style: normal; color: var(--orange); }
.hero-sub { font-size: 17px; color: var(--muted); margin: 18px 0 28px; max-width: 460px; }
.hero-cta { display: flex; gap: 14px; flex-wrap: wrap; }
.hero-proof { margin-top: 20px; font-size: 14px; color: var(--faint); }
.hero-proof strong { color: var(--ink); }
/* demo：三幕輪播，由 JS 切 data-phase */
.hero-demo { position: relative; }
.demo-phone { background: #fff; border: 1px solid var(--line); border-radius: 22px; box-shadow: var(--shadow);
              padding: 18px; min-height: 360px; position: relative; overflow: hidden; }
.demo-shot, .demo-scan, .demo-card { position: absolute; inset: 18px; opacity: 0; transition: opacity .45s ease; }
.hero-demo[data-phase="0"] .demo-shot,
.hero-demo[data-phase="1"] .demo-scan,
.hero-demo[data-phase="2"] .demo-card { opacity: 1; }
.demo-photo { height: 100%; display: flex; align-items: center; justify-content: center;
              background: var(--bg-alt); border-radius: 14px; color: var(--muted); font-weight: 700; }
.demo-flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
.hero-demo[data-phase="0"] .demo-flash { animation: flash 1.2s ease 1; }
@keyframes flash { 0%,100% { opacity: 0; } 12% { opacity: .9; } 30% { opacity: 0; } }
.demo-scanline { height: 3px; background: var(--orange); border-radius: 2px; box-shadow: 0 0 12px var(--orange);
                 animation: scan 1.6s ease-in-out infinite; }
@keyframes scan { 0%,100% { transform: translateY(0); } 50% { transform: translateY(220px); } }
.demo-scan-label { font-weight: 700; color: var(--orange); margin: 14px 0 10px; }
.demo-found li { list-style: none; font-size: 14px; color: var(--ink); background: var(--bg-alt);
                 border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; opacity: 0; transform: translateY(6px); }
.hero-demo[data-phase="1"] .demo-found li { animation: rise .4s ease forwards; }
.hero-demo[data-phase="1"] .demo-found li:nth-child(2) { animation-delay: .5s; }
.hero-demo[data-phase="1"] .demo-found li:nth-child(3) { animation-delay: 1s; }
@keyframes rise { to { opacity: 1; transform: translateY(0); } }
.demo-card { display: flex; flex-direction: column; gap: 6px; }
.demo-card-img { font-size: 64px; text-align: center; background: var(--bg-alt); border-radius: 14px; padding: 26px 0; }
.demo-card-name { font-weight: 900; font-size: 18px; }
.demo-card-desc { font-size: 13px; color: var(--muted); }
.demo-card-price { font-weight: 900; color: var(--orange); font-size: 20px; }
.demo-card-btn { background: var(--orange); color: #fff; text-align: center; border-radius: 8px;
                 padding: 9px 0; font-size: 14px; font-weight: 700; }
.demo-card-done { font-size: 13px; color: var(--green); font-weight: 700; }
.demo-steps { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
.demo-step { font-size: 13px; color: var(--faint); background: #fff; border: 1px solid var(--line);
             border-radius: 999px; padding: 5px 14px; transition: all .3s; }
.demo-step.active { color: #fff; background: var(--orange); border-color: var(--orange); }
@media (max-width: 860px) {
  .hero-grid { grid-template-columns: 1fr; gap: 36px; }
  .hero { padding: 56px 0 48px; }
}
@media (prefers-reduced-motion: reduce) {
  .demo-scanline, .demo-flash { animation: none !important; }
  .demo-shot, .demo-scan, .demo-card { transition: none; }
}
```

- [ ] **Step 3: Demo JS（body 尾 script 區）**

```js
// AI 上架演示：三幕輪播（reduced-motion 時固定停在完成態）
(function () {
  var demo = document.getElementById("ai-demo");
  if (!demo) return;
  var steps = demo.querySelectorAll(".demo-step");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function setPhase(p) {
    demo.setAttribute("data-phase", String(p));
    steps.forEach(function (el) {
      el.classList.toggle("active", Number(el.getAttribute("data-step")) === p);
    });
  }
  if (reduced) { setPhase(2); return; }
  var phase = 0;
  var durations = [1800, 2600, 3200];
  setPhase(0);
  (function next() {
    setTimeout(function () {
      phase = (phase + 1) % 3;
      setPhase(phase);
      next();
    }, durations[phase]);
  })();
})();
```

- [ ] **Step 4: 本機目視驗證**

Run: `npx wrangler dev` → 首屏動畫三幕輪播順暢；360px 寬不破版。

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): hero with AI auto-listing demo animation"
```

---

### Task 4: 痛點對比區

**Files:**
- Modify: `public/index.html`（`<!-- TASK 4 -->` 位置）

- [ ] **Step 1: Markup ＋ CSS**

```html
<!-- ── 痛點對比 ────────────────────────────── -->
<section class="alt" id="compare">
  <div class="wrap center">
    <span class="sec-kicker">你的時間不該花在排版</span>
    <h2 class="sec-title">還在這樣上架商品嗎？</h2>
    <div class="compare-grid">
      <div class="compare-col compare-old">
        <h3>手動上架</h3>
        <ul>
          <li>🔍 上網查商品資料、翻規格</li>
          <li>✍️ 自己想文案、一句一句打</li>
          <li>🖼️ 修圖、去背、排版</li>
          <li>🧮 查匯率、按計算機算售價</li>
          <li>💬 LINE 訊息一個一個報價</li>
        </ul>
        <p class="compare-cost">一件商品 <strong>1～2 小時</strong></p>
      </div>
      <div class="compare-vs">VS</div>
      <div class="compare-col compare-new">
        <h3>用 我拍</h3>
        <ul>
          <li>📸 拍一張照</li>
          <li>🤖 AI 自動辨識、寫文案、抓規格</li>
          <li>💱 匯率自動換算、售價自動算好</li>
          <li>🔗 連結丟到 LINE 群，客人自己下單</li>
        </ul>
        <p class="compare-cost good">一件商品 <strong>60 秒</strong></p>
      </div>
    </div>
    <p class="compare-punch">一天上架 30 件，時間還給你自己。</p>
  </div>
</section>
```

```css
.compare-grid { display: grid; grid-template-columns: 1fr 56px 1fr; gap: 18px; align-items: stretch;
                max-width: 880px; margin: 40px auto 0; text-align: left; }
.compare-col { background: #fff; border: 1px solid var(--line); border-radius: var(--radius);
               padding: 28px 26px; box-shadow: var(--shadow); }
.compare-col h3 { font-size: 18px; font-weight: 900; margin-bottom: 16px; }
.compare-col li { list-style: none; padding: 9px 0; font-size: 15px; border-bottom: 1px dashed var(--line); }
.compare-col li:last-child { border-bottom: none; }
.compare-old { opacity: .85; }
.compare-old h3 { color: var(--faint); }
.compare-new { border: 2px solid var(--orange); position: relative; }
.compare-new h3 { color: var(--orange); }
.compare-vs { align-self: center; text-align: center; font-weight: 900; color: var(--faint); }
.compare-cost { margin-top: 16px; font-size: 14px; color: var(--muted); }
.compare-cost strong { font-size: 18px; color: var(--ink); }
.compare-cost.good strong { color: var(--orange); }
.compare-punch { margin-top: 32px; font-size: clamp(18px, 2.6vw, 24px); font-weight: 900; }
@media (max-width: 760px) {
  .compare-grid { grid-template-columns: 1fr; }
  .compare-vs { padding: 4px 0; }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): manual-vs-AI pain comparison section"
```

---

### Task 5: 四步驟／功能網格／社會證明（含 plan-limits、auth JS 移植）

**Files:**
- Modify: `public/index.html`（`<!-- TASK 5 -->` 位置與 script 區）

- [ ] **Step 1: 四步驟**

```html
<!-- ── 四步驟 ─────────────────────────────── -->
<section id="how">
  <div class="wrap center">
    <span class="sec-kicker">出國前設定一次就好</span>
    <h2 class="sec-title">開店只要 4 步驟</h2>
    <div class="steps-grid">
      <div class="step-card"><span class="step-no">01</span><h3>拍照上傳</h3><p>拍下商品或上傳圖片，AI 自動辨識品名與規格。</p></div>
      <div class="step-card"><span class="step-no">02</span><h3>AI 生成</h3><p>文案、售價、匯率換算一次到位，商品頁直接生成。</p></div>
      <div class="step-card"><span class="step-no">03</span><h3>分享導購</h3><p>連結丟到 LINE 群或社群，客人自己逛、自己下單。</p></div>
      <div class="step-card"><span class="step-no">04</span><h3>成交收款</h3><p>訂單自動彙整成清單，照單採買、收款、出貨不漏單。</p></div>
    </div>
  </div>
</section>
```

```css
.steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 40px; text-align: left; }
.step-card { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 24px 22px; box-shadow: var(--shadow); }
.step-no { font-size: 13px; font-weight: 900; color: var(--orange); }
.step-card h3 { font-size: 17px; font-weight: 900; margin: 8px 0 6px; }
.step-card p { font-size: 14px; color: var(--muted); }
@media (max-width: 860px) { .steps-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .steps-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: 功能網格＋社會證明**

```html
<!-- ── 功能 ───────────────────────────────── -->
<section class="alt" id="features">
  <div class="wrap center">
    <span class="sec-kicker">AI 全程代勞</span>
    <h2 class="sec-title">上架的每個麻煩，都有 AI 接手</h2>
    <div class="feat-grid">
      <div class="feat-card"><span>🤖</span><h3>AI 商品辨識</h3><p>一張照片自動辨識品名、品牌、規格。</p></div>
      <div class="feat-card"><span>✍️</span><h3>AI 文案生成</h3><p>商品描述與社群貼文自動寫好，照貼即用。</p></div>
      <div class="feat-card"><span>💱</span><h3>匯率自動定價</h3><p>日幣自動換台幣，加價規則一次設定。</p></div>
      <div class="feat-card"><span>📲</span><h3>LINE 導購分享</h3><p>商品連結一鍵分享，不再一對一報價。</p></div>
      <div class="feat-card"><span>📦</span><h3>訂單自動彙整</h3><p>誰訂了什麼自動成清單，採買出貨不漏單。</p></div>
      <div class="feat-card"><span>🏪</span><h3>專屬商店</h3><p>自己的網址、自己的品牌，SSL 安全收單。</p></div>
    </div>
  </div>
</section>

<!-- ── 社會證明 ────────────────────────────── -->
<section id="proof">
  <div class="wrap center">
    <h2 class="sec-title">想快速開店的賣家，已經用起來了</h2>
    <div class="proof-grid">
      <div class="proof-stat"><strong>10,000+</strong><span>使用中的賣家</span></div>
      <div class="proof-stat"><strong>60 秒</strong><span>平均一件商品上架</span></div>
      <div class="proof-stat"><strong>0%</strong><span>交易抽成</span></div>
    </div>
    <a href="〔沿用舊檔「查看範例店舖」的 href〕" class="btn btn-ghost btn-lg" target="_blank" rel="noopener">看看真實商店長什麼樣 →</a>
  </div>
</section>
```

```css
.feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 40px; text-align: left; }
.feat-card { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 26px 24px; box-shadow: var(--shadow); }
.feat-card span { font-size: 30px; }
.feat-card h3 { font-size: 17px; font-weight: 900; margin: 10px 0 6px; }
.feat-card p { font-size: 14px; color: var(--muted); }
.proof-grid { display: flex; justify-content: center; gap: 56px; margin: 36px 0 32px; flex-wrap: wrap; }
.proof-stat strong { display: block; font-size: clamp(30px, 4vw, 44px); font-weight: 900; color: var(--orange); }
.proof-stat span { font-size: 14px; color: var(--muted); }
@media (max-width: 860px) { .feat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .feat-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: 移植 JS**

- 舊檔 `1205-1235`（`/api/plan-limits`）與 `1498-1520`（`/auth/me` nav 切換）搬入 script 區。auth 切換適配：登入後 `#nav-auth-btn` 文字改「登出」、`#nav-cta-btn` 改「進入後台」連到舊檔同邏輯的目的網址。

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): steps, feature grid, social proof; port plan-limits and auth toggle"
```

---

### Task 6: 定價（接 PAYUNi）／FAQ／Final CTA

**Files:**
- Modify: `public/index.html`（`<!-- TASK 6 -->` 位置與 script 區）

- [ ] **Step 1: 定價區 markup**

沿用舊檔 `859-1110` 的 plan 卡結構與 id（`plan-track`、`data-plan`、`.billing-toggle-btn`、`offer-backdrop`/`offer-content`、方案說明彈窗），重新套新版卡片樣式。差異：

- Free 卡 CTA：`<a href="/login.html" class="btn btn-primary" onclick="trackCta('pricing')">免費註冊</a>`
- 付費卡 CTA（Plus/Pro/Pro+ 各一，據卡片 `data-plan`）：

```html
<button class="btn btn-primary plan-buy" data-plan="pro" onclick="trackCta('pricing'); openCheckoutModal(this.dataset.plan)">立即開通</button>
```

- 新增期數選擇 modal（放 `offer-backdrop` 旁）：

```html
<div class="checkout-backdrop" id="checkout-backdrop">
  <div class="checkout-modal">
    <h3 id="checkout-title">選擇開通期數</h3>
    <div id="checkout-options"></div>
    <button class="checkout-close" onclick="closeCheckoutModal()">取消</button>
  </div>
</div>
```

```css
.checkout-backdrop { position: fixed; inset: 0; background: rgba(20,24,31,.45); display: none;
                     align-items: center; justify-content: center; z-index: 100; padding: 20px; }
.checkout-backdrop.is-open { display: flex; }
.checkout-modal { background: #fff; border-radius: 16px; padding: 28px 26px; max-width: 420px; width: 100%; }
.checkout-modal h3 { font-size: 18px; font-weight: 900; margin-bottom: 16px; }
.checkout-opt { display: flex; justify-content: space-between; align-items: center; width: 100%;
                border: 1.5px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 10px;
                background: #fff; cursor: pointer; font-size: 15px; }
.checkout-opt:hover { border-color: var(--orange); }
.checkout-opt strong { color: var(--orange); }
.checkout-close { width: 100%; padding: 11px 0; border: none; background: var(--bg-alt);
                  border-radius: 10px; font-weight: 700; cursor: pointer; margin-top: 4px; }
```

- [ ] **Step 2: 結帳 modal JS**

```js
// 期數選擇 → startPlanCheckout（billing-checkout.js）
var AUTH_STATE = { loggedIn: false }; // /auth/me 移植段成功時設 true
function openCheckoutModal(plan) {
  if (!AUTH_STATE.loggedIn) { window.location.href = "/login.html"; return; }
  var offers = (PLAN_OFFERS || fallbackOffers())[plan] || [];
  var box = document.getElementById("checkout-options");
  var labels = { plus: "Plus", pro: "Pro", proplus: "Pro+" };
  document.getElementById("checkout-title").textContent = "開通 " + (labels[plan] || plan) + " 方案";
  box.innerHTML = offers.map(function (o) {
    var bonus = o.bonusDays > 0 ? "＋送 " + o.bonusDays + " 天" : "";
    return '<button class="checkout-opt" onclick="startPlanCheckout(\'' + plan + "', " + o.months + ')">' +
      "<span>" + o.months + " 個月" + (bonus ? "（" + bonus + "）" : "") + "</span>" +
      "<strong>NT$ " + Number(o.amount).toLocaleString() + "</strong></button>";
  }).join("");
  document.getElementById("checkout-backdrop").classList.add("is-open");
}
function closeCheckoutModal() {
  document.getElementById("checkout-backdrop").classList.remove("is-open");
}
```

（`/auth/me` 移植段內，登入成功 callback 加 `AUTH_STATE.loggedIn = true;`）

- [ ] **Step 3: 移植定價/FAQ JS**

- 舊檔 `1237-1430`：`PLAN_OFFERS` 載入、`switchBilling()`、`updatePlanPrice()`、`openPlanOfferPopup()`、plan-track 拖曳——整段搬入（id 沒變，理論上原樣可用）
- 舊檔 `1192-1203`：`/api/faq` 載入與 accordion 渲染（容器 `id="faq-list"`、item class `faq-item`）

- [ ] **Step 4: FAQ＋Final CTA markup**

```html
<!-- ── FAQ ───────────────────────────────── -->
<section class="alt" id="faq">
  <div class="wrap center">
    <h2 class="sec-title">常見問題</h2>
    <div id="faq-list" class="faq-list"></div>
  </div>
</section>

<!-- ── Final CTA ─────────────────────────── -->
<section class="final-cta">
  <div class="wrap center">
    <h2 class="sec-title">下一趟出國，試試 60 秒上架</h2>
    <p class="sec-sub">免費方案不用信用卡，拍一張照就知道值不值得。</p>
    <a href="/login.html" class="btn btn-primary btn-lg" onclick="trackCta('footer')">免費開店</a>
  </div>
</section>
```

```css
.faq-list { max-width: 720px; margin: 36px auto 0; text-align: left; }
.faq-item { background: #fff; border: 1px solid var(--line); border-radius: 12px; margin-bottom: 10px; overflow: hidden; }
.faq-item .faq-q { padding: 16px 20px; font-weight: 700; cursor: pointer; display: flex; justify-content: space-between; }
.faq-item .faq-a { padding: 0 20px 16px; color: var(--muted); font-size: 15px; }
.final-cta { background: linear-gradient(180deg, #fff 0%, var(--orange-soft) 100%); }
```

- [ ] **Step 5: 跑守護測試**

Run: `node --test test/landing.test.js`
Expected: PASS（兩個 test 全綠）

Run: `node --test test/`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): pricing wired to PAYUNi checkout, FAQ, final CTA"
```

---

### Task 7: RWD／可近性／手動驗收

**Files:**
- Modify: `public/index.html`（微調）

- [ ] **Step 1: 手動驗收清單**（`npx wrangler dev`，DevTools 模擬 375 / 390 / 430 / 1280px）

- 375px 無水平捲動、無重疊；hero 動畫順暢
- 定價 carousel 拖曳、月繳/半年/一年切換、Plus 卡月繳限定行為正常
- 方案說明彈窗（offer popup）開合正常
- 未登入點「立即開通」→ 導 /login.html；登入後 → 期數 modal → 跳轉 PAYUNi sandbox
- FAQ accordion 開合正常；`/api/faq`、`/api/plan-limits`、`/api/plan-offers` 三個 fetch 無錯
- nav 登入狀態切換正常
- DevTools Rendering → 模擬 `prefers-reduced-motion` → 演示固定顯示完成態
- Lighthouse mobile 跑一次，效能分數不低於改版前（改版前先記錄基準）

- [ ] **Step 2: 問題修正後跑全測試**

Run: `node --test test/`
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(landing): responsive and accessibility polish for SaaS redesign"
```

---

## Self-Review 紀錄

- Spec 九個區塊全數對應：nav/footer（Task 2）、hero＋動畫（Task 3）、痛點對比（Task 4）、四步驟＋功能＋證明（Task 5）、定價＋FAQ＋final CTA（Task 6）、RWD/reduced-motion（Task 3、7）。
- 不可 regress 清單（GA、auth 切換、carousel、accordion）均由 `test/landing.test.js` ＋ Task 7 手動清單把關。
- 「查看範例店舖」href 標註〔沿用舊檔〕為刻意指示（執行時自舊檔搬移當下值），非 placeholder。
- 型別/命名一致：`openCheckoutModal`/`closeCheckoutModal`/`startPlanCheckout`、`AUTH_STATE.loggedIn` 在 Task 5/6 間一致。
