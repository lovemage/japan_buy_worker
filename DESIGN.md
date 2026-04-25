# Design

> 我拍｜開店平台 — 拼貼風 SaaS landing 視覺系統。
> 對應 product 脈絡見 [PRODUCT.md](./PRODUCT.md)。
> 完整 spec 與驗收標準見 [docs/plans/2026-04-24-collage-landing-redesign.md](./docs/plans/2026-04-24-collage-landing-redesign.md)。

## Aesthetic Concept

**手作旅行剪貼簿（Handmade Travel Scrapbook）。**

頁面像桌上一張拼貼紙：撕紙橫幅、紙膠帶、拍立得、復古相機、便條紙，搭配嚴謹的 SaaS dashboard mockup。**親近的手作 + 可靠的工具** 是兩條需要同時成立的視覺訊號。

## Color Tokens

主要 token 都在 `public/index.html` inline `<style>` 中，定義在 `:root`：

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#f6efe2` | 主背景、紙張底 |
| `--paper-deep` | `#eadcc4` | 深一階紙張、表頭 |
| `--paper-warm` | `#fffaf2` | 卡片內溫白 |
| `--ink` | `#101316` | 主要文字 |
| `--navy` | `#08264a` | 品牌深藍：footer、why-band 撕紙、文字 |
| `--orange` | `#f26b1d` | CTA、強調、icon |
| `--orange-dark` | `#c94f13` | CTA hover、強調文字 |
| `--mustard` | `#e7ad32` | 紙膠帶、便條 highlight |
| `--muted` | `#6f665d` | 次要文字 |
| `--line` | `rgba(16,19,22,0.16)` | 紙卡邊線 |

**配色原則**：
- 橘 + 深藍必須出現在每個 hero / CTA / 撕紙橫幅，不能只剩米白底加小面積點綴。
- 米白紙張 (`--paper`) 是頁面整體底色，所有 section 默認延續這個底，避免一塊深藍接一塊純白導致拼貼感斷裂。

## Typography

