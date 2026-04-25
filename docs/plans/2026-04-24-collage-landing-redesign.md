# VOVOSnap 拼貼風 Landing Page 重設計計劃

## Goal

將 `public/index.html` 平台首頁重設計為參考圖方向：手作紙張拼貼、不規則排版、橘藍品牌色、SaaS 開店平台感，並全面改用新 logo `logo_new01.png`。

目標不是把參考圖做成不可維護的整張海報，而是把它拆成可點擊、可響應式、可維護、可 SEO 的真實 HTML/CSS landing page。

## Reference

- 參考圖：`ChatGPT Image 2026年4月24日 下午01_48_21.png`
- 新 logo：`logo_new01.png`
- 主要改版頁面：`public/index.html`
- 現有共用前台樣式：`public/assets/styles.css`
- 產品規格：`SPEC.md`

## Guardrails

這次是 landing page 重設計，不是產品流程重寫。實作時需要明確保留以下行為：

- 保留 `public/index.html` 既有 FAQ accordion 行為。
- 保留 pricing carousel、billing toggle、plan 動態價格更新。
- 保留登入狀態切換與登出按鈕處理。
- 保留 `gtag` CTA tracking，至少維持 hero 與 footer 兩個事件來源。
- 保留 SEO 基本結構：`title`、`description`、`canonical`、FAQ schema、OG/Twitter meta。
- 保留目前 landing 的單頁敘事，不拆成多頁、不引入前端 framework。

明確不在本次範圍內：

- 不修改 `src/routes/*` 後端邏輯。
- 不改 onboarding、admin、store、product、request、success 等其他頁面。
- 不重寫 pricing API、auth API、FAQ 資料來源。
- 不把首頁抽成 React、Vue 或其他框架。

## Design Direction

### 核心概念

「創作者的一鍵開店工作桌」。

頁面像一張旅行剪貼簿：紙張、膠帶、撕邊、拍立得、相機、手寫便條、桌面上的 SaaS dashboard。視覺要讓新手代購者覺得這不是冷冰冰的電商系統，而是能把拍照、上架、導購、成交串起來的創作工具。

### 品牌語氣

- 親近，但不是幼稚。
- 手作感，但仍要有工具平台的可信度。
- 強調「拍照就能開始」、「AI 幫你處理繁瑣」、「創作者專注分享與成交」。

### 視覺關鍵字

- Torn paper
- Tape
- Collage
- Handmade SaaS
- Camera shop
- Travel desk
- Orange and navy
- Editorial scrapbook

## Visual System

### Palette

| Token | Usage | Color |
|---|---|---|
| `--paper` | 主背景、紙張底 | `#f6efe2` |
| `--paper-deep` | 深一階紙張 | `#eadcc4` |
| `--ink` | 主要文字 | `#101316` |
| `--navy` | 品牌深藍、footer、深色區塊 | `#08264a` |
| `--orange` | CTA、重點字、icon | `#f26b1d` |
| `--orange-dark` | CTA hover | `#c94f13` |
| `--mustard` | 紙膠帶、局部 highlight | `#e7ad32` |
| `--muted` | 次要文字 | `#6f665d` |
| `--line` | 紙卡邊線 | `rgba(16, 19, 22, 0.16)` |

### Typography

- 主字體沿用目前已使用的 `Zen Maru Gothic`，維持中文親切度。
- Hero 標題使用粗體 `900`，字距保持 `0`，避免過度 AI 風格。
- 英文手寫便條可用系統 cursive fallback，或實作階段視需要導入 Google Font，例如 `Caveat`。

### Shape And Texture

- 紙張卡片使用小圓角：`4px` 到 `8px`。
- 不使用玻璃擬態、霓虹、藍紫漸層、巨大圓形光暈。
- 撕紙邊使用 `clip-path: polygon(...)` 或 pseudo element。
- 膠帶使用半透明米黃矩形，略微旋轉。
- 紙張陰影要短且柔和，像桌面上的紙，不像 SaaS 卡片陰影。

## Visual Acceptance Criteria

下列條件用來判斷首頁是否真的接近參考圖，而不是只做成一般暖色系 landing page。

### 必須成立

- 第一屏同時出現品牌、主文案、主 CTA、dashboard mockup，且彼此有拼貼層次。
- 頁面至少有 3 種不同紙張處理方式：平整紙卡、撕紙橫幅、便條或膠帶貼紙。
- 橘色與深藍都必須在第一屏明顯出現，不能只剩米白底加小面積點綴。
- 至少 2 個區塊使用不規則邊緣或傾斜構圖，而不是全部回到正方卡片網格。
- Hero 右側 mockup 必須是 HTML/CSS 組出來的介面，不可用單張合成圖取代。

