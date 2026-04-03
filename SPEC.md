# VOVOSnap — 專案規格書

## 產品定位

代購者的一站式快閃開店平台。拍照即上架，客人自助下單。

**核心場景：** 代購者在國外用手機拍照 → AI 辨識商品 → 一鍵上架 → 分享連結到 LINE 群 → 客人瀏覽下單 → 代購者看訂單清單。

**目標用戶：** 導遊、專職代購者、偶爾出國幫親友帶東西的人。

**設計原則：Mobile First。** 所有頁面以手機端為主要設計目標。桌面端不需額外適配，保持單欄佈局即可。

---

## 技術架構

| 層 | 技術 |
|----|------|
| Runtime | Cloudflare Workers (Edge) |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 (圖片) |
| AI | Google Gemini Vision API |
| Auth | Google OAuth + Firebase Phone Auth + Resend Email |
| Frontend | Vanilla JS (MPA, no framework) |
| Deploy | GitHub Actions → Cloudflare |

**多租戶模型：** 共享 D1 資料庫 + `store_id` 欄位隔離。

### Cloudflare 路由與資產處理（重要）

本專案採用「**Worker 優先**」模式處理請求，避免子網域首頁被靜態資產先攔截。

- `wrangler.toml` 必須設定：
  - `assets = { directory = "./public", binding = "ASSETS", run_worker_first = true }`
  - `routes` 同時包含：
    - `vovosnap.com/*`
    - `*.vovosnap.com/*`
- 目的：
  - 先由 `src/index.ts` 判斷租戶（`{slug}.vovosnap.com` 或 `/s/{slug}`）
  - 再由程式決定回傳租戶頁面或平台頁面
  - 靜態資產僅作為 Worker 內 fallback 提供

### 已知故障紀錄（2026-04）

症狀：`https://small.vovosnap.com/` 顯示平台首頁（Landing），未進入會員商店。  
根因：Cloudflare 設為資產優先時，`/` 會直接命中 `public/index.html`，Worker 租戶路由不會先執行。  
修正：切換為 `run_worker_first = true` 並確認 wildcard route 生效。  
部署後驗證：
- `https://{slug}.vovosnap.com/healthz` 應回 `{"ok":true,"service":"vovosnap"}`
- `https://{slug}.vovosnap.com/api/products` 與 `https://vovosnap.com/s/{slug}/api/products` 回傳同店資料
- 若仍看到舊首頁，先做 Cloudflare Cache Purge 再驗證

---

## 方案與限制

| 功能 | Free | Starter ($690/月) | Pro ($1,580/月) |
|------|------|---------|-----|
| 商品上架 | 平台管理員設定（預設 10） | 平台管理員設定（預設 50） | 無限 |
| AI 拍照辨識 | 5 次 | 無限 | 無限 |
| 手動上架 | ✓ | ✓ | ✓ |
| 訂單管理 | ✓ | ✓ | ✓ |
| 網站同步 | ✗（隱藏） | ✗（隱藏） | 需管理員開通 |
| 子網域 | ✗ | ✗ | ✓ |
| 店面模板 | ✗ | ✗ | ✓ |

方案商品上限由平台管理員在 `/platform-admin` 設定，變更後首頁方案卡片自動更新。

---

## 頁面結構

### 公開頁面
| 路徑 | 頁面 | 檔案 |
|------|------|------|
| `/` | 平台首頁（Landing page） | `public/index.html` |
| `/auth/google` | Google OAuth 登入 | `src/routes/admin/auth.ts` |
| `/onboarding` | 註冊 onboarding（email → phone → store setup） | `public/onboarding.html` |
| `/privacy.html` | 隱私權政策 | `public/privacy.html` |
| `/terms.html` | 服務條款 + 用戶合規使用條款 | `public/terms.html` |
| `/platform-admin` | 平台管理員後台 | `public/platform-admin.html` |

