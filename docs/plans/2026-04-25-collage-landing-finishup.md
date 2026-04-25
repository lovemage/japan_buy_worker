# 拼貼風 Landing Page 補強設計

## Goal

把 `public/index.html` 拼貼風重設計做完整。前一份計畫 [`2026-04-24-collage-landing-redesign.md`](./2026-04-24-collage-landing-redesign.md) 已交付 Hero / 4 步驟 / Why Choose / FAQ / Pricing / Footer 的拼貼版本，但實際比對發現多處視覺力度不足、4 個區塊還是舊版綠色 brand light、SEO meta 仍是舊「代購」敘事、行動版便條全被 `display:none`。

這份補強計畫的目標：把這些落差全部修補完成，讓首頁從上到下、從桌機到手機都符合 [`2026-04-24-collage-landing-redesign.md`](./2026-04-24-collage-landing-redesign.md) 的 Visual Acceptance Criteria。

## Scope

這次只動首頁與素材，不動後端 / 其他前台頁面。

### 在範圍內

1. 重畫 Hero 拼貼層（撕紙底加大、Create / Build / Sell 寫進便條、加相機 + 葉子素材、tape 改成有紋理）。
2. 重畫 AI Demo（黑色圓角手機殼 → 米白紙質手機外框 + 撕邊 + 旁邊釘 4 條靜態紙條）。
3. 補強 Final CTA（左側放實體相機素材、手機版便條改成縮放保留）。
4. 補強 Pricing（每張 plan 黃膠帶位置 / 角度打散；`.compare-table` 加紙張背景與紙感邊框）。
5. 重畫 Before-After（整張 `new_sale.webp` 為主視覺 + 旁邊紙條列 3 個賣點）。
6. 移除 Edu 區、AI Hook 卡片、Country marquee 三段冗餘區塊與其相關 CSS / JS。
7. 移除 `.flow-*` dead CSS。
8. 行動版所有便條改成 `transform: scale()` 縮放保留，移除 `display:none`。
9. 更新 SEO meta（title / description / OG image / Twitter card）切到「我拍｜開店平台」敘事。
10. 用 `/nano` 生成 2 張新素材：`collage-camera.webp`、`collage-flower.webp`。

### 不在範圍內

- 不修改 `src/routes/*` 後端邏輯。
- 不改 onboarding / admin / store / product / request / success 等其他頁面。
- 不重寫 pricing API、auth API、FAQ 資料來源。
- 不把首頁抽成 React、Vue 或其他框架。
- 不重做 4 步驟、Why Choose、FAQ、Nav、Footer 區塊（前一份計畫已交付且符合驗收標準）。
- 不改現有 GA tracking 事件名稱或來源（`cta_click` 仍是 nav / hero / footer 三來源）。

## Asset Plan

### 新生成（用 `/nano` 跑 Gemini Nano Banana 2）

兩張，都輸出到 `public/assets/images/landing-collage/`，透明背景，webp 格式。

1. `collage-camera.webp`
   - Prompt：`Vintage camera collage cutout, scrapbook paper edges, orange and navy blue accents, transparent background, no text, isolated subject, scrapbook handmade craft style, 800x800`
   - 用途：Hero 左下、Final CTA 左側放大版。

2. `collage-flower.webp`
   - Prompt：`Small flowers and leaves cutout, warm orange + cream yellow + deep green palette, paper collage texture, transparent background, no text, scrapbook handmade craft style, 600x600`
   - 用途：Hero 右上、Pricing / Before-After 點綴。

### 現有可用（不改動）

| 檔案 | 用途 |
|---|---|
| `logo_new01.png` | Nav / Footer / Favicon（已使用） |
| `new_sale.webp` | Before-After 主視覺 + OG image + Twitter image |
| `more_easy_than_you_thaught.webp` | 預備素材（本次不一定用，留著） |
| `you_dont_have_to_learn.webp` | 預備素材（本次不一定用，留著） |
| `creator-avatar-01~04.webp` | Hero 桌面右側 dashboard 角落浮貼，或 Why Choose 替代 SVG icon |
| `ai-demo.mp4` | AI Demo 區影片來源 |

### 素材使用配置表

