# SEO 實作計畫（Phase 0 + Phase 1）

> 日期：2026-06-13
> 來源報告：[docs/plans/2026-06-13-seo-deep-research-findings.md](2026-06-13-seo-deep-research-findings.md)
> 指揮模型：fabel-5（orchestrator）
> 模型路由政策：planning→fabel-5、coding→sonnet-latest、git→haiku-latest、database→opus-4.5、review→fabel-5

---

## 0. 現況校正（2026-06-13 核對程式碼後，與研究報告的差異）

計畫執行前已實際核對 codebase，以下三點與報告描述不同，任務內容已據此調整：

1. **`public/robots.txt` 已存在**（報告列為缺口）。內容已含 Allow/Disallow 規則與 Sitemap 宣告。任務從「建立」改為「驗證 Worker 路由可正確回應 + 規則補強」。
2. **Blog 已有 4 篇文章**（`public/blog/` 下 `first-time-daigou-guide.html` 等）。「發佈第一篇部落格文」改為「新增日本藥妝代購攻略一篇 + 為既有 4 篇補 OG tags」。
3. **sitemap 雙源並存**：`public/sitemap.xml`（靜態）與 `src/index.ts:188-258`（動態生成）同時存在。需確認哪一個實際被 serve，避免靜態檔遮蔽動態 sitemap 導致租戶店頁不進索引。此為新增的 P0 任務。

其他報告所述缺口經核對屬實：

- `public/store.html` `<head>` 無 description/OG/placeholder meta（僅 title + viewport），確認初始 HTML SEO 空白。
- `public/index.html` 有 OG tags（L8-11）但無 `twitter:card`、無 JSON-LD。
- `src/router.ts:289` HTML 回應 `cache-control: no-cache`。
- `serveTenantHtml`（`src/router.ts:82`）已有 canonical（L109-112）、noindex（L115）、動態 OG 注入（L197、L255）可作為 JSON-LD 注入的擴充點。

---

## 1. 模型路由總表

| 工作類型 | 模型 | 本計畫中的用途 |
|---|---|---|
| 指揮/規劃 | fabel-5 | 任務拆解、階段排序、各階段產出驗證 |
| Coding | sonnet-latest | 全部程式碼修改與內容頁製作（本計畫主力） |
| Review | fabel-5 | 每個 Phase commit 前的 diff 審查 |
| Git | haiku-latest | 每個 Phase review 通過後的 commit |
| Database | opus-4.5 | **本計畫（Phase 0/1）無 schema 變更，不出動**。Phase 3 店主自訂 SEO 內容若需 D1 欄位再啟用 |

標準流程：Plan（fabel-5）→ Code（sonnet-latest）→ Review（fabel-5）→ 修正（sonnet-latest）→ Commit（haiku-latest）。Review 一律在 commit 之前。

---

## 2. Phase 0 — 上線前必須（預估 2-3 天）

### P0-1 sitemap 雙源釐清【新增，現況校正發現】

- **模型**：sonnet-latest（coding）
- **輸入**：`public/sitemap.xml`、`src/index.ts:188-258`、`src/router.ts` 路由順序
- **產出**：確認 `/sitemap.xml` 由動態 handler 回應；若靜態檔會遮蔽動態版，刪除 `public/sitemap.xml` 或調整路由優先序（刪檔屬破壞性操作，**執行前需使用者確認**）
- **驗收**：`curl https://vovosnap.com/sitemap.xml` 回應包含動態生成的租戶店頁/商品頁 URL，非僅靜態主頁清單
- **依賴**：無（可最先做）

### P0-2 robots.txt 驗證與補強

- **模型**：sonnet-latest（coding）
- **輸入**：`public/robots.txt`（已存在）、`src/router.ts` 靜態資產 serving 邏輯
- **產出**：確認 Worker 對 `/robots.txt` 回 200 與正確 content-type；比對現有 Disallow 清單是否涵蓋所有後台路徑（`login.html`、`billing-result.html` 等是否需要加入）；Sitemap 行與 P0-1 結論一致
- **驗收**：`curl -i https://vovosnap.com/robots.txt` 回 200、`text/plain`；Google robots.txt 測試工具無錯誤
- **依賴**：P0-1（Sitemap 宣告需一致）

