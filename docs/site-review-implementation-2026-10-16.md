# 繁中網站優化紀錄

依據 `site-review-2026-10-16.md`。本次為程式與內容修改，尚未推送或部署，未修改正式資料庫或 Cloudflare 帳戶設定。

## 已實作

- 依報告第七節新增三篇繁中 P1 文章：`line-group-order-link-guide`、`instagram-story-product-link-guide`、`korea-daigou-beginner-guide`。包含實作步驟、範本或計算例、FAQ 與官方資料來源；核對韓國 KRW→TWD 設定，明示預設匯率非即時報價及切換國家的定價影響。
- 三篇加入部落格資料表、靜態預渲染索引、文章內部連結、Article／BreadcrumbList／FAQPage、官網 sitemap 與 llms.txt；更新報告與 SEO 關鍵字文件的完成狀態。簡中未新增文章。
- 修正日圓換算方向：1,280 ÷ 4.62 約 NT$277，加價 15% 約 NT$319；說明匯率為假設，加價率不同於毛利率。同步更新文章修改日期與 sitemap lastmod。
- 首頁、FAQ 結構化資料、about 與 llms.txt 統一 PAYUNi 說明：Pro／Pro+ 串接賣家自有帳號，需金流業者審核，平台 0% 抽成不包含第三方費用。舊的動態 FAQ 不再覆蓋金流說明。
- 移除首頁未驗證的 1000+ 賣家數；以免費方案商品額度與平台抽成等可核對資訊呈現。首頁 CTA 與教學入口改為一般賣家情境。
- 首頁示範連結改至 `/demo/`。採既有童裝示意圖、中文品名、完整價格與可操作尺寸選項，明示不接受訂購、不收集個資；展示頁 noindex。
- 舊文章 title 統一使用「我拍 VOVOSnap」。首頁中文字型請求由 6 個字重減為 3 個。
- HTTP 公開頁與 www 使用單次 301 導向 HTTPS 主網址；非 GET/HEAD 使用 308 保留付款通知的 method/body。本機網域不強制 HTTPS。
- Worker 統一加入 HSTS、nosniff、SAMEORIGIN、Referrer-Policy 與基本 CSP；CSP 不限制既有付款表單目的地或 inline scripts。HSTS 不加入 includeSubDomains 或 preload。
- 官網 `/sitemap.xml` 僅收錄官網與教學；`/sitemap-stores.xml` 收錄主網域的合格店舖／商品。Pro+ 子網域有自己的 `/sitemap.xml` 與 robots sitemap 宣告；到期方案使用有效方案判定。
- 商品 title 改為「商品名｜店名」；OG 優先商品圖、描述。店舖缺少 banner/logo 時使用商品圖；Pro+ 路徑別名 canonical 指向正式子網域。
- 商品頁不顯示零顏色數，也不把與分類相同的值重複當品牌。缺少或超過方案可見上限的商品回傳 404、noindex。
- 實際使用 Cache API 快取匿名店面 HTML 60 秒、sitemap 300 秒；登入 Cookie、Authorization、付款、後台與 API 均不進入此快取。快取鍵保留 host、path、商品 code，避免租戶混用；快取失敗回到原始渲染。店面設定查詢由多次合併為一次。

## 索引門檻與限制

商品需有至少 2 字的中文品名欄位、40 字描述、可用格式圖片網址及正的有限售價，且未命中敏感詞，才允許索引／加入商品 sitemap。其他商品仍可瀏覽，回傳 noindex, follow。

店舖需有描述、至少一項合格商品，且檢查到的公開商品沒有敏感詞。最多檢查每店最新 1,000 項可見商品；達此上限的店面保守 noindex，商品 sitemap 只納入已檢查的合格商品。未來需完整涵蓋超大店舖時，加入分頁 sitemap 與批次品質評分。

敏感詞涵蓋醫藥品、保健食品、菸酒與部分宗教服務。這是搜尋曝光保護，可能誤判或漏判，**不是上架審核、禁售執法或法律判定**。未刪除既有店舖／商品，亦未將敏感商品自動下架。正式上架審核仍需類別政策、人工複核與申訴流程。

匿名 HTML 可能在 60 秒內反映舊內容，sitemap 最長 300 秒；下單與付款 API 不使用此快取。尚未以正式流量量測海外 TTFB，不能宣稱已低於 1 秒。

## 驗證

- 全套 Node 測試 309 項通過，含新增的 11 項行為／整合測試與三篇文章的索引中繼資料檢查。
- 使用隔離 SQLite 與完整 Worker 路由驗證 host、到期方案、商品額度、title escaping、OG 圖片、價格與 noindex/404。
- Wrangler dry-run 建置通過；未部署。仍有既有的 `src/jobs/crawl-products.ts` 引用 `node:child_process` 相容性警告，本次未變更爬蟲或 compatibility flags。
- agent-browser 本機檢查展示尺寸切換、加入清單回饋與首頁 FAQ；375、390、430、1440px 無水平溢出，無前端執行錯誤。開發預覽使用 `npx wrangler dev --local --host localhost --port 8791`，避免 Wrangler 以正式網域代理本機請求而觸發 HTTPS 轉址。
- 新增的三篇文章與部落格索引另於 390、1440px 檢查，圖片載入正常、無水平溢出；FAQ 可展開，無前端執行錯誤。檢查三篇可見 FAQ 與 JSON-LD 問答一致、文內文章連結與目錄錨點有效，靜態索引重建檢查通過。

## 後續

簡中只建立 `zh-hans-expansion-plan.md`，不實作。新金流、多幣別、法規條款、正式店舖內容清理與完整上架審核仍需後續工作。部署後須抽查實際 HTTPS／www 回應與快取效果；若 Cloudflare 規則比 Worker 更早處理請求，須在帳戶層調整對應規則。
