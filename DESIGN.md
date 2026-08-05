# Design

> 我拍｜開店平台 — 設計系統文件（2026 年 6 月，優雅暖調改版）。
> 對應策略脈絡見 [PRODUCT.md](./PRODUCT.md)。
>
> **注意**：此文件以 `public/index.html`（landing page）為基準。
> 其他頁面（onboarding、store、admin）設計系統仍待對齊。

## Aesthetic Concept

**優雅暖調（Elegant Warmth）— 明朝體 + 米杏 + 蜜橘。**

參考「優雅獨立站」式的女性向質感 landing：米杏色底、明朝體（Noto Serif TC）寬字距標題、
蜜橘色決策點、柔和的 quiet-luxury 攝影素材（gpt-image-2 生成）、櫻花元素貫穿。
整體感受：親切、有質感、不像「另一個 SaaS」。

## Color Tokens

Token 定義在 `public/index.html` inline `<style>` 的 `:root`：

| Token | Value | Role |
|---|---|---|
| `--ink` | `#322d27` | 主文字（暖深棕灰） |
| `--muted` | `#6f655a` | 次要文字 |
| `--faint` | `#a3978a` | 弱文字、裝飾 |
| `--bg` | `#faf6ef` | 米杏主底 |
| `--bg-alt` | `#f4ecdf` | 深一階米杏，交替分區 |
| `--card` | `#fffdf9` | 暖白卡片 |
| `--blush` | `#f7e7da` | 蜜桃粉底面（hero radial、final CTA） |
| `--line` | `#e9ddcb` | 邊線 |
| `--orange` | `#e86b2c` | 品牌蜜橘：CTA、active、強調 |
| `--orange-dark` | `#c9531a` | CTA hover |
| `--orange-text` | `#b54d15` | 小字級橘（對米杏底 ≥4.5:1） |
| `--orange-soft` | `#fbeadc` | 橘色淡底（icon 圓底） |
| `--radius` | `16px` | 卡片圓角 |
| `--shadow` | `0 10px 30px rgba(86,62,36,.08)` | 暖調卡片陰影 |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | 全站 easing |

**配色原則**：
- 橘色是決策訊號：CTA、active 狀態、價格、推薦 badge。小字級一律用 `--orange-text` 保對比。
- 底色節奏：`--bg` ↔ `--bg-alt` 交替；hero 用 blush radial、final CTA 用 bg→blush 漸層。

## Typography

- **標題字體**：`Noto Serif TC`（明朝體）600/700/900。所有 h1/h2/h3、plan 名稱、價格、VS 圓章、step 編號。
- **標題字距**：`.06em`–`.08em` 寬字距（參考圖的優雅關鍵）；kicker 用 `.28em`。
- **內文字體**：`Noto Sans TC` 400/500/700，16px，line-height 1.8。
- **Hero h1**：`clamp(34px, 5vw, 52px)`、weight 700、line-height 1.45；`em` = `--orange-text` + SVG 底線描畫。
- **Section title**：`clamp(25px, 3.6vw, 36px)`、weight 700。
- **Kicker**：襯線 14px + 兩側 28px 細橘線（取代膠囊 badge）。

## Shape & Elevation

- **卡片**：16px 圓角、1px `--line` 邊、暖調柔陰影。
- **按鈕**：全部 pill（`border-radius: 999px`）。primary = 橘底白字 + 橘暈陰影；ghost = 橘細框透明底。
- **Hero demo**：瀏覽器窗框卡（白底 12px padding、三個小圓點 bar、20px 圓角），內含 1:1 三幕 crossfade。
- **推薦方案卡**：1.5px 橘框 + 頂部「推薦」pill badge。

## Asset Inventory（gpt-image-2 生成，2026-06）

| Asset | 路徑 | 用途 |
|---|---|---|
| Hero step 1-3 | `assets/images/hero/step1-capture / step2-recognize / step3-listing.webp` | 三幕輪播：拍照→AI 辨識→上架完成（同場景連續，quiet-luxury 暖調） |
| 櫻花枝 | `assets/images/hero/sakura-branch.webp` | hero 右上裝飾（透明背景，mobile 縮 150-200px 保留） |
| Final CTA 場景 | `assets/images/hero/cta-scene.webp` | 牛皮紙包裹 + 緞帶 + 櫻花，final CTA 右欄 |
| Seller avatars | `assets/images/creator-avatar-01~04.webp` | hero proof 賣家頭像（沿用） |
| 原始 PNG | `tmp/gen/*.png` | 生成原檔（未進版控） |

再生成素材時的調性 prompt 關鍵詞：quiet luxury, feminine, warm ivory / cream / blush pink / muted apricot orange, soft window light, premium product-photography realism。

## Motion（優雅 SVG 動畫）

- **櫻花瓣飄落**：hero 內 6 片 SVG 花瓣，13–19s linear loop、交錯 delay、旋轉+左右擺，`pointer-events:none`。
- **標題底線描畫**：h1 em 下 SVG path，`stroke-dashoffset` 1.1s 描畫，延遲 0.5s。
- **Scroll reveal**：`data-reveal` + IntersectionObserver，同容器 70ms stagger；JS 啟用才隱藏（無 JS 預設可見），另有 4s 全部顯示的保險 timer。
- **三幕 crossfade**：0.6s opacity（沿用既有 JS 輪播）。
- **Reduced motion**：花瓣隱藏、描畫直接完成、reveal 直接顯示、crossfade 停在完成態。所有新動畫都在 guard 內。
- **禁止**：parallax、scroll hijack、bounce/elastic。

## Layout Patterns

- 容器 `--maxw: 1080px`；section padding 桌機 96px。
- **Hero**：`1.02fr / 0.98fr` 雙欄，≤860px 單欄；櫻花枝絕對定位右上（z-index 1，內容 z-index 2）。
- **痛點對比**：`1fr 120px 1fr`，中央 96px 圓形 VS 章（虛線橘框、襯線字）；mobile 縱向堆疊、圓章置中。
- **FAQ**：`#faq-list` 兩欄 grid（`align-items:start`），≤720px 單欄。
- **Final CTA**：`1.05fr / 0.95fr` 文字+圖片雙欄，圖片微旋轉 1.2°；mobile 堆疊置中。
- **Pricing**：carousel 機制不變（scroll-snap + dots + drag），样式改暖卡 + pill toggle。

## Mobile（≤480px）Rules

- 櫻花枝縮至 150px 保留（不 `display:none`）；花瓣減 2 片。
- 無水平 scroll（375/390/430 已驗證）。
- CTA pill 堆疊全寬、觸控目標 ≥44px。
- proof stats 改 3 欄 grid；steps/features 單欄。

## Acceptance

- `node --test test/landing.test.js` — 文案、GA、pricing 行為、API 串接、reduced-motion 必須全過。
- 視覺驗收：不看 logo 能否感受「優雅、溫暖、女性向質感」；橘色只出現在決策點；明朝體標題字距是否保持。

## Anti-patterns（設計禁區）

- **漸層紫藍 + 光暈 + 玻璃卡**：AI startup 審美，與暖調敘事矛盾。
- **冷灰白 SaaS 卡網格**：上一版的滑坡方向，已被本次改版取代。
- **明朝體用負字距或擠壓**：寬字距是這套系統的識別核心。
- **橘色散佈裝飾**：橘色只在 CTA / active / 價格 / 強調。
- **Mobile 隱藏裝飾素材**：縮放重定位，不 `display:none`（花瓣數量例外）。
