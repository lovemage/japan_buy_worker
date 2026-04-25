# 拼貼風 Landing Page 補強 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 [`docs/plans/2026-04-25-collage-landing-finishup.md`](./2026-04-25-collage-landing-finishup.md) 的補強設計實作完成，讓 `public/index.html` 拼貼風從 ⚠️/❌ 全部變成 ✅。

**Architecture:** 單檔 inline HTML + CSS + JS 編輯。風險先行（先移除冗餘區塊、再做新增/補強）、每個區塊獨立 commit。每個 Task 用 grep-based acceptance test 先驗 fail、實作、再驗 pass，最後 commit。素材用 `/nano` 生 2 張 webp，OG image 用既有 `new_sale.webp`。

**Tech Stack:** HTML5 / CSS3 (inline)、Vanilla JS、`node:test`（grep-based acceptance）、`/nano` (Gemini Nano Banana 2) for image generation。

---

## File Structure

| 檔案 | 動作 | 大致行號／說明 |
|---|---|---|
| `public/index.html` | Modify | 1710 行 → 預估 ~1500 行（移除三段冗餘 + dead CSS）。改 SEO meta、Hero、AI Demo、Pricing、Final CTA、新增 Before-After |
| `public/assets/images/landing-collage/collage-camera.webp` | Create | 透明背景，Hero 左下 + Final CTA 左側 |
| `public/assets/images/landing-collage/collage-flower.webp` | Create | 透明背景，Hero 右上點綴 |
| `test/landing-collage.test.js` | Modify | 加新驗收 snippet（SEO 字樣、before-after section、移除舊區塊 hook） |

不改：
- `src/*` 全部後端
- `public/sitemap.xml`
- `public/assets/styles.css`
- `public/assets/favicon.js`

---

## Test Strategy

`package.json` 沒有 `test` script，但 `test/landing-collage.test.js` 已用 `node:test`。執行命令：

```bash
node --test test/landing-collage.test.js
```

每個 Task 都用同一條測試 + 修改 `requiredSnippets` 陣列來新增/移除驗收項目。確認 fail → 改 HTML → 確認 pass → commit。

---

## Task 1: Generate Two Collage Assets

**Files:**
- Create: `public/assets/images/landing-collage/collage-camera.webp`
- Create: `public/assets/images/landing-collage/collage-flower.webp`

- [ ] **Step 1: Ensure target directory exists**

```bash
mkdir -p public/assets/images/landing-collage
ls -la public/assets/images/landing-collage
```

Expected: directory exists, currently empty.

- [ ] **Step 2: Generate `collage-camera.webp` via `/nano`**

Invoke nano skill with this prompt:

```
Vintage camera collage cutout, scrapbook paper edges, orange and navy blue accents, transparent background, no text, isolated subject, scrapbook handmade craft style, 800x800
```

Output path: `public/assets/images/landing-collage/collage-camera.webp`
Aspect ratio: 1:1
Output format: webp (transparent)

- [ ] **Step 3: Verify camera image**

```bash
file public/assets/images/landing-collage/collage-camera.webp
ls -la public/assets/images/landing-collage/collage-camera.webp
```

Expected: file exists, type webp, size > 20KB and < 300KB. If size is way off (e.g. < 10KB or > 500KB) or file type is wrong, regenerate with adjusted prompt.

- [ ] **Step 4: Generate `collage-flower.webp` via `/nano`**

Invoke nano skill with this prompt:

```
Small flowers and leaves cutout, warm orange + cream yellow + deep green palette, paper collage texture, transparent background, no text, scrapbook handmade craft style, 600x600
```

Output path: `public/assets/images/landing-collage/collage-flower.webp`
Aspect ratio: 1:1
Output format: webp (transparent)

- [ ] **Step 5: Verify flower image**

```bash
file public/assets/images/landing-collage/collage-flower.webp
ls -la public/assets/images/landing-collage/collage-flower.webp
```

Expected: file exists, type webp, size > 15KB and < 250KB.

- [ ] **Step 6: Commit assets**

```bash
git add public/assets/images/landing-collage/collage-camera.webp public/assets/images/landing-collage/collage-flower.webp
git commit -m "feat(landing): add collage-camera and collage-flower assets

Generated via /nano (Gemini Nano Banana 2) for hero and final CTA
collage decoration."
```

---

## Task 2: Refresh SEO Meta

**Files:**
- Modify: `public/index.html:6-16`

- [ ] **Step 1: Add new SEO snippets to acceptance test**

Modify `test/landing-collage.test.js` — add to `requiredSnippets` array:

```javascript
"我拍｜開店平台 — 創作者一鍵開店",
"AI 生成商品頁，一鍵上架開店",
"new_sale.webp",
```

- [ ] **Step 2: Run test, verify fail**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to include 我拍｜開店平台 — 創作者一鍵開店"

- [ ] **Step 3: Replace meta block at `public/index.html:6-16`**

Replace lines 6–16 with:

```html
<title>我拍｜開店平台 — 創作者一鍵開店，從內容到成交全自動</title>
<meta name="description" content="拍照上傳 → AI 生成商品頁，一鍵上架開店，自動導購、回覆、成交。讓創作者專注分享，10,000+ 創作者正在使用。" />
<meta property="og:title" content="我拍｜開店平台 — 創作者一鍵開店，從內容到成交全自動" />
<meta property="og:description" content="拍照上傳，AI 生成商品頁，一鍵上架開店，自動導購、回覆、成交。讓創作者專注分享。" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://vovosnap.com/" />
<meta property="og:image" content="https://vovosnap.com/assets/images/new_sale.webp" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="我拍｜開店平台 — 創作者一鍵開店" />
<meta name="twitter:description" content="拍照上傳，AI 生成商品頁，一鍵上架開店，自動導購、回覆、成交。" />
<meta name="twitter:image" content="https://vovosnap.com/assets/images/new_sale.webp" />
```

注意：`twitter:card` 從 `summary` 升級成 `summary_large_image`（搭配 `new_sale.webp` 1200x800 拼貼圖效果更好）。

- [ ] **Step 4: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS — all required snippets found.

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/landing-collage.test.js
git commit -m "feat(landing): refresh SEO meta to creator commerce narrative