### 租戶頁面（路徑式 `/s/{slug}/`）
| 路徑 | 頁面 | 檔案 |
|------|------|------|
| `/s/{slug}/` | 商品列表（店面首頁） | `public/store.html` |
| `/s/{slug}/product?code=` | 商品詳情 | `public/product.html` |
| `/s/{slug}/request.html` | 需求單（購物車） | `public/request.html` |
| `/s/{slug}/success.html` | 下單成功 | `public/success.html` |
| `/s/{slug}/admin` | 店主後台 | `public/admin.html` |

### 租戶頁面（子網域 `{slug}.vovosnap.com`，Pro 方案）
同上路徑結構，但不帶 `/s/{slug}` 前綴。

---

## API 端點

### 公開 API
| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/plan-limits` | 方案商品上限（Landing page 用） |
| GET | `/healthz` | Health check |

### Auth API
| Method | Path | 說明 |
|--------|------|------|
| GET | `/auth/google` | Google OAuth redirect |
| GET | `/auth/google/callback` | OAuth callback |
| GET | `/auth/verify-email?token=` | Email 驗證 |
| POST | `/auth/resend-verification` | 重發驗證信 |
| POST | `/auth/verify-phone` | Firebase 手機驗證 |
| POST | `/auth/complete-onboarding` | 完成開通（設 slug/name） |
| GET | `/auth/me` | 當前 session store 資訊 |

### 租戶 Public API（`/s/{slug}/api/`）
| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/products` | 商品列表（分頁、篩選） |
| GET | `/api/product?code=` | 商品詳情 |
| GET | `/api/product-categories` | 分類列表 |
| GET | `/api/product-brands` | 品牌列表 |
| GET | `/api/pricing` | 定價設定 |
| POST | `/api/requirements` | 提交需求單 |
| GET | `/api/requirement?id=` | 需求單詳情 |
| GET | `/api/admin/popup-ads` | 彈窗廣告設定（公開讀取） |
| GET | `/api/admin/display-settings` | 顯示設定（公開讀取） |

### 租戶 Admin API（需登入）
| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/admin/products` | 新增商品 |
| POST | `/api/admin/products/toggle` | 上架/下架 |
| POST | `/api/admin/products/update` | 更新商品 |
| POST | `/api/admin/products/image-delete` | 刪除圖片 |
| GET/POST | `/api/admin/requirements` | 訂單管理 |
| GET/POST | `/api/admin/pricing` | 匯率設定 |
| GET/POST | `/api/admin/categories` | 分類管理 |
| POST | `/api/admin/recognize` | AI 拍照辨識 |
| GET/POST | `/api/admin/store-info` | 店面資訊（國家設定） |
| POST | `/api/admin/store-name` | 更新店面名稱 |
| GET/POST | `/api/admin/display-settings` | 商店顯示設定 |
| GET/POST | `/api/admin/popup-ads` | 彈窗廣告管理 |
| POST | `/api/admin/popup-ads/upload` | 上傳廣告圖片 |
| POST | `/api/admin/popup-ads/delete` | 刪除廣告圖片 |
| POST | `/admin/crawl` | 網站同步（Pro only） |

### 平台管理員 API
| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/platform-admin/login` | 管理員登入（email + 密碼） |
| GET | `/api/platform-admin/stores` | 所有店面列表 |
| PATCH | `/api/platform-admin/stores/:id` | 更新方案/啟停用 |
| GET/POST | `/api/platform-admin/api-keys` | Gemini API Key 管理 |
| GET/POST | `/api/platform-admin/system-prompt` | AI 辨識 System Prompt |
| GET/POST | `/api/platform-admin/plan-limits` | 方案商品上限設定 |

---

## 資料庫 Schema

### 核心表
- `stores` — 租戶（slug, name, email, google_id, phone, plan, country, onboarding_step）
- `store_sessions` — 登入 session（token, store_id, expires_at）
- `products` — 商品（store_id, title, brand, category, price, image_url, source_payload_json）
- `requirement_forms` — 需求單/訂單（store_id, customer, shipping, status）
- `requirement_items` — 訂單商品（form_id, product_id, quantity, price）
- `admin_orders` — 訂單追蹤（form_id, handled_by, external_ref）
- `app_settings` — 設定（store_id + key 複合主鍵。store_id=0 為平台級設定）
- `email_verifications` — Email 驗證 token