- **主字體**：[`Zen Maru Gothic`](https://fonts.google.com/specimen/Zen+Maru+Gothic) (weight 400/700/900)，中文親切感、圓潤但仍有結構。
- **手寫字體**：[`Caveat`](https://fonts.google.com/specimen/Caveat) (weight 600/700)，**只用在英文便條 / scribble note**（例：Hero 的「Create / Build / Sell」）。中文不能用 Caveat（沒 CJK glyph 會 fallback 變奇怪），中文便條用 Zen Maru Gothic + 較小 size 即可。
- **Hero 大標**：`font-weight: 900`、`letter-spacing: 0`、桌機 52px、手機 38px 上下。
- **Section title**：`font-weight: 900`、桌機 30px、手機 22-24px，`em` 變色橘 (`var(--orange)`)。
- **內文**：weight 600-700、size 13-16px、line-height 1.5-1.9，多行內文要 `overflow-wrap: anywhere` 避免中文長字串爆版。

## Shape, Texture, Elevation

- **紙卡圓角**：`4px` ~ `8px`。**禁用 12px+ 圓角**（會立刻退化成普通 SaaS 卡片）。
- **撕紙邊**：用 `clip-path: polygon(...)` 製作不規則邊緣（範例：[Hero 撕紙底](public/index.html#L168-L170)、[Why-band](public/index.html) torn-band、[Final CTA](public/index.html) clip-path）。
- **紙膠帶**：半透明芥末黃 `linear-gradient` + `::before/::after` 鋸齒邊 clip-path 模擬撕邊質感。class `.tape`。
- **便條紙旋轉**：`transform: rotate()` 角度落在 ±2°~ ±8°，不要超過 ±10°（會看起來歪到擠到其他元素）。每張便條/卡片 tilt 角度應該打散，不能全部同方向。
- **陰影**：偏柔短，模擬桌面紙張陰影，不要 SaaS card 的長陰影：
  ```css
  --paper-shadow: 0 4px 14px rgba(31, 22, 12, 0.08);
  ```
- **不要使用**：玻璃擬態、模糊光暈、霓虹邊框、藍紫漸層、巨大圓形 hero blob。

## Asset System

實體素材放在 `public/assets/images/` 跟 `public/assets/images/landing-collage/`：

| Asset | 路徑 | 用法 |
|---|---|---|
| Logo | `logo_new01.png` | Nav / Footer / Favicon |
| Hero camera sticker | `landing-collage/collage-camera.webp` | Hero 左下 + Final CTA 左側（透明 PNG sticker） |
| Hero flower sticker | `landing-collage/collage-flower.webp` | Hero 右上點綴（透明 PNG sticker） |
| Creator avatars | `creator-avatar-01~04.webp` | Hero proof row + dashboard floating avatar |
| Before-After collage | `new_sale.webp` | Before-After section 主視覺 + OG image |
| Hero phone product | `hero.webp` | Hero dashboard 旁手機商品卡 |
| AI demo video | `videos/ai-demo.mp4` | Feature section 紙框內影片 |

**素材調性**：scrapbook handmade craft style、warm orange + navy + mustard + cream 調色、所有 sticker 元素必須有撕紙邊或紙張背景，避開「flat vector AI startup illustration」。

## Layout Patterns

- **Section padding**：桌機 64-96px，手機 56-72px；section 之間靠米白 `--paper` 底連續。
- **Hero**：左文案 + 右 dashboard mockup（`grid-template-columns: minmax(0, 0.95fr) minmax(420px, 1.1fr)`），手機改單欄。
- **4 步驟**：桌機四欄 dashed arrow 連接、手機改單欄 + grid `38px 1fr` 把 step badge 鎖左欄、標題+內文堆右欄。
- **Why-band**：深藍撕紙橫幅，5 個賣點 grid，icon 用 inline SVG。
- **Before-After**：桌機 `grid-template-columns: minmax(0, 1.8fr) minmax(220px, 1fr)`（圖大 + 紙條小），手機改單欄 + 紙條橫排。
- **AI Demo**：桌機 `grid-template-columns: minmax(0, 1fr) 280px`（紙框影片 + 4 張紙條），手機紙框在上、紙條垂直排在下。
- **Pricing**：horizontal carousel + plan-dot 導覽、billing toggle 動態更新價格。
- **FAQ**：桌機兩欄、手機單欄，紙條 accordion 微旋轉。

## Motion

- **基本動畫**：fade-up + paper-shadow lift on hover（短 0.3s ease）。
- **限制**：所有動畫一律加 `@media (prefers-reduced-motion: reduce)` guard。
- **禁止**：parallax 漂浮、長 Lottie、整頁滾動 hijack。

## Mobile（≤600px）Rules

行動版必須維持紙感，這些是硬規則：

- **不能用 `display: none` 隱藏拼貼便條 / dashboard 側欄 / hero decor 素材**。改用 `transform: scale()` + 重新定位。
- **`.collage-step` 用 grid layout**：badge 在左 38px 欄、h3+p 在右 1fr 欄。不要 inline-flex hack。
- **375 / 390 / 430px 都要實機檢查**，不能水平 scroll（除非是 dashboard-side 的 `overflow-x: auto` 內部）。
- **Hero 三段必須可見**：橘色 Create/Build/Sell 便條（縮 0.7）、相機素材（縮到 100-110px）、葉子素材（縮到 80-90px）。

## Acceptance Tests

驗收靠兩條：

1. **自動 acceptance test**：[`test/landing-collage.test.js`](test/landing-collage.test.js)，跑 `node --test test/landing-collage.test.js`。確認關鍵 class、文案、SEO、不該存在的舊 class 都符合。
2. **Visual Acceptance Criteria**：見 [docs/plans/2026-04-24-collage-landing-redesign.md#Visual-Acceptance-Criteria](docs/plans/2026-04-24-collage-landing-redesign.md)。三題不看 logo 也能識別品牌的 Review Questions：
   - 不看文案、只看輪廓，能不能一眼感覺到「手作拼貼 + 開店平台」？
   - 拿掉 logo 後，配色和版面還像同一個品牌嗎？
   - 手機版是否仍然保有紙張層次，而不是退化成普通單欄卡片頁？

## Anti-patterns

新增 / 修改設計時，明確避開這幾種：

- **「漸層 + 大圓 + 細線 icon」的 SaaS landing 美學** — 太通用、無記憶點。
- **「玻璃卡 + 模糊光暈」的 AI startup 風** — 跟手作敘事完全矛盾。
- **「全頁圓角 14-20px 卡片網格」** — 退化成 Notion / Linear lookalike，第一眼感受跟 PRODUCT.md 的 Brand Personality 衝突。
- **「Mobile breakpoint 大量 `display: none`」** — 行動版不能掉成單欄白卡。
- **「Caveat 套到中文」** — 沒 CJK glyph，fallback 醜。中文便條一律 Zen Maru Gothic。
