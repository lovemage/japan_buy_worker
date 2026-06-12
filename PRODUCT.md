# Product

## Register
mixed — 拆兩線：
- **marketing 頁面（`public/index.html`、`public/blog/*`、所有 landing / SEO 入口）= brand**
  設計就是產品，品牌承諾是「60 秒完成開店」。每個畫面要同時傳達效率與親和感。
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

- **三字定義**：聰明、快捷、現代感。
- **聲音**：像一個懂科技的朋友幫你省去麻煩的流程，效率導向但不冷漠。
- **語氣**：直接、口語、舉具體例子（「拍張照」、「60 秒上架」、「逛街同時訂單自動跑」）。
- **情緒目標**：第一眼讓人覺得「這個工具很快，我馬上能上手」。
- **不要的情緒**：科技優越感、「企業級」距離感、DIY / 手作的土氣感、電商後台的笨重感。

## Anti-references

明確不要做成這幾種樣子：

- **璀璨 AI startup（霓虹 / 漸層紫藍 + 光暈）** — 冷色調，跟創作者 / 旅遊情緒完全錯配。
- **電商系統感（Shopify / WooCommerce 後台美學）** — 顯得門檻高，跟「60 秒開店」的承諾矛盾。
- **Apple-grade 極簡（大量留白 + 零裝飾）** — 沒有個性，記憶點全靠文案，視覺過於平淡。
- **通用 SaaS landing（Notion / Linear lookalike）** — 白底 + 一致灰卡 + 小面積橘 accent，這就是目前最危險的滑坡方向。
- **大面積柔焦光暈 / 巨大圓形 hero blob** — 無記憶點的通用科技背景。
- **創投 deck 風（漸層紫藍 + 大數字 + 灰白卡）** — 錯誤的受眾訊號。

## Design Principles

1. **速度是設計語言**：每個畫面應在 3 秒內傳達「這個工具很快」——不靠動畫技巧，靠決斷的視覺層次、清楚的 CTA 和具體的數字（60 秒、4 步驟）。
2. **橘色在決策點出現**：品牌橘是行動訊號，用在 CTA、進度、關鍵數字。不裝飾性散佈，不用在次要文字。橘色現身 = 「這裡可以做什麼」。
3. **微量手作感，不是風格**：一到兩個輕量的手作細節（informal 插圖、略微不規則的排版節奏）讓視覺有記憶點，但整體框架維持乾淨。手作感是調味料，不是菜系。
4. **給創作者，不給電商系統用戶**：視覺語言應讓 IG / TikTok 賣家感覺「這和我在用的 app 是同一個世界」，不像 Shopify admin。
5. **行動版是主要畫布**：產品在逛街途中使用，手機體驗是真正的產品。桌機是輔助。375 / 390 / 430px 不能降格為單欄白卡頁。

## Accessibility & Inclusion

- **WCAG AA 文字對比**：主文字 `#14181f` 對白底對比遠超 4.5:1。橘色 `#f26b1d` 只用在大型 CTA（≥18px bold），需確保對比達 3:1。
- **Reduced motion**：`@media (prefers-reduced-motion: reduce)` 所有動畫都要加 guard。
- **語意 HTML**：保留 `<section>` / `<h2>` / `<button>` / `aria-label`，不為了視覺擠壓 markup。
- **鍵盤可達**：所有 CTA 按鈕、FAQ accordion、pricing carousel 都需要 tab focus 順暢。
- **alt 文字**：meaningful 圖片給有描述的 alt；純裝飾元素用 `alt="" aria-hidden="true"`。
- **手機觸控目標**：CTA 最低 44px 高、FAQ 問題列至少 44px。