### 重要設定 key（app_settings）
| store_id | key | 說明 |
|----------|-----|------|
| per-store | `markup_jpy` | 加價（來源幣） |
| per-store | `jpy_to_twd` | 匯率 |
| per-store | `display_settings` | 商店顯示設定 JSON |
| per-store | `popup_ads` | 彈窗廣告 JSON |
| per-store | `ai_recognize_count` | AI 辨識使用次數 |
| 0 | `gemini_api_key_starter` | Starter 用 Gemini Key |
| 0 | `gemini_api_key_pro` | Pro 用 Gemini Key |
| 0 | `recognize_prompt` | AI 辨識 System Prompt |
| 0 | `plan_limits` | 方案商品上限 JSON |

---

## 國家設定

| 國家 | 代碼 | 幣別 | 預設匯率 (→TWD) | 預設加價 | 品名標籤 |
|------|------|------|----------------|---------|---------|
| 日本 | jp | JPY ¥ | 0.21 | 1000 | 日文品名 |
| 韓國 | kr | KRW ₩ | 0.024 | 5000 | 韓文品名 |
| 泰國 | th | THB ฿ | 1.01 | 50 | 泰文品名 |
| 台灣 | tw | TWD NT$ | 1 | 100 | 中文品名 |

切換國家時自動重置匯率和加價為國家預設值。

---

## 認證流程

### 註冊（Onboarding）
```
Google OAuth → 建立 store (onboarding_step=email_pending)
  → Resend 發驗證信 → 用戶點連結 → email_verified=1, step=phone_pending
  → Firebase 手機驗證 → phone_verified=1, step=store_setup
  → 填寫 slug + name → step=complete
```

### 登入
```
Google OAuth → 找到 store by google_id → 建立 session → 進入後台
```

### 平台管理員
```
Email (白名單: lovemage@gmail.com, aistorm0910@gmail.com) + 密碼 → HMAC signed token
```

---

## R2 儲存結構

```
{storeId}/products/{code}/{n}.webp     — 商品圖片
{storeId}/popup-ads/{timestamp}.webp   — 彈窗廣告圖片
```

所有圖片上傳自動轉換為 WebP 格式。

---

## 環境變數

### wrangler.toml [vars]（非敏感）
- `APP_URL` — 正式域名
- `MAIN_DOMAIN` — 主域名（子網域判斷用）
- `FIREBASE_PROJECT_ID` — Firebase 專案 ID

### Secrets（wrangler secret put）
- `GOOGLE_CLIENT_ID` — Google OAuth
- `GOOGLE_CLIENT_SECRET` — Google OAuth
- `RESEND_API_KEY` — Resend Email
- `PLATFORM_ADMIN_PASSWORD` — 平台管理員密碼

### .dev.vars（本機開發）
同上，加上 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`。

---

## 設計規範（Mobile First）

### 字體
- 系統字體：`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- 最小字體：13px（meta/hint）、14px（正文）、16px（input）

### 顏色
- 品牌主色：`#6366f1`（indigo）
- 正文：`#1a1a1a`
- 次要文字：`#666`、`#888`、`#999`
- 背景：`#fff`（卡片）、`#f8f9fa`（頁面）、`#fafafa`（區塊）
- 成功：`#22c55e`
- 危險：`#ef4444`
- 方案 badge：Free `#f3f4f6/#6b7280`、Starter `#dbeafe/#1d4ed8`、Pro `#ede9fe/#6d28d9`

### 間距
- 頁面 padding：16px-20px
- 卡片 padding：16px-24px
- 元素間距：8px-12px
- 區塊間距：24px-40px

### 按鈕
- 按鈕文字盡量簡化，最多兩個中文字元（例：儲存、編輯、網址、刪除、取消）
- 操作回饋用 icon 取代文字（例：複製成功顯示 `✓` 而非「已複製」）
- 不使用 emoji 作為按鈕內容

### 觸控
- 最小觸控區域：44×44px
- 按鈕 padding：10px 20px
- Input padding：10px 12px
- Checkbox/Radio：18×18px