Switch title/description/OG/Twitter from cross-border代購 narrative to
我拍｜開店平台 creator commerce platform. Switch OG image to new_sale.webp
collage and upgrade twitter:card to summary_large_image."
```

---

## Task 3: Remove Edu Section

**Files:**
- Modify: `public/index.html:664-711` (remove section)
- Modify: `public/index.html` CSS（搜尋 `.edu-` class 整段移除）
- Modify: `test/landing-collage.test.js`

- [ ] **Step 1: Find all .edu-* CSS in index.html**

```bash
grep -n "\.edu-\|\.edu\b\| edu-\|edu-section\|class=\"edu\|id=\"edu\"" public/index.html
```

Expected output: lines with `.edu-card`, `.edu-bubble`, `.edu-grid`, `.edu-desc`, `.edu-card-icon`, `#edu` references.

- [ ] **Step 2: Add Edu absence check to acceptance test**

Modify `test/landing-collage.test.js` — add a new test block below the existing one:

```javascript
test("landing page no longer contains removed legacy sections", () => {
  const removed = [
    'class="edu-bubble"',
    'class="ai-hook',
    'class="country-marquee"',
    '<section class="ai-hook',
    '<section class="section country-section',
    '<section class="section edu-section',
  ];
  for (const snippet of removed) {
    assert.ok(!html.includes(snippet), `Expected landing page to NOT include ${snippet}`);
  }
});
```

- [ ] **Step 3: Run test, verify fail**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to NOT include `<section class=\"section edu-section`".

- [ ] **Step 4: Remove `<section class="section edu-section">…</section>` block**

Edit `public/index.html`: delete lines 664–711 (the `<!-- Section 2: 痛點教育 -->` comment and the entire `<section class="section edu-section fade-in" id="edu" …>` … `</section>` block).

確切要刪的範圍是從 `<!-- Section 2: 痛點教育 -->` 到 `</section>` 含後一行空行。

- [ ] **Step 5: Remove `.edu-*` CSS rules**

Locate `.edu-section`、`.edu-grid`、`.edu-card`、`.edu-card-icon`、`.edu-bubble`、`.edu-desc`、`#edu` 在 `<style>` 內的全部規則並刪除。每條規則完整刪除（包含 `:before` / `:after` / hover / RWD 變體）。

驗證搜尋：

```bash
grep -nE "\.edu-|#edu\b|\.edu\b" public/index.html
```

Expected output: empty.

- [ ] **Step 6: Verify no dangling references**

```bash
grep -nE 'href="#edu"|getElementById\("edu"\)|querySelector.*edu' public/index.html
```

Expected: empty (no nav anchor or JS pointing to removed `#edu`).

- [ ] **Step 7: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS — both tests pass.

- [ ] **Step 8: Commit**

```bash
git add public/index.html test/landing-collage.test.js
git commit -m "refactor(landing): remove edu section (redundant with 4-step flow)

The Edu section overlapped with the 4-step flow content. Removing it
to tighten the narrative around 我拍｜開店平台 creator commerce."
```

---

## Task 4: Remove AI Hook Section

**Files:**
- Modify: `public/index.html:797-902` (remove section)
- Modify: `public/index.html` CSS（搜尋 `.ai-hook` 整段移除）

- [ ] **Step 1: Confirm Test Already Covers AI Hook**

The Task 3 test already includes `'class="ai-hook'` and `'<section class="ai-hook'`. No test changes needed.

- [ ] **Step 2: Run test, verify still fails**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to NOT include `<section class=\"ai-hook`".

- [ ] **Step 3: Remove AI Hook section block**

Edit `public/index.html`: delete lines 797–902 (the `<!-- AI handles everything hook -->` comment and the entire `<section class="ai-hook fade-in">` … `</section>` block, plus the surrounding empty lines).

也順手刪除 L792-L795 的 `<!-- Time-saving banner --> <section class="section fade-in" style="padding:0;"> </section>` 空殼 section（如果它沒有內容）。先用：

```bash
sed -n '792,795p' public/index.html
```

確認該 section 是否真的空，若是空的則一併刪除；若有內容則保留。

- [ ] **Step 4: Remove `.ai-hook-*` CSS rules**

Locate `.ai-hook`、`.ai-hook-inner`、`.ai-hook-grid`、`.ai-hook-card`、`.ai-hook-card-icon`、`.ai-hook-sub`、`.ai-hook-desc`、`.ai-hook-closing` 與相關 hover/RWD 規則並刪除。

驗證：

```bash
grep -nE "\.ai-hook" public/index.html
```

Expected: empty.

- [ ] **Step 5: Verify no dangling references**

```bash
grep -nE 'href="#ai-hook"|class=.*ai-hook|ai-hook' public/index.html
```

Expected: empty.

- [ ] **Step 6: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "refactor(landing): remove ai-hook section (redundant with why-band)

The AI Hook section duplicated the value props already presented in the
Why Choose torn-band. Removing it to keep the narrative single-pass."
```

---

## Task 5: Remove Country Marquee Section

**Files:**
- Modify: `public/index.html:955-1066` (remove section)
- Modify: `public/index.html` CSS / JS（搜尋 `.country-` 整段移除）

- [ ] **Step 1: Confirm Test Already Covers Country**

Task 3 test 已含 `'class="country-marquee"'` 與 `'<section class="section country-section'`。

- [ ] **Step 2: Run test, verify still fails**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to NOT include `<section class=\"section country-section`".

- [ ] **Step 3: Remove Country marquee section block**

Edit `public/index.html`: delete lines 955–1066 (the `<!-- Supported countries marquee -->` comment and the entire `<section class="section country-section fade-in">` … `</section>` block).

- [ ] **Step 4: Remove `.country-*` CSS rules**

Locate `.country-section`、`.country-marquee`、`.country-track`、`.country-item`、`.country-flag`、`.country-name`、`.country-cur` 與相關 `@keyframes` marquee animation。整段刪除。

驗證：

```bash
grep -nE "\.country-|@keyframes.*marquee|country-track" public/index.html
```

Expected: empty.

