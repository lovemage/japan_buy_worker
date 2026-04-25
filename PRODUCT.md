# Product

## Register
mixed — 拆兩線：
- **marketing 頁面（`public/index.html`、`public/blog/*`、所有 landing / SEO 入口）= brand**
  設計就是產品，必須撐住「手作拼貼 + 開店平台」的品牌承諾，能用實體素材就用，動畫與裝飾值得多花預算。
- **app shell（`public/admin.html`、`public/onboarding.html`、`public/store.html`、`public/platform-admin.html`、`src/` 後台路由）= product**
  設計服務任務效率：資訊密度、CTA 清晰、極少裝飾、零模態優先、表單可達。

`/impeccable` 系列指令套到哪一檔，請依檔案落點挑 register。對應 register 後再對齊本檔下方共用的 personality / anti-references / principles。

## Users

我拍｜開店平台（VOVOSnap）的目標用戶是「想開始賣東西、但被電商系統嚇到的內容創作者」：

- **出國旅遊愛分享的代購新手**：出國時間有限、不想花時間排版商品頁、不想學電商系統。
- **內容創作者 / KOL / KOC**：已有受眾，但缺一個低摩擦把內容變成成交的工具。
- **小型賣家 / 一人公司**：不想養工程師、不想學 Shopify，希望「拍照就能開店」。

**Job-to-be-done**：把「我手上有商品」變成「客人下單成交」，中間繁瑣的上架、文案、規格、匯率、回覆通通讓 AI 處理。

**核心痛點**：時間有限 + 上架繁瑣（不是手續費）。訴求是「效率提升 10 倍」。

## Product Purpose

讓創作者一鍵開店，從內容到成交全自動：

1. 拍照 / 上傳商品 → AI 自動辨識
2. AI 生成完整商品頁（文案 + 規格 + 匯率換算）
3. 一鍵上架到專屬店舖
4. 自動導購、智能回覆、安全收款

**Success criteria**：
- 第一次到站的創作者能在 5 分鐘內理解「拍照就能開始」的承諾。
- 試用後 1 分鐘內完成第一筆商品上架。
- 跨 desktop / mobile（375 / 390 / 430px）視覺品牌調性一致。
- Pricing carousel、FAQ accordion、auth 狀態切換、GA tracking 在所有變動中不能 regress。

## Brand Personality

- **三字定義**：親近、手作、可靠。
- **聲音**：像一個有經驗的朋友幫你規劃出國代購流程，不像冷冰冰的 SaaS 系統。
- **語氣**：直接、口語、舉具體例子（「拍張照」、「逛街的同時訂單已經排好」）。
- **情緒目標**：第一眼讓人覺得「這個工具懂我」、「不像會很難」。
- **不要的情緒**：科技優越感、「企業級」距離感、創投 deck 美學。

## Anti-references

明確不要做成這幾種樣子：

- **玻璃擬態 / Glassmorphism / 霓虹 / 藍紫科技漸層** — 太「AI startup」、太冷。
- **大面積柔焦光暈 / 巨大圓形 hero 背景圖** — 通用 Notion / Linear lookalike，無記憶點。
- **一致圓角白卡片網格** — 退化成「普通 SaaS landing page」就失去拼貼風的意義。
- **創投 deck 風（漸層紫藍 + 大數字 + 灰白卡）** — 跟創作者 / 旅遊 / 拍照的情緒完全錯配。
- **Apple-grade minimalism**（極簡 + 大量留白 + 無裝飾）— 沒有手作感、不適合代購工具。
- **電商系統感**（Shopify / WooCommerce 後台 dashboard 美學） — 顯得門檻高，跟「拍照就能開始」的承諾矛盾。

## Design Principles

1. **Handmade SaaS**：拼貼、撕紙、膠帶、便條紙是品牌記憶點，但底下仍是嚴謹的 web app。第一屏要同時透露「親近的手作感」+「可靠的工具」兩種訊號。
2. **Camera shop, not a startup**：視覺世界觀是「桌面剪貼簿 + 旅行筆記」，不是「AI startup landing」。素材以相機、葉子、便條、拍立得為主，避開抽象幾何 / 漸層光暈。
3. **Brand colors live in the foreground**：橘色 + 深藍必須出現在每屏的關鍵位置（CTA、撕紙橫幅、便條），不是只剩米白底加小面積點綴。
4. **Mobile keeps the paper feel**：行動版不能退化成「單欄白卡 + 文字」。便條 / 紙紋 / 撕紙底都要 scale 保留，375 / 390 / 430px 都能看到拼貼層次。
5. **Real assets over CSS imitation**：能用實體素材（相機 / 花葉 / Before-After 拼貼）就用；CSS clip-path 撕紙是輔助，不是主角。

## Accessibility & Inclusion

- **WCAG AA 文字對比**：橘色 / 深藍對 #fff8ec / #f6efe2 的對比都已驗過 4.5:1 以上。
- **Reduced motion**：`@media (prefers-reduced-motion: reduce)` 已套在 marquee 跟 hero 動畫上。新增動畫一律加這個 guard。
- **語意 HTML**：保留 `<section>` / `<h2>` / `<button>` / `aria-label` 等，不為了視覺擠壓 markup。
- **鍵盤可達**：所有 CTA 按鈕、FAQ accordion、pricing carousel 都需要 tab focus 順暢。
- **alt 文字**：所有 meaningful 圖片給有描述的 alt；裝飾性拼貼素材（相機 / 花葉）用 `alt="" aria-hidden="true"`。
- **手機觸控目標**：CTA 最低 44px 高、FAQ 問題列至少 44px。