### 不應出現

- 大面積玻璃卡、柔焦霓虹、藍紫科技風。
- 全頁回到一致圓角卡片網格。
- Hero 只剩一張背景圖加置中文字。
- 為了像參考圖而犧牲文字可讀性、按鈕可點性、或手機排版。

### Review Questions

- 不看文案，只看輪廓，能不能一眼感覺到「手作拼貼 + 開店平台」？
- 拿掉 logo 後，配色和版面還像同一個品牌嗎？
- 手機版是否仍然保有紙張層次，而不是退化成普通單欄卡片頁？

## Page Structure

### Existing Anchor Mapping

實作時優先沿用現有 section id 或替新區塊補上對應 id，避免 nav 與既有連結失效。

| Existing Hook | Current Use | New Section Mapping |
|---|---|---|
| `#edu` | 教育用說明區 | 可保留在 hero 下方，作為「為什麼現在就能開始」或併入四步驟上方導言 |
| `#features` | 功能展示區 | 對應新拼貼版影片展示區 |
| `#pricing` | 方案區 | 持續對應 pricing 紙張價目表 |
| `.faq-*` | FAQ JS 與樣式 hook | 保留 class，不重命名互動鉤子 |
| `.plan-*` | pricing carousel / dots / dynamic values | 保留 class 與 id，不重命名 |
| `cta_click` | GA 事件 | 保留 hero 與 footer 事件名稱與 section 值 |

### 1. Nav

目前首頁 nav 保留功能，但改成參考圖風格。

內容：
- 左側：新 logo 圖片，使用 `logo_new01.png`
- 中間：`功能特色`、`解決方案`、`案例分享`、`方案價格`、`資源中心`
- 右側：`登入`、橘色 `免費開始`

實作注意：
- 手機版只保留 logo、登入、免費開始，或折疊次要連結。
- CTA click tracking 保留。

### 2. Hero

Hero 要成為第一眼的品牌信號。

左側：
- 標題：`我拍｜開店平台`
- 主文案：`讓創作者一鍵開店，從內容到成交，全自動`
- 副文案：`拍照上傳 → AI 生成商品頁 → 一鍵上架開店，自動導購、回覆、成交，讓你專注創作`
- CTA：
  - `免費開始`
  - `查看範例店舖`
- 社會證明：`10,000+ 創作者正在使用`

右側：
- HTML/CSS dashboard mockup，不使用整張截圖。
- Dashboard 包含：
  - 側欄：總覽、商品、訂單、顧客、行銷、數據分析、設定
  - KPI：今日訂單、今日營收、總瀏覽數、轉換率
  - 折線圖：營收趨勢
  - 手機商品卡：商品圖片、品名、價格、加入購物車

拼貼元素：
- 背後放撕紙層。
- dashboard 紙卡微旋轉。
- 右側橘色便條：`Create / Build / Sell`
- 底部加入相機、羽毛筆、筆記本等局部素材。

### 3. Four-Step Flow

標題：`開店只要 4 步驟`

四張不規則紙卡：

| Step | Title | Body |
|---|---|---|
| 01 | 拍照 / 上傳 | 拍下商品或上傳圖片，AI 自動生成文案、圖片、商品頁 |
| 02 | AI 生成 | 一鍵生成專屬店舖，無需接待、立即開賣，多平台同步曝光 |
| 03 | 自動導購 | AI 導購、智能回覆，提升轉換率，自動成交 |
| 04 | 成交 / 收款 | 訂單自動處理，安全收款，輕鬆管理營收 |

實作注意：
- 四卡之間用 dashed arrow 連接。
- 桌機四欄，手機單欄。
- 每張紙卡略有不同 `rotate()`，手機角度縮小。

### 4. Why Choose VOVOSnap

標題：`為什麼選擇 我拍開店平台？`

深藍撕紙橫幅，內含 5 個賣點：

| Icon Concept | Title | Copy |
|---|---|---|
| Lightning | 超快速開店 | 1 分鐘生成店舖，快速上架開賣 |
| Robot | AI 全自動化 | AI 生成內容、導購、回覆，讓你省時又省力 |
| Chart | 提升轉換率 | 智能推薦與回覆，成交率提升 3.2x |
| Shield | 安全可靠 | 金流與資料保護，資料機密加密 |
| Heart | 專為創作者設計 | 簡單易用的介面，專注你的創作 |

實作注意：
- 可使用 inline SVG 或 CSS icon。
- 若使用 icon library 不方便，先使用簡潔 emoji-like SVG，不引入大型依賴。
- 深藍區上下用不規則 `clip-path`。

### 5. Product/Feature Demo

保留目前 `ai-demo.mp4`，但不再用傳統影片卡片。