- [ ] **Step 5: Remove related JS (if any)**

```bash
grep -nE 'country|marquee' public/index.html
```

如有 JS hooks (e.g. duplicate marquee items, IntersectionObserver for marquee)，整段移除。

- [ ] **Step 6: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "refactor(landing): remove country marquee section

The country marquee belonged to the cross-border代購 B2C narrative
and no longer fits the 我拍｜開店平台 creator commerce positioning."
```

---

## Task 6: Remove Old Image Before-After Section And Dead Flow CSS

**Files:**
- Modify: `public/index.html:1068-1084` (remove old ba-section)
- Modify: `public/index.html` CSS（搜尋 `.flow-`、`.ba-` 整段移除）
- Modify: `public/index.html` JS（搜尋 `openBaPopup` 移除）

- [ ] **Step 1: Add ba-section absence to test**

Modify `test/landing-collage.test.js` — add to the second test's `removed` array:

```javascript
'class="ba-section"',
'<section class="section ba-section',
'class="ba-card"',
'openBaPopup',
'.flow-step',
'.flow-arrow',
```

- [ ] **Step 2: Run test, verify fail**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to NOT include `<section class=\"section ba-section`".

- [ ] **Step 3: Remove old ba-section block**

Edit `public/index.html`: delete lines 1068–1084 (the `<!-- AI Image Before/After -->` comment and the entire `<section class="section ba-section fade-in">` … `</section>` block).

- [ ] **Step 4: Remove BA popup overlay if present**

```bash
grep -nE 'BA Popup|ba-popup|openBaPopup|closeBaPopup' public/index.html
```

如果有 `<!-- BA Popup Overlay -->` modal markup（例如 L1357 附近）與相關 JS function `openBaPopup` / `closeBaPopup`，整段刪除。CSS `.ba-popup-*` 也一併刪除。

- [ ] **Step 5: Remove `.flow-*` dead CSS rules**

Edit `public/index.html` 的 `<style>` 內，刪除 `.flow`、`.flow-step`、`.flow-icon`、`.flow-arrow` 與行動版 RWD `.flow` 相關規則（spec 標示在 L227-246, L503-507）。

驗證：

```bash
grep -nE "\.flow-|\.flow\b" public/index.html
```

Expected: empty.

- [ ] **Step 6: Remove unused images**

```bash
git rm public/assets/images/before.webp public/assets/images/after.webp 2>&1 | head -5
```

如果這兩張圖檔還在 git tracked 但已沒被引用：移除。如果報「pathspec did not match」，跳過此步。

- [ ] **Step 7: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public/index.html test/landing-collage.test.js
git rm --cached public/assets/images/before.webp public/assets/images/after.webp 2>/dev/null || true
git commit -m "refactor(landing): remove old image-ba section and flow dead CSS

Drop the AI 圖片優化 before/after lightbox—the value prop will be carried
by the new lifestyle Before-After section in Task 10. Also remove dead
.flow-* CSS left over from the previous flow design."
```

---

## Task 7: Hero 拼貼層補強

**Files:**
- Modify: `public/index.html` `<head>` (Caveat font link)
- Modify: `public/index.html:590-662` (hero section)
- Modify: `public/index.html` `<style>` (`.hero`, `.hero-note`, `.hero-note-card`, `.tape`, `.dashboard-mockup`, `.hero::before`)

- [ ] **Step 1: Add Hero acceptance snippets to test**

Modify `test/landing-collage.test.js` — add to `requiredSnippets`:

```javascript
'collage-camera.webp',
'collage-flower.webp',
'family=Caveat',
'Create<br>Build<br>Sell',
'class="hero-decor hero-decor-camera"',
'class="hero-decor hero-decor-flower"',
```

- [ ] **Step 2: Run test, verify fail**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to include collage-camera.webp".

- [ ] **Step 3: Add Caveat Google Font link in `<head>`**

Find the existing `<link rel="preconnect" href="https://fonts.googleapis.com">` block (around L20-30) and add a new `<link>` after the existing Zen Maru Gothic link:

```html
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap" rel="stylesheet">
```

- [ ] **Step 4: Insert `hero-decor` images into hero section**

Find the line just below `<section class="hero collage-stage">` and the `<span class="tape tape-two"></span>` line. Insert two new `<img>` elements right after `tape-two`:

Edit target — replace:

```html
<span class="tape tape-one"></span>
<span class="tape tape-two"></span>
<div class="hero-collage">
```

with:

```html
<span class="tape tape-one"></span>
<span class="tape tape-two"></span>
<img class="hero-decor hero-decor-camera" src="/assets/images/landing-collage/collage-camera.webp" alt="" loading="eager" aria-hidden="true">
<img class="hero-decor hero-decor-flower" src="/assets/images/landing-collage/collage-flower.webp" alt="" loading="eager" aria-hidden="true">
<div class="hero-collage">
```

- [ ] **Step 5: Merge `.hero-note` + `.hero-note-card` into one element**

Find:

```html
<div class="hero-visual">
  <div class="hero-note scribble-note">Create<br>Build<br>Sell</div>
  <div class="hero-note-card"></div>
  <div class="dashboard-mockup paper-card">
```

Replace with:

```html
<div class="hero-visual">
  <div class="hero-note-card">Create<br>Build<br>Sell</div>
  <div class="dashboard-mockup paper-card">