### P0-3 store.html 初始 HTML 修復（placeholder meta tags）

- **模型**：sonnet-latest（coding）
- **輸入**：`public/store.html`（head 目前無 meta description/OG）、`src/router.ts` `serveTenantHtml`（L82 起，既有 OG 注入在 L197/L255）
- **產出**：
  - `store.html`、`product.html` `<head>` 加入 placeholder meta（`<meta name="description" content="__STORE_DESC__">` 之類的標記，或確保現行「無則注入」邏輯涵蓋 description）
  - `serveTenantHtml` 對 placeholder 做替換，未匹配租戶時 fallback 為通用文案，**不得**輸出 `__XXX__` 原樣字串
- **驗收**：`curl -s https://<tenant>.vovosnap.com/ | grep -E 'og:title|description'` 在「未執行 JS」狀態即可見到店名與描述；無殘留 placeholder 字串；非租戶路徑不受影響
- **依賴**：無（與 P0-1/P0-2 可並行）

### P0-4 Landing page JSON-LD（Organization + SoftwareApplication）

- **模型**：sonnet-latest（coding）
- **輸入**：`public/index.html`
- **產出**：`<head>` 內加入兩段 `<script type="application/ld+json">`：`Organization`（name、url、logo）與 `SoftwareApplication`（name、applicationCategory、offers、inLanguage: zh-Hant）
- **驗收**：Google Rich Results Test / Schema.org validator 0 error；JSON 可被 `JSON.parse` 解析
- **依賴**：無

### P0-5 商店/商品頁 JSON-LD（Product + BreadcrumbList 動態注入）

- **模型**：sonnet-latest（coding）
- **輸入**：`src/router.ts` `serveTenantHtml`（沿用既有動態 OG 注入點 L197-263）、商品資料來源（D1 查詢結果，已在 OG 注入流程中取得）
- **產出**：
  - 商品頁注入 `Product` schema（name、image、description、offers.price、priceCurrency、availability）
  - 商店頁與商品頁注入 `BreadcrumbList` schema
  - 所有動態值經 `escapeHtmlAttr` / JSON 序列化處理，防 XSS（沿用 repo 既有 escaping 慣例，參考 commit 9bcda24 的 review 重點）
- **驗收**：Rich Results Test 對實際租戶商品頁 0 error；price/currency 與頁面顯示一致；含特殊字元（引號、`</script>`）的商品名不會破壞 JSON 或造成注入
- **驗收（迴歸）**：既有 canonical / noindex / OG 注入行為不變
- **依賴**：P0-3（同檔案 `serveTenantHtml` 改動，順序執行避免衝突；P0-3 先行）

### P0-6 Landing page twitter:card + og:image

- **模型**：sonnet-latest（coding）
- **輸入**：`public/index.html`（OG 區塊 L8-11）、`public/assets/images/` 既有圖檔
- **產出**：`twitter:card`（summary_large_image）、`twitter:title`、`twitter:description`、`og:image`（絕對 URL，建議 1200x630；若無合適既有圖，以 logo 圖先行並在 plan 完成摘要中標註待補設計）
- **驗收**：Twitter/X Card Validator 與 Facebook Sharing Debugger 預覽正常；og:image 為絕對 URL 且回 200
- **依賴**：無

### P0-R Phase 0 Review

- **模型**：fabel-5（review）
- **輸入**：P0-1 ~ P0-6 的 diff（`git diff`，僅變更檔案）
- **產出**：審查報告（重點：JSON-LD 注入的 XSS 安全性、placeholder fallback 完整性、robots/sitemap 一致性）；修正項回送 sonnet-latest
- **驗收**：無 blocker 級 finding 殘留
- **依賴**：P0-1 ~ P0-6 全部完成

### P0-G Phase 0 Commit

- **模型**：haiku-latest（git）
- **產出**：1-2 個語意化 commit（沿用 repo 慣例，如 `feat(seo): ...`、`fix(seo): ...`）
- **驗收**：`git log` 訊息準確描述變更；working tree 乾淨（注意：目前 `public/admin.html`、`public/assets/app-list.js` 有與本計畫無關的未提交修改，**不得混入** SEO commit）
- **依賴**：P0-R 通過