新呈現：
- 影片放入「紙框手機」或「貼在桌面上的截圖」。
- 旁邊用紙條列出：
  - `AI 自動辨識商品`
  - `自動生成文案與規格`
  - `自動換算匯率與售價`
  - `一鍵分享給 LINE 群`

### 6. Pricing

保留現有 pricing carousel 與 plan API 邏輯，但視覺改成紙張價目表。

注意：
- 不修改方案資料來源。
- 保留年/月切換。
- 保留 `plan-dot` carousel 行為。
- `Pro` 推薦標籤改成像貼紙。

### 7. FAQ

標題：`常見問題`

改成兩欄紙條 accordion：
- 桌機：兩欄。
- 手機：單欄。
- `+` / `-` 保留。
- 紙條 hover 時微位移，不改 JS。

### 8. Final CTA

橘色撕紙大橫幅：

文案：
- `開始你的第一筆自動成交`
- `我拍｜開店平台，讓創作更有價值`
- CTA：`免費開店，立即體驗`

拼貼元素：
- 左側大相機。
- 右側便條：`Start your business today!`

### 9. Footer

深藍底：
- 新 logo
- 產品：功能特色、方案價格、更新日誌
- 資源：教學文章、成功案例、常見問題
- 公司：關於我們、聯絡我們、隱私政策、服務條款
- 追蹤我們：社群 icon

## Asset Plan

### Must Use

- `logo_new01.png`

建議複製到：

```text
public/assets/images/logo_new01.png
```

### Existing Assets To Reuse

- `public/assets/videos/ai-demo.mp4`
- `public/assets/images/hero.webp`
- `public/assets/images/c1.webp`
- `public/assets/images/c2.webp`
- `public/assets/images/c3.webp`
- `public/assets/images/before.webp`
- `public/assets/images/after.webp`

### Optional Assets To Generate With gpt-image-2

只有進入實作並確認需要額外素材時再生成。第一版可先用 CSS 完成大部分拼貼效果。

1. `paper-texture.webp`
   - Prompt：米白色手工紙張紋理，細緻纖維，低對比，適合網站背景，無文字，無物件，seamless feel。

2. `collage-camera.webp`
   - Prompt：復古相機剪貼簿素材，手工拼貼風，米白紙張邊緣，橘色與深海軍藍點綴，透明背景。

3. `collage-flower.webp`
   - Prompt：剪貼簿風格小花與葉子素材，暖橘、奶油黃、深綠，紙張拼貼質感，透明背景。

4. `paper-dashboard-background.webp`
   - Prompt：手作拼貼背景素材，撕紙、膠帶、紙張層次，米白、深海軍藍、橘色，無文字，適合 SaaS landing page hero。

生成要求：
- 使用 `gpt-image-2`。
- 優先輸出 webp/png。
- 若需要透明背景，明確要求 transparent background。
- 素材應放到 `public/assets/images/landing-collage/`。

## Files To Modify

### `public/index.html`

主要改動：
- 更新 meta image 視需要改成新首頁視覺。
- 更新 favicon link。
- 重寫 inline landing CSS。
- 重排首頁 HTML section。
- 保留既有 JS：pricing carousel、FAQ、auth status、GA tracking。
- 優先保留既有 `id`、`class`、`data-*` hook；若必須調整，需同步修正對應 JS。

### `public/assets/images/logo_new01.png`

新增或複製新 logo 到公開靜態資產目錄。

### `public/assets/favicon.js`

可選。

若希望全站 fallback favicon 使用新 logo，將 fallback 從 `/assets/images/logo-3.png` 改為 `/assets/images/logo_new01.png`。

### `public/sitemap.xml`

不需要修改。

### `src/*`

不需要修改。

## Implementation Tasks

### Task 1: Prepare Assets And Logo

- [x] 複製 `logo_new01.png` 到 `public/assets/images/logo_new01.png`。
- [x] 將首頁 nav、footer、favicon 改用 `/assets/images/logo_new01.png`。
- [x] 確認圖片尺寸顯示不變形，nav 使用 `object-fit: contain`。

Verification:

```bash
test -f public/assets/images/logo_new01.png
```

Expected: command exits with status `0`.

### Task 2: Replace Landing Visual Tokens

- [x] 在 `public/index.html` inline style 中建立新的 collage token。
- [x] 移除舊 hero 的深色 overlay 與圓形裝飾。
- [x] 新增紙張、橘色、深藍、膠帶、撕紙相關 utility class。
- [x] 明確保留或重新掛回 `.faq-*`、`.plan-*`、CTA tracking 所需 hook。

Core classes:

```css
.paper-card {}
.paper-card::before {}
.tape {}
.torn-band {}
.collage-stage {}
.scribble-note {}
```

Verification:

```bash
rg -n "paper-card|torn-band|collage-stage|logo_new01" public/index.html
```

Expected: all class names and logo path appear.

### Task 3: Rebuild Hero

- [x] Hero 改成左文案、右 dashboard mockup。
- [x] 保留 `免費開始` CTA 的 `gtag('event','cta_click',{section:'hero'})`。
- [x] 新增 `查看範例店舖` 次 CTA，連到適合的 demo 或 `#features`。
- [x] 右側 dashboard mockup 用 HTML/CSS，不使用單張截圖。
- [x] 手機版 hero 改為垂直流，dashboard 在文案下方。
- [x] Nav 內各錨點仍能正確捲動到對應新版 section。

Verification:

```bash
rg -n "讓創作者一鍵開店|dashboard|cta_click.*hero|查看範例店舖" public/index.html
```

Expected: all target strings appear.

### Task 4: Rebuild Four-Step Flow

- [x] 將目前三步驟改成四步驟。
- [x] 每步驟使用紙卡樣式與 step badge。
- [x] 桌機使用四欄，手機使用單欄。
- [x] 卡片間加入 dashed arrow 或 pseudo element。

Verification:

```bash
rg -n "開店只要 4 步驟|拍照 / 上傳|AI 生成|自動導購|成交 / 收款" public/index.html
```

Expected: all four step labels appear.

### Task 5: Rebuild Why Choose Section

- [x] 新增深藍撕紙橫幅。
- [x] 放入 5 個賣點。
- [x] 確保深色背景上的文字對比足夠。

Verification:

```bash
rg -n "為什麼選擇|超快速開店|AI 全自動化|提升轉換率|安全可靠|專為創作者設計" public/index.html
```

Expected: all copy appears.

### Task 6: Restyle Feature Demo And Pricing

- [x] 保留 `ai-demo.mp4`，改成拼貼紙框展示。
- [x] Pricing 保留現有 plan carousel 與 API 更新邏輯。
- [x] Pricing 卡片改成紙張價目表。
- [x] 保留 billing toggle、plan dots、plan dynamic values。

Verification:

```bash
rg -n "ai-demo.mp4|billing-toggle|plan-track|plan-dot|price-free|price-pro" public/index.html
```

Expected: existing interactive hooks remain.

### Task 7: Restyle FAQ, CTA, Footer

- [x] FAQ 改成紙條式 accordion。
- [x] Final CTA 改成橘色撕紙橫幅。
- [x] Footer 改深藍底並使用新 logo。
- [x] 保留 footer CTA tracking。

Verification:

```bash
rg -n "常見問題|開始你的第一筆自動成交|footer|cta_click.*footer|logo_new01" public/index.html
```

Expected: target strings and tracking remain.

### Task 8: Responsive And Accessibility Pass

- [x] 檢查 375px、390px、430px 無水平捲動。
- [x] 檢查桌機寬度 960px 內仍維持單欄 landing。
- [x] 所有圖片保留 meaningful `alt`。
- [x] 所有 CTA 可用鍵盤 focus。
- [x] `prefers-reduced-motion` 保留或新增。
- [x] Nav 錨點、FAQ 展開、pricing 切換、hero/footer CTA tracking 都能正常工作。

Verification:

```bash
npm test
```

Expected: existing tests pass.

Manual visual checks:
- Mobile 375px
- Mobile 430px
- Desktop 960px

## Risks

1. **參考圖是海報式長圖，網站不能完全照抄。**
   解法：保留互動與語意 HTML，把視覺語彙轉成 CSS component。

2. **不規則拼貼可能造成手機溢出。**
   解法：手機降低 rotate 角度，所有拼貼容器加 `overflow: hidden` 或明確 max-width。

3. **目前 `public/index.html` inline CSS 很長。**
   解法：第一版可維持 inline，避免大規模搬移；若後續繼續維護，再拆成 landing 專用 CSS。

4. **新 logo 是正方形大圖，不適合直接塞 nav。**
   解法：使用固定寬高與 `object-fit: contain`，必要時裁出橫式 logo 版本。

## Definition Of Done

- 首頁第一眼接近參考圖的手作拼貼方向。
- 新 logo 已用於 nav、footer、favicon。
- Hero、四步驟、賣點、FAQ、CTA、footer 都完成拼貼風重設計。
- Pricing、FAQ、GA tracking、登入狀態切換沒有壞。
- Mobile-first 顯示正常，無水平捲動。
- `npm test` 通過，或清楚記錄無法執行的原因。
- 依 `Visual Acceptance Criteria` 檢查後，不會被評為普通暖色 SaaS landing page。