```

(刪除空的 `.hero-note-card` 並把 Create/Build/Sell 文字從原 `.hero-note.scribble-note` 移到 `.hero-note-card` 上。)

- [ ] **Step 6: Add `dashboard-avatar` inside dashboard-mockup**

Find the line `<div class="dashboard-mockup paper-card">` and insert immediately after it (before any existing inner content):

```html
<img class="dashboard-avatar" src="/assets/images/creator-avatar-01.webp" alt="" aria-hidden="true">
```

不要動 `<div class="dashboard-shell">…</div>` 內部任何現有內容（dashboard-logo、dashboard-side、dashboard-main、dashboard-metrics 等都保留原樣）。

- [ ] **Step 7: Update Hero CSS in `<style>`**

Find existing `.hero::before`、`.hero-note`、`.hero-note-card`、`.tape` 規則，替換成：

```css
.hero {
  position: relative;
  overflow: visible;
}
.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, transparent 0%, transparent 30%, var(--paper-deep) 30%, var(--paper-deep) 100%),
    radial-gradient(ellipse at 30% 70%, rgba(8,38,74,0.08) 0%, transparent 50%);
  clip-path: polygon(0 0, 100% 0, 100% 92%, 92% 100%, 8% 96%, 0 100%);
  z-index: 0;
}
.hero-collage { position: relative; z-index: 2; }
.hero-decor {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.12));
}
.hero-decor-camera {
  width: 160px;
  bottom: 24px;
  left: -28px;
  transform: rotate(-6deg);
}
.hero-decor-flower {
  width: 120px;
  top: 16px;
  right: 8%;
  transform: rotate(8deg);
}
.hero-note-card {
  position: absolute;
  top: -18px;
  right: 12%;
  z-index: 3;
  background: var(--orange);
  color: #fff;
  padding: 18px 22px;
  border-radius: 4px;
  transform: rotate(6deg);
  box-shadow: 0 4px 14px rgba(0,0,0,0.18);
  font-family: 'Caveat', 'Patrick Hand', cursive;
  font-weight: 700;
  font-size: 26px;
  line-height: 1.1;
  text-align: center;
  letter-spacing: 0.02em;
}
.hero-note-card::before {
  content: "";
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%) rotate(-4deg);
  width: 56px;
  height: 18px;
  background: linear-gradient(180deg, rgba(231,173,50,0.95), rgba(231,173,50,0.75));
  box-shadow: 0 2px 4px rgba(0,0,0,0.08);
}
.tape {
  position: absolute;
  width: 96px;
  height: 26px;
  background: linear-gradient(180deg, rgba(231,173,50,0.85), rgba(231,173,50,0.6));
  filter: contrast(1.1) brightness(0.98);
  box-shadow: 0 2px 4px rgba(0,0,0,0.08);
  z-index: 4;
  pointer-events: none;
}
.tape::before, .tape::after {
  content: "";
  position: absolute;
  width: 100%;
  height: 4px;
  background: inherit;
  filter: brightness(0.92);
}
.tape::before { top: -2px; clip-path: polygon(0 0, 6% 100%, 12% 0, 18% 100%, 24% 0, 30% 100%, 36% 0, 42% 100%, 48% 0, 54% 100%, 60% 0, 66% 100%, 72% 0, 78% 100%, 84% 0, 90% 100%, 96% 0, 100% 100%); }
.tape::after { bottom: -2px; clip-path: polygon(0 100%, 6% 0, 12% 100%, 18% 0, 24% 100%, 30% 0, 36% 100%, 42% 0, 48% 100%, 54% 0, 60% 100%, 66% 0, 72% 100%, 78% 0, 84% 100%, 90% 0, 96% 100%, 100% 0); }
.tape-one { top: 18px; left: 12%; transform: rotate(-8deg); }
.tape-two { top: 28px; right: 6%; transform: rotate(6deg); width: 110px; }
.dashboard-avatar {
  position: absolute;
  top: -16px;
  right: -16px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
  z-index: 5;
}
```

刪除舊的 `.hero-note.scribble-note` 規則（如果存在），改用上面的 `.hero-note-card`。

- [ ] **Step 8: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS — all required snippets including new hero hooks.

- [ ] **Step 9: Manual visual check**

開瀏覽器打開首頁（或 VSCode Live Server），確認：
- Hero 第一屏看到深藍色撕紙底（佔約 40-50% 高度）
- 左下角有相機素材
- 右上角有花葉素材
- 橘色「Create / Build / Sell」便條，字體手寫感
- 兩條膠帶有鋸齒邊
- Dashboard 右上角有圓形頭像

如有版面問題（素材擠壓文字、便條太大），微調 CSS 數值。

- [ ] **Step 10: Commit**

```bash
git add public/index.html test/landing-collage.test.js
git commit -m "feat(landing): polish hero collage layer

Wire up collage-camera and collage-flower assets, upgrade tape with
torn edges, replace scribble-note Comic Sans with Caveat handwritten
font, enlarge hero torn-paper background, add creator avatar to
dashboard mockup."
```

---

## Task 8: AI Demo 紙框化

**Files:**
- Modify: `public/index.html:905-953` (feat-section)
- Modify: `public/index.html` CSS (`.feat-video-area`, new `.feat-paper-frame`, `.feat-note`)
- Modify: `public/index.html` JS (移除 `feat-prev` / `feat-next` / `feat-dot` 相關 carousel 邏輯)

- [ ] **Step 1: Add Demo acceptance snippets**

Modify `test/landing-collage.test.js` — add to `requiredSnippets`:

```javascript
'class="feat-paper-frame"',
'class="feat-notes"',
'AI 自動辨識商品',
'自動換算匯率與售價',
'一鍵分享給 LINE 群',
```

And add to `removed` array:

```javascript
'class="feat-text-track"',
'id="feat-text-track"',
'class="feat-text-slide"',
'feat-prev',
'feat-next',
```

- [ ] **Step 2: Run test, verify fail**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to include `class=\"feat-paper-frame\"`".

- [ ] **Step 3: Replace `<section class="feat-section fade-in" id="features">` block**

Replace lines 905–953 with:

