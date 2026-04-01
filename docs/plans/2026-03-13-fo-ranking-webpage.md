# F.O. Ranking 繁中頁面 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 以 `https://fo-online.jp/ranking?bc=J&gc=1&lcc=001001001&scc=001001001002` 為來源，建立一個繁體中文商品排行榜頁面，完整呈現圖片、價格、規格欄位與商品連結。

**Architecture:** 先用 `agent-browser` 抓取排行榜卡片資料（前 20 筆），再產生 `zh-TW` 結構化 JSON，最後由純前端頁面渲染卡片。頁面採靜態生成資料（非即時抓站），確保可重現與可控。測試以 Playwright 驗證資料數量與關鍵欄位是否正確渲染。

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript, Node.js (資料前處理腳本), Playwright (E2E 驗證)

---

### Task 1: 建立專案骨架與初始檔案

**Files:**
- Create: `package.json`
- Create: `src/index.html`
- Create: `src/styles.css`
- Create: `src/app.js`
- Create: `data/products.ja.json`
- Create: `data/products.zh-TW.json`
- Create: `scripts/extract-ranking.js`
- Create: `scripts/transform-to-zhTW.js`
- Create: `tests/ranking.spec.ts`

**Step 1: 建立最小 package.json**

```json
{
  "name": "fo-ranking-zh-tw",
  "private": true,
  "type": "module",
  "scripts": {
    "extract": "node scripts/extract-ranking.js",
    "transform": "node scripts/transform-to-zhTW.js",
    "build:data": "npm run extract && npm run transform",
    "test:e2e": "playwright test",
    "serve": "python3 -m http.server 4173 -d src"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0"
  }
}
```

**Step 2: 建立空白頁面入口**

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BREEZE 短袖 T 恤排行榜（繁體中文）</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

**Step 3: 安裝測試依賴**

Run: `npm install`
Expected: 產生 `node_modules` 且無安裝錯誤

**Step 4: Commit**

```bash
git add package.json src data scripts tests
git commit -m "chore: scaffold fo ranking zh-tw page project"
```

### Task 2: 擷取來源資料（agent-browser）

**Files:**
- Modify: `scripts/extract-ranking.js`
- Modify: `data/products.ja.json`

**Step 1: 寫 failing test（擷取資料格式）**

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("products.ja.json should include 20 ranking items", async () => {
  const raw = fs.readFileSync("data/products.ja.json", "utf-8");
  const items = JSON.parse(raw);
  expect(items.length).toBe(20);
});
```

**Step 2: 跑測試確認失敗**

Run: `npm run test:e2e`
Expected: FAIL，因 `products.ja.json` 尚未有完整 20 筆

**Step 3: 實作 `extract-ranking.js`（用 agent-browser）**

```js
import { execSync } from "node:child_process";
import fs from "node:fs";

const url = "https://fo-online.jp/ranking?bc=J&gc=1&lcc=001001001&scc=001001001002";
execSync(`agent-browser --session-name fo_plan open "${url}"`, { stdio: "inherit" });
execSync("agent-browser --session-name fo_plan wait 5000", { stdio: "inherit" });
const output = execSync(
  "agent-browser --session-name fo_plan eval '(() => { const cards=[...document.querySelectorAll(\".p-ranking-list .c-item-card\")]; const parseJson=(s)=>{try{return JSON.parse(s||\"{}\")}catch(e){return {}}}; return cards.map((card, idx)=>{ const data=parseJson(card.getAttribute(\"data-web-tracking-v2-data-item\")); const a=card.querySelector(\"a[href*=\\\"/items/\\\"]\"); return { rank: String(idx+1), code:data.code||\"\", brand:data.brandName||\"\", name:data.name||\"\", priceJPYTaxIn:data.taxExcludedSalePrice!=null?data.taxExcludedSalePrice+data.salePriceTax:null, priceText:(card.querySelector(\".c-item-card__price\")?.textContent||\"\").replace(/\\s+/g,\" \").trim(), colorsText:(card.querySelector(\".c-item-card__colors--text\")?.textContent||\"\").replace(/\\s+/g,\" \").trim(), categorySmallName:data.smallCategoryName||\"\", colorName:data.colorName||\"\", image:card.querySelector(\"img\")?.getAttribute(\"src\")||\"\", url:a?.href||\"\", badges:[...card.querySelectorAll(\".c-badge-list *\")].map(e=>e.textContent.trim()).filter(Boolean) }; }); })()'"
).toString();
fs.writeFileSync("data/products.ja.json", output);
```

**Step 4: 用目前已擷取資料先落盤（基準資料）**

實際基準（已驗證可抓到）包含以下欄位：`rank`, `code`, `brand`, `name`, `priceJPYTaxIn`, `priceText`, `colorsText`, `categorySmallName`, `colorName`, `image`, `url`, `badges`。

**Step 5: 跑測試確認通過**

Run: `npm run test:e2e`
Expected: PASS（`products.ja.json` 有 20 筆）

**Step 6: Commit**

```bash
git add scripts/extract-ranking.js data/products.ja.json tests/ranking.spec.ts
git commit -m "feat: extract fo ranking items via agent-browser"
```

### Task 3: 轉繁中資料與欄位規格化

**Files:**
- Modify: `scripts/transform-to-zhTW.js`
- Modify: `data/products.zh-TW.json`

**Step 1: 寫 failing test（繁中欄位存在）**

```ts
test("products.zh-TW.json should include Traditional Chinese fields", async () => {
  const raw = fs.readFileSync("data/products.zh-TW.json", "utf-8");
  const items = JSON.parse(raw);
  expect(items[0].spec.category).toBe("短袖T恤");
  expect(items[0].labels.price).toContain("日圓");
});
```

**Step 2: 跑測試確認失敗**

Run: `npm run test:e2e`
Expected: FAIL（尚未轉換）

**Step 3: 實作繁中轉換腳本**

```js
import fs from "node:fs";