---

## 3. Phase 1 — 上線後 2 週內

### P1-1 HTML cache-control 改善

- **模型**：sonnet-latest（coding）
- **輸入**：`src/router.ts:289`（`no-cache`）、`src/router.ts:333`（assets immutable，保持不動）、`src/index.ts:256`
- **產出**：公開頁（landing、store、product、blog、guide）改 `public, max-age=3600, stale-while-revalidate=86400`；後台/登入/結帳頁（admin、login、billing-result、success、order-history）**維持 no-cache**
- **驗收**：`curl -I` 各類頁面 header 符合上述分類；改價/改店名後最遲 1 小時反映（可接受）；後台頁無快取
- **依賴**：P0-G（基於已 commit 的 Phase 0 程式碼）

### P1-2 /guide/japan-cosmetics/ 日本藥妝代購指南頁

- **模型**：sonnet-latest（coding，含內容撰寫）
- **輸入**：研究報告差異化關鍵字方向（LINE 群代購、日本藥妝拍照上架）、`public/blog/` 既有頁面結構與樣式作為模板
- **產出**：`public/guide/japan-cosmetics/index.html`（或對應路由），繁中長尾內容 2000+ 字、完整 meta/OG/canonical、`Article` 或 `HowTo` JSON-LD、內部連結至 landing 與相關 blog 文
- **驗收**：頁面可被 `curl` 取得完整內容（非 JS 渲染）；meta/JSON-LD 驗證通過；已加入 sitemap（動態或靜態，依 P0-1 結論）；robots.txt 不阻擋
- **依賴**：P0-1（sitemap 機制確定）、P1-1（套用正確 cache header）

### P1-3 Blog 新文「日本藥妝代購攻略」

- **模型**：sonnet-latest（coding，含內容撰寫）
- **輸入**：`public/blog/` 既有 4 篇的 HTML 結構、`public/blog/index.html`
- **產出**：新文章 HTML、更新 blog index 列表、與 P1-2 指南頁互相內部連結（攻略=入門流量、指南=深度權威，內容不得重複到觸發 duplicate content）
- **驗收**：文章出現在 blog index 與 sitemap；與 P1-2 的關鍵字定位有區隔（fabel-5 review 時檢查）
- **依賴**：P1-2（先有指南頁才能正確內鏈）

### P1-4 Blog 頁 OG tags（既有 4 篇 + 新文）

- **模型**：sonnet-latest（coding）
- **輸入**：`public/blog/*.html`（5 篇 + index）
- **產出**：每篇靜態加入 og:title/og:description/og:type=article/og:url/og:image 與 twitter:card（blog 為靜態 HTML，直接寫死即可，不需 Worker 動態注入）
- **驗收**：每篇經 Sharing Debugger 預覽正常；og:url 與 canonical 一致
- **依賴**：P1-3（一次處理全部 blog 頁，含新文）

### P1-5 Google Search Console 設置 + 提交 sitemap

- **模型**：**使用者手動操作**（需 Google 帳號權限，模型無法代辦）；sonnet-latest 產出操作指引文件 + DNS/HTML 驗證所需的程式碼配合（如需在 `index.html` 加 verification meta tag）
- **產出**：GSC 屬性驗證完成、sitemap.xml 已提交、涵蓋率報告開始累積
- **驗收**：GSC 顯示 sitemap 狀態「成功」；「網頁」報告開始出現已建立索引頁面
- **依賴**：P0-G（robots/sitemap 已上線）

### P1-6 Core Web Vitals 監控

- **模型**：sonnet-latest（coding）
- **輸入**：`public/index.html`、`public/store.html`、`public/product.html`、既有 GA4 整合程式碼
- **產出**：以 `web-vitals` library（或等效輕量實作）收集 LCP/INP/CLS 並送 GA4 events；不得阻塞渲染（defer/dynamic import）
- **驗收**：GA4 DebugView 可見 web_vitals events；Lighthouse 分數不因監控腳本下降
- **依賴**：P0-G