```html
<!-- Feature: AI demo with paper frame -->
<section class="feat-section fade-in" id="features">
  <div class="feat-header">
    <h2 class="section-title">AI <em>幫你</em> 一鍵成店</h2>
    <p class="section-sub">拍張照，AI 自動辨識商品、生成文案、換算匯率，幾秒鐘內生成完整商品頁。</p>
  </div>
  <div class="feat-wrap">
    <div class="feat-paper-frame">
      <span class="tape tape-tl"></span>
      <span class="tape tape-br"></span>
      <video class="feat-video" src="/assets/videos/ai-demo.mp4" autoplay muted loop playsinline aria-label="AI 自動上架示範影片"></video>
    </div>
    <div class="feat-notes">
      <div class="feat-note feat-note-1"><span class="feat-step">01</span>AI 自動辨識商品</div>
      <div class="feat-note feat-note-2"><span class="feat-step">02</span>自動生成文案與規格</div>
      <div class="feat-note feat-note-3"><span class="feat-step">03</span>自動換算匯率與售價</div>
      <div class="feat-note feat-note-4"><span class="feat-step">04</span>一鍵分享給 LINE 群</div>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Replace feat CSS**

Find existing `.feat-section`、`.feat-wrap`、`.feat-text-area`、`.feat-text-track`、`.feat-text-slide`、`.feat-video-area`、`.feat-label`、`.feat-prev`、`.feat-next`、`.feat-dot` 等規則，替換成：

```css
.feat-section { padding: 80px 24px; background: var(--paper); }
.feat-header { max-width: 720px; margin: 0 auto 48px; text-align: center; }
.feat-wrap {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 48px;
  align-items: center;
}
.feat-paper-frame {
  position: relative;
  background: var(--paper);
  border: 14px solid #2a2620;
  border-radius: 6px;
  padding: 0;
  overflow: hidden;
  box-shadow:
    0 12px 28px rgba(0,0,0,0.18),
    inset 0 0 0 1px rgba(0,0,0,0.04);
  transform: rotate(-1.5deg);
  clip-path: polygon(0 2%, 100% 0, 100% 98%, 0 100%);
}
.feat-paper-frame .tape-tl { top: -12px; left: -12px; transform: rotate(-12deg); }
.feat-paper-frame .tape-br { bottom: -12px; right: -12px; transform: rotate(12deg); }
.feat-video { width: 100%; height: auto; display: block; }
.feat-notes { display: flex; flex-direction: column; gap: 18px; }
.feat-note {
  position: relative;
  background: #fff;
  padding: 16px 20px 16px 56px;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  box-shadow: 0 4px 10px rgba(0,0,0,0.08);
  border: 1px solid var(--line);
}
.feat-note .feat-step {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--orange);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Caveat', cursive;
  font-size: 18px;
  font-weight: 700;
}
.feat-note-1 { transform: rotate(-2deg); }
.feat-note-2 { transform: rotate(1.5deg); }
.feat-note-3 { transform: rotate(-1deg); }
.feat-note-4 { transform: rotate(2deg); }
@media (max-width: 760px) {
  .feat-wrap { grid-template-columns: 1fr; }
  .feat-paper-frame { transform: rotate(-1deg); }
}
```

- [ ] **Step 5: Remove carousel JS**

Find any JS related to `feat-text-track`、`feat-prev`、`feat-next`、`feat-dot`（ likely in the bottom `<script>` section）:

```bash
grep -nE "feat-text-track|feat-prev|feat-next|feat-dot|featTrack|featSlide" public/index.html
```

Remove those JS blocks completely. They're no longer needed since the new design uses static notes.

- [ ] **Step 6: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS.

- [ ] **Step 7: Manual visual check**

確認影片區是米白紙質框（不是黑色圓角手機殼）、邊角有撕邊 clip-path、4 張紙條垂直排列、每張紙條有橘色 step 圓圈跟微旋轉。

- [ ] **Step 8: Commit**

```bash
git add public/index.html test/landing-collage.test.js
git commit -m "feat(landing): replace ai-demo carousel with paper frame + sticky notes

Replace the rotating black phone-shell carousel with a paper-textured
frame and four static handwritten sticky notes. Removes feat-* carousel
JS and matches the collage acceptance criteria."
```

---

## Task 9: Before-After 區塊新增

**Files:**
- Modify: `public/index.html` (insert new `<section>` between `why-band` and `feat-section`, around L791 area)
- Modify: `public/index.html` `<style>` (new `.before-after` rules)

- [ ] **Step 1: Add Before-After acceptance snippets**

Modify `test/landing-collage.test.js` — add to `requiredSnippets`:

```javascript
'<section class="before-after" id="before-after"',
'/assets/images/new_sale.webp',
'節省時間',
'自動成交',
'隨時隨地',
```

- [ ] **Step 2: Run test, verify fail**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to include `<section class=\"before-after\"`".

- [ ] **Step 3: Insert Before-After section**

Find the closing `</section>` of `.why-band` (was around L790) and insert a new section right after it:

```html
<!-- Before / After lifestyle -->
<section class="before-after" id="before-after">
  <div class="before-after-inner">
    <h2 class="section-title">從<em>焦慮</em>到<em>自動成交</em></h2>
    <p class="section-sub">過去花一整天上架商品、回覆訊息，現在用 我拍｜開店平台 1 分鐘搞定。</p>
    <div class="before-after-stage">
      <figure class="before-after-main paper-card">
        <img src="/assets/images/new_sale.webp" alt="開店前後對比：從焦慮上班族到輕鬆經營" loading="lazy">
        <span class="tape tape-tl"></span>
        <span class="tape tape-br"></span>
      </figure>
      <div class="before-after-notes">
        <div class="scribble-note ba-note ba-note-1"><strong>節省時間</strong><br>1 分鐘上架</div>
        <div class="scribble-note ba-note ba-note-2"><strong>自動成交</strong><br>AI 全程處理</div>
        <div class="scribble-note ba-note ba-note-3"><strong>隨時隨地</strong><br>手機就能管</div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Add Before-After CSS**

Append to `<style>`:

```css
.before-after {
  padding: 96px 24px;
  background: var(--paper);
  position: relative;
  overflow: hidden;
}
.before-after-inner { max-width: 1200px; margin: 0 auto; }
.before-after .section-title,
.before-after .section-sub { text-align: center; }
.before-after-stage {
  margin-top: 56px;
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(220px, 1fr);
  gap: 48px;
  align-items: center;
}
.before-after-main {
  position: relative;
  background: #fff;
  padding: 14px;
  border-radius: 4px;
  transform: rotate(-1.5deg);
  box-shadow: 0 14px 32px rgba(0,0,0,0.18);
}
.before-after-main img { width: 100%; height: auto; display: block; }
.before-after-main .tape-tl { top: -14px; left: 12%; transform: rotate(-10deg); }
.before-after-main .tape-br { bottom: -14px; right: 14%; transform: rotate(8deg); }
.before-after-notes { display: flex; flex-direction: column; gap: 24px; }
.scribble-note.ba-note {
  background: var(--mustard);
  color: var(--ink);
  padding: 18px 22px;
  border-radius: 4px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.12);
  font-family: 'Caveat', 'Patrick Hand', cursive;
  font-size: 22px;
  line-height: 1.3;
  text-align: center;
}
.scribble-note.ba-note strong {
  display: block;
  font-size: 28px;
  color: var(--orange);
  margin-bottom: 4px;
}
.ba-note-1 { transform: rotate(-3deg); }
.ba-note-2 { transform: rotate(2deg); background: #fff; }
.ba-note-3 { transform: rotate(-2deg); }
@media (max-width: 760px) {
  .before-after-stage { grid-template-columns: 1fr; gap: 32px; }
  .before-after-main { transform: rotate(-1deg); }
  .before-after-notes { flex-direction: row; flex-wrap: wrap; justify-content: center; }
  .scribble-note.ba-note { flex: 1 1 30%; min-width: 100px; font-size: 16px; padding: 12px 14px; }
  .scribble-note.ba-note strong { font-size: 20px; }
}
```

- [ ] **Step 5: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS.

- [ ] **Step 6: Manual visual check**

確認 Before-After 區塊插在 Why Choose 與 AI Demo 之間，`new_sale.webp` 整張顯示且有 tape + 微旋轉，旁邊 3 張紙條顏色是芥末黃與白色交錯。

- [ ] **Step 7: Commit**

```bash
git add public/index.html test/landing-collage.test.js
git commit -m "feat(landing): add Before-After lifestyle section

New section uses new_sale.webp collage as the hero visual paired with
three handwritten sticky notes (節省時間 / 自動成交 / 隨時隨地).
Replaces the old image-quality ba-section with a stronger lifestyle
narrative."
```

---

## Task 10: Pricing 補強

**Files:**
- Modify: `public/index.html:1086-1224` 範圍內 CSS（`.plan::after`、`.compare-table`）

- [ ] **Step 1: Add Pricing acceptance snippets**

Modify `test/landing-collage.test.js` — add to `requiredSnippets`:

```javascript
'.plan:nth-child(1)::after',
'.plan:nth-child(2)::after',
'.compare-table',
```

實際上 `.compare-table` 應該已經存在。先確認：

```bash
grep -n "compare-table" public/index.html
```

If exists, skip the third snippet. Add the two `nth-child` ones to test.

- [ ] **Step 2: Run test, verify fail**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to include `.plan:nth-child(1)::after`".

- [ ] **Step 3: Replace generic `.plan::after` with per-child variants**

Find existing `.plan::after` rule. Replace with:

```css
.plan::after {
  content: "";
  position: absolute;
  width: 80px;
  height: 22px;
  background: linear-gradient(180deg, rgba(231,173,50,0.85), rgba(231,173,50,0.6));
  filter: contrast(1.1) brightness(0.98);
  box-shadow: 0 2px 4px rgba(0,0,0,0.08);
  pointer-events: none;
}
.plan:nth-child(1)::after { top: -10px; left: 18%; transform: rotate(-6deg); }
.plan:nth-child(2)::after { top: -14px; right: 16%; transform: rotate(8deg); width: 96px; }
.plan:nth-child(3)::after { top: -8px; left: 42%; transform: rotate(-3deg); width: 72px; }
.plan:nth-child(4)::after { top: -12px; right: 24%; transform: rotate(5deg); width: 88px; }
```

- [ ] **Step 4: Upgrade `.compare-table` to paper feel**

Find `.compare-table` rule and merge in:

```css
.compare-table {
  background: var(--paper);
  border: 1px dashed var(--line);
  border-radius: 4px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.08);
  padding: 8px;
}
.compare-table th { background: var(--paper-deep); }
.compare-table tr:hover td { background: rgba(242,107,29,0.04); }
```

如果 `.compare-table th` / `tr:hover td` 已有舊規則，覆蓋它們，不要疊加。

- [ ] **Step 5: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS.

- [ ] **Step 6: Manual visual check**

確認 Pricing 三張 plan 紙卡上的黃膠帶位置/角度有差異（不是每張都在同位置）；compare-table 不再是純白底，背景偏米白、虛線 border、hover 時 row 變淡橘。

- [ ] **Step 7: Commit**

```bash
git add public/index.html test/landing-collage.test.js
git commit -m "feat(landing): scatter pricing tape positions and add paper feel to compare-table

Use nth-child variants for the yellow tape decoration on each plan card
so each tape sits at a different angle and offset, breaking the uniform
SaaS-grid look. Compare-table now uses paper-deep header, dashed border,
soft paper shadow."
```

---

## Task 11: Final CTA 加大相機素材

**Files:**
- Modify: `public/index.html:1326-1336` (final-cta section)
- Modify: `public/index.html` `<style>` (`.final-cta`, `.final-cta::before`, `.final-cta::after`, `.final-note`, new `.final-cta-camera`)

- [ ] **Step 1: Add Final CTA acceptance snippet**

Modify `test/landing-collage.test.js` — add to `requiredSnippets`:

```javascript
'class="final-cta-camera"',
```

- [ ] **Step 2: Run test, verify fail**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to include `class=\"final-cta-camera\"`".

- [ ] **Step 3: Update Final CTA HTML**

Find `<section class="final-cta fade-in">` block and add the camera image inside:

```html
<section class="final-cta fade-in">
  <img class="final-cta-camera" src="/assets/images/landing-collage/collage-camera.webp" alt="" loading="lazy" aria-hidden="true">
  <div class="final-cta-inner">
    <h2 class="final-cta-title">開始你的第一筆<em>自動成交</em></h2>
    <p class="final-cta-sub">我拍｜開店平台，讓創作更有價值</p>
    <a href="/login.html" class="btn-hero btn-hero-outline" onclick="typeof gtag==='function'&&gtag('event','cta_click',{section:'footer'})">免費開店，立即體驗</a>
    <div class="final-note scribble-note">Start your business today!</div>
  </div>
</section>
```