| 區塊 | 素材 | 擺法 |
|---|---|---|
| Hero 左下 | `collage-camera.webp` | 約 160px 寬，`rotate(-6deg)`，超出 hero 邊緣 |
| Hero 右上 | `collage-flower.webp` | 約 120px 寬，`rotate(8deg)`，貼在便條後面 |
| Hero dashboard 角落 | `creator-avatar-01.webp` | 約 70px 圓形，浮貼在 dashboard 右上角 |
| Before-After | `new_sale.webp` 整張 | tape + `rotate(-1.5deg)`，旁邊 3 張紙條賣點 |
| Final CTA 左側 | `collage-camera.webp` 放大版 | 約 220px 寬，`rotate(-12deg)` |
| OG image | `new_sale.webp` | meta tag |
| Twitter image | `new_sale.webp` | meta tag |

## Section Designs

### Hero（重畫拼貼層）

保留：左文案 + 右 dashboard mockup 主結構、`cta_click {section:'hero'}` GA 事件、副 CTA `查看範例店舖` 連結。

要動：

- 撕紙底 `.hero::before` 高度從 178px 加到 `min(420px, 60%)`，從 `bottom:18px` 改成貼齊 hero 主體背後填滿，深藍 / 米白雙層交錯。
- `.hero-note-card` 不再是空 div：寫進手寫風文字 `Create / Build / Sell`，三行錯落排列，使用 `Caveat` Google Font（透過 `<link>` 載入 weight 700，用 `&display=swap`），fallback `Patrick Hand`、`cursive`。
- 加入兩張新素材 `collage-camera.webp`（左下）+ `collage-flower.webp`（右上）作為 hero 桌面拼貼層，使用 `position: absolute` + `z-index` 控制層級。
- `.tape` 半透明黃色矩形升級成有紙質紋理：`background: linear-gradient(...)` 加 `filter: contrast(1.1) brightness(0.98)`，並加 `box-shadow: 0 2px 4px rgba(0,0,0,0.08)` 模擬膠帶厚度，`::before` 加細微的鋸齒邊。
- Dashboard mockup 右上角浮一張縮小的 `creator-avatar-01.webp`（約 70px 圓形），模擬店主頭像。

### AI Demo（重畫紙框手機）

保留：`ai-demo.mp4`、影片自動播放屬性、影片區段位置。

要動：

- `.feat-video-area` 從黑色圓角手機殼（`background: #000` + `border-radius: 36px`）改成米白紙框：`background: var(--paper)` + `border: 14px solid #2a2620`（深棕紙質邊）+ `border-radius: 8px` + `clip-path` 撕邊。
- 紙框外加 2 條膠帶（左上 + 右下對角）。
- 影片旁邊釘 4 條靜態紙條（不再用 carousel），每條紙條：米白底、橘色 step 數字、`rotate()` 0~3 度交錯：
  - `01 AI 自動辨識商品`
  - `02 自動生成文案與規格`
  - `03 自動換算匯率與售價`
  - `04 一鍵分享給 LINE 群`
- 移除目前的 carousel JS（`feat-prev / feat-next / feat-dot` 相關 hook）。

### Before-After（新增區塊）

放置位置：Why Choose 之後、AI Demo 之前。新區塊 `id="before-after"`。

結構：

```html
<section class="before-after" id="before-after">
  <div class="paper-card before-after-main">
    <img src="/assets/images/new_sale.webp" alt="開店前後對比：從焦慮上班族到輕鬆經營" />
    <span class="tape tape-tl"></span>
    <span class="tape tape-br"></span>
  </div>
  <div class="before-after-notes">
    <div class="scribble-note note-1">節省時間<br>1 分鐘上架</div>
    <div class="scribble-note note-2">自動成交<br>AI 全程處理</div>
    <div class="scribble-note note-3">隨時隨地<br>手機就能管</div>
  </div>
</section>
```

要動：

- 桌機：左側 70% 放圖、右側 30% 放 3 張紙條 vertical 排列。
- 手機：圖在上、紙條在下橫排。
- 圖外框 `rotate(-1.5deg)` + `tape` 兩條對角。
- 紙條每張不同 `rotate()`（-3, 2, -2 度）。

### Pricing（補強紙感）

保留：`plan-track / plan-dot / billing-toggle / switchBilling()` 全部 JS、`price-free / price-pro / note-*` 動態值更新邏輯、年/月切換、推薦標籤位置。

要動：

- 每張 `.plan` 的黃膠帶 `::after` 角度與位置打散：用 `nth-child` 個別給 `top / left / transform: rotate()` 不同值（例：第 1 張 `top:-8px; left:20%; rotate(-4deg)`、第 2 張 `top:-12px; right:15%; rotate(6deg)`、第 3 張 `top:-6px; left:40%; rotate(-2deg)`）。
- `.compare-table` 從目前的純白底改成 `background: var(--paper)` + `border: 1px dashed var(--line)` + `box-shadow` 軟陰影，外面包一層 `paper-card` 紙質感。
- Compare table 的 row hover 改成 `background: rgba(242, 107, 29, 0.04)`（淡橘紙質）。