### P1-R Phase 1 Review

- **模型**：fabel-5（review）
- **輸入**：P1-1 ~ P1-6 的 diff；內容頁額外審查關鍵字定位是否符合「長尾優先、不搶頭部詞」策略與 P1-2/P1-3 內容區隔
- **依賴**：P1-1 ~ P1-6
- **驗收**：無 blocker；內容無 thin content / duplicate 風險

### P1-G Phase 1 Commit

- **模型**：haiku-latest（git）
- **產出**：按主題分組 commit（cache、content、monitoring 各自獨立）
- **依賴**：P1-R 通過

---

## 4. 依賴順序總覽

```
Phase 0:
  P0-1 (sitemap 釐清) ──→ P0-2 (robots 驗證) ──┐
  P0-3 (store.html placeholder) ──→ P0-5 (JSON-LD 動態注入) ──┤
  P0-4 (landing JSON-LD) ─────────────────────────────────────┼──→ P0-R ──→ P0-G
  P0-6 (twitter:card) ────────────────────────────────────────┘

Phase 1（始於 P0-G）:
  P1-1 (cache) ──→ P1-2 (guide) ──→ P1-3 (blog 新文) ──→ P1-4 (blog OG) ──┐
  P1-5 (GSC, 使用者手動) ──────────────────────────────────────────────────┼──→ P1-R ──→ P1-G
  P1-6 (CWV 監控) ─────────────────────────────────────────────────────────┘
```

可並行組：P0-1/P0-3/P0-4/P0-6 四線並行；P1-5/P1-6 與 P1-2~P1-4 內容線並行。

---

## 5. Phase 2 / Phase 3 後續概要（不在本計畫執行範圍）

| 項目 | 預計模型 | 備註 |
|---|---|---|
| /tools/profit-calculator/ 利潤計算器 | sonnet-latest | 純前端互動頁 |
| /compare/manual-vs-auto/ 比較頁 | sonnet-latest | |
| 出國代購 / 韓泰指南內容 | sonnet-latest | |
| store.html inline styles 提取 | sonnet-latest | 與 SEO 弱相關，可獨立排程 |
| FAQPage schema、img alt 補全 | sonnet-latest | |
| 完整 Glossary、品類專題、用戶案例 | sonnet-latest | Phase 3 |
| hreflang（zh-Hant TW/HK 細分） | sonnet-latest | Phase 3，報告判定目前不需 ccTLD |
| **店主自訂 SEO 內容注入（商店描述/banner）** | **opus-4.5（schema）+ sonnet-latest（前後端）** | 若需在 D1 新增欄位（如 `stores.seo_description`），schema/migration 由 opus-4.5 負責，為本路由表中唯一 database 工作 |

---

## 6. 全域驗收標準（Phase 0+1 完成定義）

1. 任一租戶商店頁/商品頁的初始 HTML（curl，無 JS）含：title、description、canonical、OG、JSON-LD。
2. Rich Results Test 對 landing / store / product 三類頁 0 error。
3. robots.txt 與 sitemap.xml 一致且由正確來源 serve，GSC sitemap 狀態「成功」。
4. 公開頁 cache header 為 `public, max-age=3600, stale-while-revalidate=86400`；後台頁維持 no-cache 且 noindex。
5. /guide/japan-cosmetics/ 與新 blog 文上線、互相內鏈、進 sitemap。
6. GA4 可見 web_vitals events。
7. 所有變更經 fabel-5 review 後由 haiku-latest commit，無未審查程式碼進 main。

## 7. 風險與待使用者確認事項

- **P0-1 若需刪除 `public/sitemap.xml`**：破壞性操作，執行前須使用者確認。
- **og:image 素材**：若無 1200x630 圖，先以 logo 暫代，需業主後續提供正式 OG 圖。
- **P1-5 GSC**：需使用者以 Google 帳號操作，模型僅能產出指引。
- **快取後遺症**：P1-1 上線後，店家改商品資訊最慢 1 小時生效，需向業主說明（必要時對 product 頁縮短 max-age）。