注意：保留既有 `cta_click {section:'footer'}` GA tracking。如果原本的 `<h2>` / `<p>` / `<a>` 文案不同，以原檔案為準（不改文案，只插入 `<img>` 與 `<div class="final-note">`）。

- [ ] **Step 4: Update Final CTA CSS**

Find existing `.final-cta`、`.final-cta::before`、`.final-cta::after`、`.final-note` rules and replace:

```css
.final-cta {
  position: relative;
  padding: 96px 24px;
  background: var(--orange);
  color: #fff;
  text-align: center;
  overflow: hidden;
  clip-path: polygon(0 6%, 8% 0, 92% 4%, 100% 0, 100% 96%, 92% 100%, 8% 96%, 0 100%);
}
.final-cta::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 80% 50%, rgba(8,38,74,0.18) 0%, transparent 60%);
  pointer-events: none;
  z-index: 0;
}
.final-cta-camera {
  position: absolute;
  left: 4%;
  top: 50%;
  transform: translateY(-50%) rotate(-12deg);
  width: 220px;
  z-index: 1;
  filter: drop-shadow(0 6px 14px rgba(0,0,0,0.25));
  pointer-events: none;
}
.final-cta-inner { position: relative; z-index: 2; max-width: 720px; margin: 0 auto; }
.final-cta::after {
  content: "";
  position: absolute;
  bottom: 8%;
  right: 10%;
  width: 160px;
  height: 100px;
  background: rgba(255,255,255,0.06);
  transform: rotate(8deg);
  pointer-events: none;
  z-index: 0;
}
.final-note {
  position: absolute;
  bottom: 12%;
  right: 6%;
  background: #fff;
  color: var(--orange);
  padding: 14px 20px;
  border-radius: 4px;
  font-family: 'Caveat', 'Patrick Hand', cursive;
  font-size: 22px;
  font-weight: 700;
  transform: rotate(-6deg);
  box-shadow: 0 4px 14px rgba(0,0,0,0.18);
  z-index: 3;
}
```

- [ ] **Step 5: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS.

- [ ] **Step 6: Manual visual check**

Final CTA 左側出現相機素材（旋轉 -12 度），右下角白色便條手寫風 "Start your business today!"，不再只有空的多邊形。

- [ ] **Step 7: Commit**

```bash
git add public/index.html test/landing-collage.test.js
git commit -m "feat(landing): add real camera asset to final CTA

The final CTA's left-side decoration was previously an empty navy
polygon. Replacing with the collage-camera asset rotated -12° and
softening the existing decorative ::after rectangle."
```

---

## Task 12: 行動版便條 scale 化

**Files:**
- Modify: `public/index.html` `<style>` 內所有 `@media (max-width: 600px)` / `@media (max-width: 760px)` 區塊

- [ ] **Step 1: Find all display:none on collage notes**

```bash
grep -nE 'display:\s*none' public/index.html | grep -iE 'note|hero|dashboard|feat|final'
```

Expected hits include lines around L498, L502, L511, L532 in the original numbering（行號可能因前面 task 變動）。實際以 grep 結果為準。

- [ ] **Step 2: Add mobile acceptance snippet**

Modify `test/landing-collage.test.js` — add to `requiredSnippets`:

```javascript
'.hero-note-card { transform: scale(0.7)',
'.dashboard-side { transform: scale(0.85)',
'.final-note { transform: scale(0.7)',
```

- [ ] **Step 3: Run test, verify fail**

```bash
node --test test/landing-collage.test.js
```

Expected: FAIL — "Expected landing page to include `.hero-note-card { transform: scale(0.7)`".

- [ ] **Step 4: Replace mobile RWD rules**

Find the `@media (max-width: 600px)` block (likely around former L495-L535). Replace any `display: none` for collage notes with `transform: scale()`:

```css
@media (max-width: 600px) {
  /* Hero collage notes — keep paper feel on mobile */
  .hero-note-card {
    transform: scale(0.7) rotate(-6deg);
    top: -8px;
    right: 4%;
    font-size: 20px;
    padding: 12px 16px;
  }
  .hero-decor-camera { width: 100px; bottom: 12px; left: -16px; }
  .hero-decor-flower { width: 80px; top: 8px; right: 4%; }
  .dashboard-side {
    transform: scale(0.85);
    overflow-x: auto;
    white-space: nowrap;
    display: flex;
    gap: 8px;
  }
  .dashboard-side > * { flex: 0 0 auto; }
  /* Final CTA notes */
  .final-note {
    transform: scale(0.7) rotate(-4deg);
    bottom: 6%;
    right: 4%;
    font-size: 18px;
  }
  .final-cta::after { transform: scale(0.8) rotate(8deg); right: 4%; }
  .final-cta-camera {
    width: 120px;
    top: 12%;
    left: 50%;
    transform: translate(-50%, 0) rotate(-8deg);
  }
  /* AI Demo paper frame keeps notes vertical */
  .feat-paper-frame { transform: rotate(-1deg); }
  .feat-note { font-size: 14px; padding: 12px 16px 12px 48px; }
}
```

刪除任何剩餘的 `display: none` 在 `.hero-note-card`、`.dashboard-side`、`.feat-wrap::after`、`.final-cta::after`、`.final-note` 上。

注意：原本 `.feat-wrap::after` 在 spec 是「AI handles it」便條，新設計中該便條已合併進 `.feat-notes`，所以不需要保留 `.feat-wrap::after`，可以一併移除舊規則。

- [ ] **Step 5: Run test, verify pass**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS.

- [ ] **Step 6: Manual mobile breakpoint test**

開瀏覽器 DevTools，逐一切換到 375px / 390px / 430px，確認：
- Hero「Create / Build / Sell」便條看得到（不是消失）
- Hero 相機 + 葉子素材還在（縮小但可見）
- Final CTA「Start your business today!」便條看得到
- 沒有水平 scrollbar（除了 dashboard-side 內部的 overflow-x: auto）

如有便條重疊文字或擠出畫面，微調 `top` / `right` / `scale` 值。

- [ ] **Step 7: Commit**