### Final CTA（補強）

保留：`cta_click {section:'footer'}` GA 事件（按鈕 onclick 上的 tracking 不能丟）、橘色撕紙底 clip-path、scribble note `Start your business today!`。

要動：

- 左側 `.final-cta::before` 深藍多邊形改成放置 `collage-camera.webp` 放大版（約 220px 寬，`rotate(-12deg)`）。
- 手機 (`max-width: 600px`)：移除 `.final-cta::after` 與 `.final-note` 的 `display:none`，改成：
  - `.final-note`: `transform: scale(0.7) rotate(-4deg)`，移到 CTA 按鈕下方右側
  - `.final-cta::after`（裝飾元素）: `transform: scale(0.8)` 縮在右下
- 相機素材在手機版 `transform: scale(0.6)` + 移到標題上方，避免擠壓 CTA 按鈕。

### 移除區塊

依序在 HTML 中刪除：

1. **Edu 區（[L666-711](../../public/index.html#L666-L711)）** — 整個 `section.edu` 連同 `.edu-bubble` 樣式。
2. **AI Hook 卡片（[L807](../../public/index.html#L807)）** — 整個 `section.ai-hook` 連同 `.ai-hook-card` 樣式。
3. **Country marquee（[L1049](../../public/index.html#L1049)）** — 整個 `section.country` / `.country-marquee` 連同 marquee CSS animation 與 JS。
4. **Dead `.flow-*` CSS（[L227-246](../../public/index.html#L227-L246)）** — `.flow / .flow-step / .flow-icon / .flow-arrow` 與行動版 `.flow` RWD（[L503-507](../../public/index.html#L503-L507)）。

驗證：移除後不能有 dangling reference（nav 錨點、其他 section 內 link、JS 內 `getElementById` 引用都要清乾淨）。

### Mobile（≤600px）便條策略

把目前所有 `display:none` 都換成 `transform: scale()` + 重新定位：

| 便條 | 桌機 | 手機 (≤600px) |
|---|---|---|
| `.hero-note-card`（Create/Build/Sell） | 浮 hero 右上 | `scale(0.7) rotate(-6deg)`，浮在 hero 文案塊右上角 |
| `.dashboard-side`（dashboard 側欄） | 完整 7 項 | `scale(0.85)` + 改 `overflow-x: auto` 變 horizontal scroll |
| `.feat-wrap::after`（AI handles it） | 浮影片右下 | `scale(0.75) rotate(3deg)`，浮在影片下方右側 |
| `.final-cta::after` + `.final-note`（Start your business today!） | 浮右下 | `scale(0.7) rotate(-4deg)`，浮在 CTA 按鈕下方右側 |

實作注意：手機版 hero 仍保持 vertical flow（文案在上、dashboard 在下），但 dashboard 不再隱藏側欄，而是壓縮成可橫向捲動。

### SEO Meta

更新 [public/index.html#L6-L16](../../public/index.html#L6-L16)：

```html
<title>我拍｜開店平台 — 創作者一鍵開店，從內容到成交全自動</title>
<meta name="description" content="拍照上傳 → AI 生成商品頁 → 一鍵上架開店，自動導購、回覆、成交。讓創作者專注分享，10,000+ 創作者正在使用。">
<meta property="og:title" content="我拍｜開店平台 — 創作者一鍵開店，從內容到成交全自動">
<meta property="og:description" content="拍照上傳 → AI 生成商品頁 → 一鍵上架開店，自動導購、回覆、成交。讓創作者專注分享。">
<meta property="og:image" content="/assets/images/new_sale.webp">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="我拍｜開店平台 — 創作者一鍵開店">
<meta name="twitter:description" content="拍照上傳 → AI 生成商品頁 → 一鍵上架開店，自動導購、回覆、成交。">
<meta name="twitter:image" content="/assets/images/new_sale.webp">
```

FAQ schema：保持既有結構，文案不改。

Canonical：保持 `https://vovosnap.com/`。

## Visual Acceptance Criteria（補強版）

延續 [`2026-04-24-collage-landing-redesign.md`](./2026-04-24-collage-landing-redesign.md) 既有條件，並新增以下：

### 必須成立（補強條件）

- Hero 第一屏可看到實體相機素材 + 葉子素材（不只 CSS 多邊形）。
- Hero 橘色便條真的有寫「Create / Build / Sell」三個英文字，使用手寫感字體。
- AI Demo 影片區是米白紙質框，不是黑色圓角手機殼。
- Before-After 區塊存在且使用 `new_sale.webp` 整張為主視覺。
- 手機版 (`375px / 390px / 430px`) 同時可看到 Hero 便條 + Final CTA 便條（不能 `display:none`）。
- SEO `<title>` 包含「我拍｜開店平台」字樣。
- HTML 中找不到 `class="edu` / `class="ai-hook` / `class="country` 任何一段。

### Review Questions（追加）

- 手機 375px 打開首頁，能看到至少 2 張便條紙感元素嗎？
- 影片區看起來像「桌面上的紙質照片框」還是「黑色手機殼」？
- Before-After 那張 `new_sale.webp` 跟其他區塊是同一個拼貼風世界嗎？

## Files To Modify

| 檔案 | 動作 |
|---|---|
| `public/index.html` | 主要重寫：hero / ai-demo / before-after / pricing / final-cta / SEO meta / 移除三段區塊 / 移除 dead CSS / 行動版便條策略 |
| `public/assets/images/landing-collage/collage-camera.webp` | 新生成 |
| `public/assets/images/landing-collage/collage-flower.webp` | 新生成 |
| `test/landing-collage.test.js` | 視需要追加新驗收項（Before-After section 存在、SEO title 字樣、舊區塊消失） |

不需要修改：
- `public/sitemap.xml`
- `src/*` 全部
- `public/assets/styles.css`（首頁 inline style 為主）
- `public/assets/favicon.js`（前份計畫已切到 `logo_new01.png`）

## Risks

1. **新生成的 2 張素材風格可能跟現有 `new_sale.webp`、`creator-avatar-*` 不一致。**
   解法：生成後肉眼比對，若風格落差太大，調整 prompt 重生（最多 2 次），或改用 `more_easy_than_you_thaught.webp` 既有素材作 fallback。

2. **`new_sale.webp` 中已有「我拍｜開店平台 / vovoSnap」logo，可能跟 nav logo 重複。**
   解法：Before-After 區塊安排在 Why Choose 與 AI Demo 之間，與 nav 距離夠遠；且區塊上方標題與圖中 logo 字體不同，整體閱讀順序仍清楚。

3. **移除 Edu / AI Hook / Country 三段可能影響 SEO 著陸頁關鍵字密度。**
   解法：新增的 Before-After 紙條、補強的 SEO meta 都加入「開店平台」、「自動成交」、「AI 上架」等新關鍵字，整體關鍵字策略向 B2B SaaS 對齊。

4. **手機版便條改 `scale` 保留可能造成版面擠壓 / 重疊。**
   解法：每張便條獨立調 `position` + `scale`，並在 375 / 390 / 430 三個 breakpoint 實機檢查。便條 `pointer-events: none` 避免擋住 CTA 按鈕點擊。

5. **`/nano` 生成的素材可能偏離透明背景需求。**
   解法：prompt 明確要求 `transparent background, isolated subject`，輸出後檢查 alpha channel；若沒透明，手動補去背或改用其他生圖通道。

## Definition Of Done

- 兩張新素材 `collage-camera.webp`、`collage-flower.webp` 存在於 `public/assets/images/landing-collage/`。
- Hero 第一屏視覺力度達到 [Visual Acceptance Criteria（補強版）](#visual-acceptance-criteria補強版) 全部「必須成立」條件。
- AI Demo 紙框手機已生效，原 carousel 移除乾淨。
- Before-After 區塊存在並使用 `new_sale.webp`。
- Edu / AI Hook / Country marquee 三段 HTML / CSS / JS 完全移除，無 dangling reference。
- `.flow-*` dead CSS 移除。
- 行動版 375 / 390 / 430 三個 breakpoint 都看得到至少 Hero 便條 + Final CTA 便條。
- SEO `<title>` 與 `<meta description>` 切到「我拍｜開店平台」敘事。
- OG / Twitter image 改用 `new_sale.webp`。
- `npm test` 通過（landing-collage.test.js 若有新驗收項一併通過）。
- Pricing carousel / billing toggle / FAQ accordion / auth 狀態 / nav 錨點 / GA tracking 全部正常運作（`npm test` 既有測試不能 regress）。