const ja = JSON.parse(fs.readFileSync("data/products.ja.json", "utf-8"));
const mapBadge = { SALE: "特價", NEW: "新品" };

const zhTW = ja.map((item) => ({
  rank: item.rank,
  code: item.code,
  brand: item.brand,
  nameJa: item.name,
  nameZhTW: item.name, 
  image: item.image,
  url: item.url,
  labels: {
    rank: `第 ${item.rank} 名`,
    price: `價格：${item.priceJPYTaxIn} 日圓（含稅）`,
    colorCount: `顏色數：${item.colorsText.replace("colors", "")}`
  },
  spec: {
    category: "短袖T恤",
    colorNameJa: item.colorName,
    colorCount: Number(item.colorsText.replace("colors", "")),
    badgesZhTW: item.badges.map((b) => mapBadge[b] || b)
  },
  raw: item
}));

fs.writeFileSync("data/products.zh-TW.json", JSON.stringify(zhTW, null, 2));
```

**Step 4: 跑測試確認通過**

Run: `npm run test:e2e`
Expected: PASS（繁中欄位完整）

**Step 5: Commit**

```bash
git add scripts/transform-to-zhTW.js data/products.zh-TW.json tests/ranking.spec.ts
git commit -m "feat: transform ranking data to zh-tw schema"
```

### Task 4: 建立繁中排行榜頁面 UI

**Files:**
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Modify: `src/index.html`

**Step 1: 寫 failing test（UI 卡片數與關鍵文案）**

```ts
test("page renders 20 cards and Traditional Chinese labels", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173");
  await expect(page.locator("[data-card]")).toHaveCount(20);
  await expect(page.getByText("短袖T恤排行榜")).toBeVisible();
});
```

**Step 2: 跑測試確認失敗**

Run: `npm run test:e2e`
Expected: FAIL（頁面尚未渲染）

**Step 3: 實作 `app.js` 渲染卡片**

```js
import data from "../data/products.zh-TW.json" assert { type: "json" };

const app = document.getElementById("app");
app.innerHTML = `
  <section class="page">
    <header class="hero">
      <h1>短袖T恤排行榜</h1>
      <p>BREEZE BOY 類別（繁體中文整理）</p>
    </header>
    <div class="grid">
      ${data
        .map(
          (item) => `
        <article class="card" data-card>
          <img src="${item.image}" alt="${item.nameZhTW}" loading="lazy" />
          <div class="meta">
            <p class="rank">${item.labels.rank}</p>
            <h2>${item.nameZhTW}</h2>
            <p>${item.labels.price}</p>
            <p>${item.labels.colorCount}</p>
            <p>品號：${item.code}</p>
            <p>分類：${item.spec.category}</p>
            <a href="${item.url}" target="_blank" rel="noreferrer">查看原商品</a>
          </div>
        </article>
      `
        )
        .join("")}
    </div>
  </section>
`;
```

**Step 4: 實作 `styles.css`（桌機 + 手機）**

```css
:root {
  --bg: #f6f8fb;
  --card: #ffffff;
  --text: #13161c;
  --muted: #4f5b6c;
  --accent: #1f7a8c;
}
body { margin: 0; font-family: "Noto Sans TC", sans-serif; background: var(--bg); color: var(--text); }
.page { max-width: 1200px; margin: 0 auto; padding: 24px; }
.hero { margin-bottom: 20px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.card { background: var(--card); border-radius: 14px; overflow: hidden; box-shadow: 0 6px 24px rgba(20, 32, 54, 0.08); }
.card img { width: 100%; aspect-ratio: 1/1; object-fit: cover; }
.meta { padding: 12px; }
.rank { color: var(--accent); font-weight: 700; }
a { color: var(--accent); text-decoration: none; }
@media (max-width: 768px) { .page { padding: 14px; } }
```

**Step 5: 跑測試確認通過**

Run: `npm run test:e2e`
Expected: PASS（20 張卡片、繁中標題與欄位可見）

**Step 6: Commit**

```bash
git add src tests/ranking.spec.ts
git commit -m "feat: build zh-tw ranking webpage ui"
```

### Task 5: 驗證資料準確性與交付

**Files:**
- Modify: `README.md`

**Step 1: 新增資料來源與更新流程說明**

```md
## Data Source
- Source URL: https://fo-online.jp/ranking?bc=J&gc=1&lcc=001001001&scc=001001001002
- Refresh command: npm run build:data
```

**Step 2: 端到端驗證**

Run:
- `npm run build:data`
- `npm run serve`
- `npm run test:e2e`

Expected:
- `data/products.ja.json` 與 `data/products.zh-TW.json` 各 20 筆
- UI 正常顯示圖片/價格/規格/連結
- 測試全綠

**Step 3: Commit**

```bash
git add README.md data
git commit -m "docs: add data source and refresh workflow"
```

## 已確認的來源欄位樣本（本次 agent-browser 擷取）

- 排名: `1` ~ `20`
- 品牌: `BREEZE`
- 分類: `半袖Tシャツ`（轉繁中 `短袖T恤`）
- 價格樣式: `¥990 税込`, `¥704 税込 20% OFF`
- 規格可用欄位: `code`, `colorName`, `colorsText`, `badges`
- 圖片: `https://fo-online.jp/images/item/<code>/<image>.jpg`
- 商品頁連結: `https://fo-online.jp/items/<code>`