```bash
git add public/index.html test/landing-collage.test.js
git commit -m "feat(landing): preserve collage notes on mobile via scale

Replace display:none on hero-note-card, dashboard-side, final-note,
and final-cta::after with scale() variants so 375/390/430 viewports
keep the paper-collage feel instead of degrading to a plain stacked
layout."
```

---

## Task 13: Final Acceptance Sweep

**Files:**
- Modify: `test/landing-collage.test.js` (sanity-check existing snippets still cover everything)
- Run: full test suite + manual visual checklist

- [ ] **Step 1: Run final test**

```bash
node --test test/landing-collage.test.js
```

Expected: PASS, both `test()` blocks green.

- [ ] **Step 2: Verify no broken nav anchors**

```bash
grep -oE 'href="#[a-z0-9_-]+"' public/index.html | sort -u
```

For each anchor, verify the `id` exists:

```bash
for anchor in $(grep -oE 'href="#[a-z0-9_-]+"' public/index.html | sed 's/href="#\(.*\)"/\1/' | sort -u); do
  if ! grep -q "id=\"$anchor\"" public/index.html; then
    echo "BROKEN ANCHOR: #$anchor"
  fi
done
```

Expected: empty (no broken anchors after removing edu / ai-hook / country sections).

- [ ] **Step 3: Verify GA tracking still wired**

```bash
grep -nE "cta_click.*section:'(nav|hero|footer)'" public/index.html
```

Expected: 3 matches (nav, hero, footer).

- [ ] **Step 4: Verify Pricing carousel JS intact**

```bash
grep -nE "plan-track|plan-dot|switchBilling|billing-toggle" public/index.html
```

Expected: existing hooks all still present (none should have been deleted).

- [ ] **Step 5: Verify FAQ accordion intact**

```bash
grep -nE "faq-item|toggleFaq|faq-question" public/index.html
```

Expected: existing hooks present.

- [ ] **Step 6: Verify auth status JS intact**

```bash
grep -nE 'fetchAuth|authStatus|/api/auth' public/index.html
```

Expected: existing auth status check still present.

- [ ] **Step 7: Commit (if any test/manual fixes needed)**

If steps 2–6 surface any issue, fix it inline and commit:

```bash
git add public/index.html
git commit -m "fix(landing): patch broken anchors / preserved hooks after collage cleanup"
```

If everything passes, no commit needed.

---

## Task 14: Manual Visual QA Checklist

**Files:** None (manual browser testing)

This task does not produce code; it verifies the Visual Acceptance Criteria from [`docs/plans/2026-04-25-collage-landing-finishup.md`](./2026-04-25-collage-landing-finishup.md#visual-acceptance-criteria補強版).

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: wrangler dev server starts on localhost:8787 (or similar). Open in browser.

- [ ] **Step 2: Desktop visual checklist (1280px+)**

For each item, verify and check:

- [ ] Hero 第一屏看到實體相機 + 葉子素材（不只 CSS 多邊形）
- [ ] Hero 橘色便條真的有寫「Create / Build / Sell」三個英文字，使用 Caveat 手寫感字體
- [ ] AI Demo 影片區是米白紙質框，不是黑色圓角手機殼
- [ ] Before-After 區塊存在且使用 `new_sale.webp` 整張為主視覺
- [ ] Final CTA 左側看到相機素材（旋轉 -12 度）
- [ ] Pricing 三張 plan 紙卡上的黃膠帶位置/角度有差異
- [ ] Edu / AI Hook / Country marquee 三段已不存在

- [ ] **Step 3: Mobile visual checklist (375px / 390px / 430px)**

Use DevTools device toolbar:

- [ ] 375px：Hero「Create / Build / Sell」便條可見
- [ ] 375px：Final CTA「Start your business today!」便條可見
- [ ] 375px：Hero 相機 + 葉子素材可見（縮小）
- [ ] 375px：無水平 scrollbar（除 dashboard-side 內部）
- [ ] 390px / 430px：同樣檢查通過

- [ ] **Step 4: Functional smoke test**

- [ ] Nav → 點「方案價格」滑動到 Pricing
- [ ] Pricing → 切換月/年，價格動態更新
- [ ] Pricing → 左右箭頭切換 plan 卡片
- [ ] FAQ → 點問題展開答案，再點收合
- [ ] Hero CTA「免費開始」→ 跳到 /login.html，瀏覽器網路 panel 看到 `cta_click` GA 事件帶 `section: 'hero'`
- [ ] Footer CTA「免費開店，立即體驗」→ 同上但 `section: 'footer'`

- [ ] **Step 5: 對照 Visual Acceptance Criteria Review Questions**

開首頁，回答這三題：

- [ ] 不看文案、只看輪廓，能不能一眼感覺到「手作拼貼 + 開店平台」？
- [ ] 拿掉 logo 後，配色和版面還像同一個品牌嗎？
- [ ] 手機版是否仍然保有紙張層次，而不是退化成普通單欄卡片頁？

如三題都答 YES → 通過驗收。
如有任一題答 NO → 開新 task 補強對應區塊。

- [ ] **Step 6: Stop dev server, final commit (or none if no changes)**

If any visual issue surfaced and was fixed:

```bash
git add public/index.html
git commit -m "polish(landing): final visual QA pass"
```

Otherwise this task produces no commit; just confirms acceptance.

---

## Self-Review Checklist

Run after the plan is implemented (not the writer's self-review):

- [ ] All 14 tasks committed?
- [ ] `node --test test/landing-collage.test.js` green?
- [ ] No `display: none` left on `.hero-note-card / .dashboard-side / .feat-wrap::after / .final-cta::after / .final-note`?
- [ ] No `class="(edu|ai-hook|country|ba)"` HTML left?
- [ ] No `.flow-*` CSS left?
- [ ] SEO `<title>` contains 「我拍｜開店平台」?
- [ ] OG image points to `new_sale.webp`?
- [ ] Both `collage-camera.webp` + `collage-flower.webp` exist in `public/assets/images/landing-collage/`?
- [ ] All 3 GA tracking events (`section: 'nav' | 'hero' | 'footer'`) present?
- [ ] Pricing carousel + FAQ + auth JS all intact?

If all green → 完成。