### 導航
- 店主後台：底部 5 tab 導航（商品/拍照/同步/訂單/設定）
- 平台管理：底部 4 tab 導航（總覽/會員/API/設定）
- 商店前台：無導航列，浮動按鈕（需求單、分頁）

### 斷點
- 主要設計：375px（iPhone）
- 最小支援：320px
- 不需要桌面斷點適配（單欄即可）

---

## Blog 文章撰寫規範

若要撰寫新的 blog 文章，請參考 `/public/blog/first-time-daigou-guide.html` 作為內容範例與延伸基準。

### 範本文章
- 檔案：`/public/blog/first-time-daigou-guide.html`
- 標題：「第一次代購就上手：出國代購完整教學，拍照就能賺回機票錢」

### 文章結構要求
1. **SEO Meta**：title（含目標關鍵字）、meta description、OG tags、canonical URL
2. **Schema Markup**：Article + BreadcrumbList + FAQPage + HowTo（依內容選用）
3. **首圖**：16:9 情境圖，使用 Gemini `nano-banana-pro-preview` 生成，無文字，存放於 `/assets/images/blog/`
4. **H1 標題**：包含核心關鍵字，前 100 字帶入痛點場景
5. **目錄（TOC）**：文章超過 3 個段落時需加入
6. **Before/After 對比**：展示傳統流程 vs vovosnap 的效率差異
7. **步驟卡片**：使用 `.step-card` 元件呈現流程步驟
8. **中段插圖**：4 格漫畫或流程圖，使用 Gemini 生成，放置於文章中段
9. **Callout 提示**：重要資訊使用 `.callout`（綠色）或 `.callout-warn`（橘色）
10. **CTA**：文末使用 `.cta-box` 引導免費註冊
11. **FAQ**：文末 FAQ 區塊，需同時有 JSON-LD FAQPage schema 與可展開的 HTML
12. **延伸閱讀**：連結到其他相關文章

### 設計風格
- 沿用網站 CSS 變數（`--brand: #8A9A5B` 等）
- 最大寬度 720px，單欄閱讀排版
- 使用 Zen Maru Gothic 字型作為標題
- Mobile-first 響應式設計

### 圖片生成與格式
- 工具：Gemini API `nano-banana-pro-preview` 模型
- 首圖：寫實日系風格情境圖，無文字
- 流程圖：4 格漫畫風格，黑白 + 品牌綠色 (#8A9A5B) 點綴
- 存放路徑：`/public/assets/images/blog/`
- **圖片格式：一律使用 WebP**。Gemini 生成的 PNG/JPEG 須用 `cwebp -q 85` 轉換後刪除原檔，保持輕量化
- 命名規則：`{用途}-{主題}.webp`，例如 `hero-daigou.webp`、`manga-daigou-flow.webp`

### 新增文章流程
1. 在 `/public/blog/` 建立新的 HTML 文件
2. 在 `/public/assets/blog-data.js` 的 `BLOG_ARTICLES` 陣列新增文章資料
3. 在 `/public/sitemap.xml` 新增 `<url>` 條目
4. 文章頁底部引入 `<script src="/assets/blog-data.js"></script>`，延伸閱讀用空的 `<ul class="related-list"></ul>`，由 JS 自動填入（排除當前頁面）
5. Blog 列表頁用 `<div id="blog-article-list"></div>` 容器，由 JS 自動渲染所有文章卡片

### SEO 基礎設施
- **Sitemap**：`/public/sitemap.xml`（靜態，新增頁面時手動更新）
- **Robots.txt**：`/public/robots.txt`（允許 / 和 /blog/，禁止 admin 和 API 路徑）
- 新增 blog 文章時，sitemap 和 blog-data.js 都必須同步更新

### 核心訊息
- 痛點：出國時間有限，傳統上架流程太耗時
- 解決方案：vovosnap 是 LINE 群 / IG 的增強工具，不是取代品
- 動機：賺回機票錢
- 用戶只需做兩件事：拍照 + 邀請朋友加入群組
