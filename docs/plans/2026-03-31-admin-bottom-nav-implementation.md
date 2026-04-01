# Admin 底部導航 SPA 重構 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 將 Admin 介面重構為底部導航 SPA（5 個 Tab），新增分類管理、帳號密碼、R2 圖片儲存，同步頁面改用 loading bar，拍照上架支援多圖 WebP。

**Architecture:** 單一 `admin.html` 以 `data-tab` 切換 5 個 `<section>`，每 Tab 獨立 JS 模組。後端新增 categories CRUD、change-password、R2 upload route。圖片前端轉 WebP 後上傳 R2。

**Tech Stack:** Cloudflare Workers, D1, R2, Gemini API, Vanilla JS (MPA), WebP (canvas)

---

### Task 1: R2 Bucket 建立 + wrangler.toml 設定

**Files:**
- Modify: `workers/wrangler.toml`

**Step 1: 建立 R2 bucket**

```bash
cd workers && npx wrangler r2 bucket create japan-buy-images
```

**Step 2: 在 wrangler.toml 加入 R2 binding**

在 `[[d1_databases]]` 區塊後加入：

```toml
[[r2_buckets]]
binding = "IMAGES"
bucket_name = "japan-buy-images"
```

**Step 3: 更新 Env type**

在 `workers/src/index.ts` 的 `Env` type 加入：

```typescript
IMAGES?: R2Bucket;
```

**Step 4: Commit**

```bash
git add wrangler.toml src/index.ts
git commit -m "chore: add R2 bucket for product images"
```

---

### Task 2: Auth 改造 — 密碼存 app_settings

**Files:**
- Modify: `workers/src/routes/admin/auth.ts`
- Create: `workers/src/routes/admin/password.ts`
- Modify: `workers/src/index.ts`

**Step 1: 修改 auth.ts 讓登入讀取 app_settings 密碼**

改寫 `auth.ts`，`handleAdminLogin` 接收 `env` 參數（含 DB），登入時先從 `app_settings` 讀 `admin_password`，若無則 fallback 到 hardcode 預設值 `"Curry"`：

```typescript
import type { D1DatabaseLike } from "../../types/d1";

export const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_USER = "admin";
const DEFAULT_ADMIN_PASS = "Curry";
const ADMIN_COOKIE_VALUE = "ok";

type Env = {
  DB: D1DatabaseLike;
};

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  return header
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const idx = item.indexOf("=");
      if (idx <= 0) return acc;
      acc[decodeURIComponent(item.slice(0, idx).trim())] = decodeURIComponent(item.slice(idx + 1).trim());
      return acc;
    }, {});
}

export function isAdminAuthorized(request: Request): boolean {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return cookies[ADMIN_COOKIE_NAME] === ADMIN_COOKIE_VALUE;
}

async function getAdminPassword(db: D1DatabaseLike): Promise<string> {
  try {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE key = 'admin_password'")
      .first<{ value: string }>();
    return row?.value || DEFAULT_ADMIN_PASS;
  } catch {
    return DEFAULT_ADMIN_PASS;
  }
}

export async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const username = (body.username || "").trim();
  const password = (body.password || "").trim();
  const adminPass = await getAdminPassword(env.DB);

  if (username !== ADMIN_USER || password !== adminPass) {
    return new Response(JSON.stringify({ ok: false, error: "帳號或密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `${ADMIN_COOKIE_NAME}=${ADMIN_COOKIE_VALUE}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    },
  });
}

export async function handleAdminLogout(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
}
```

**Step 2: 建立 password.ts — 更改密碼 route**

建立 `workers/src/routes/admin/password.ts`：

```typescript
import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
};

const DEFAULT_ADMIN_PASS = "Curry";

export async function handleAdminChangePassword(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: { oldPassword?: string; newPassword?: string };
  try {
    body = (await request.json()) as { oldPassword?: string; newPassword?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const oldPassword = (body.oldPassword || "").trim();
  const newPassword = (body.newPassword || "").trim();

  if (!oldPassword || !newPassword) {
    return new Response(JSON.stringify({ ok: false, error: "舊密碼和新密碼為必填" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  if (newPassword.length < 4) {
    return new Response(JSON.stringify({ ok: false, error: "新密碼至少 4 個字元" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  // 讀取目前密碼
  let currentPass = DEFAULT_ADMIN_PASS;
  try {
    const row = await env.DB
      .prepare("SELECT value FROM app_settings WHERE key = 'admin_password'")
      .first<{ value: string }>();
    if (row?.value) currentPass = row.value;
  } catch { /* fallback to default */ }

  if (oldPassword !== currentPass) {
    return new Response(JSON.stringify({ ok: false, error: "舊密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  await env.DB
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_password', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(newPassword)
    .run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}
```

**Step 3: 更新 index.ts**

- `handleAdminLogin` 調用改為 `handleAdminLogin(request, env)`（加 env 參數）
- 新增 `import { handleAdminChangePassword } from "./routes/admin/password";`
- 新增 route：

```typescript
if (url.pathname === "/api/admin/change-password") {
  if (!isAdmin) return json({ ok: false, error: "Unauthorized" }, 401);
  return handleAdminChangePassword(request, env);
}
```

**Step 4: Commit**

```bash
git add src/routes/admin/auth.ts src/routes/admin/password.ts src/index.ts
git commit -m "feat: store admin password in app_settings with change-password API"
```

---

### Task 3: 分類管理 API

**Files:**
- Create: `workers/src/routes/admin/categories.ts`
- Modify: `workers/src/index.ts`

**Step 1: 建立 categories.ts**

```typescript
import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
};

export async function handleAdminCategories(
  request: Request,
  env: Env
): Promise<Response> {
  // GET — 列出所有分類 + 商品數量
  if (request.method === "GET") {
    const rows = await env.DB
      .prepare(
        `SELECT category, COUNT(1) as total
         FROM products
         WHERE is_active = 1 AND category IS NOT NULL AND TRIM(category) != ''
         GROUP BY category
         ORDER BY total DESC, category ASC`
      )
      .all<{ category: string; total: number }>();
    const categories = Array.isArray(rows?.results)
      ? rows.results.map((r) => ({ name: r.category, total: r.total }))
      : [];
    return new Response(JSON.stringify({ ok: true, categories }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  // POST — 新增分類（插入一個 placeholder 或直接回傳成功）
  if (request.method === "POST") {
    let body: { name?: string };
    try { body = (await request.json()) as { name?: string }; }
    catch { return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json" } }); }

    const name = (body.name || "").trim();
    if (!name) {
      return new Response(JSON.stringify({ ok: false, error: "分類名稱為必填" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    // 儲存到 app_settings 作為分類清單（JSON array）
    let existingList: string[] = [];
    try {
      const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'custom_categories'").first<{ value: string }>();
      if (row?.value) existingList = JSON.parse(row.value);
    } catch { /* empty */ }

    if (!existingList.includes(name)) {
      existingList.push(name);
      await env.DB
        .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('custom_categories', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(JSON.stringify(existingList))
        .run();
    }

    return new Response(JSON.stringify({ ok: true, name }), {
      status: 201, headers: { "content-type": "application/json" },
    });
  }

  // PATCH — 重新命名分類（批次更新 products）
  if (request.method === "PATCH") {
    let body: { oldName?: string; newName?: string };
    try { body = (await request.json()) as { oldName?: string; newName?: string }; }
    catch { return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json" } }); }

    const oldName = (body.oldName || "").trim();
    const newName = (body.newName || "").trim();
    if (!oldName || !newName) {
      return new Response(JSON.stringify({ ok: false, error: "oldName 和 newName 為必填" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const result = await env.DB
      .prepare("UPDATE products SET category = ?, updated_at = datetime('now') WHERE category = ?")
      .bind(newName, oldName)
      .run();

    // 更新 custom_categories 清單
    try {
      const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'custom_categories'").first<{ value: string }>();
      if (row?.value) {
        let list: string[] = JSON.parse(row.value);
        list = list.map((c) => c === oldName ? newName : c);
        await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('custom_categories', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(JSON.stringify(list)).run();
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ ok: true, updated: result?.meta?.changes || 0 }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  // DELETE — 刪除分類（商品歸「未分類」）
  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "").trim();
    if (!name) {
      return new Response(JSON.stringify({ ok: false, error: "name 為必填" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    await env.DB
      .prepare("UPDATE products SET category = NULL, updated_at = datetime('now') WHERE category = ?")
      .bind(name)
      .run();

    // 從 custom_categories 清單移除
    try {
      const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'custom_categories'").first<{ value: string }>();
      if (row?.value) {
        const list: string[] = JSON.parse(row.value).filter((c: string) => c !== name);
        await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('custom_categories', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(JSON.stringify(list)).run();
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
    status: 405, headers: { "content-type": "application/json" },
  });
}
```

**Step 2: 在 index.ts 註冊 route**

```typescript
import { handleAdminCategories } from "./routes/admin/categories";

if (url.pathname === "/api/admin/categories") {
  if (!isAdmin) return json({ ok: false, error: "Unauthorized" }, 401);
  return handleAdminCategories(request, env);
}
```

**Step 3: Commit**

```bash
git add src/routes/admin/categories.ts src/index.ts
git commit -m "feat: add category CRUD API"
```

---

### Task 4: Products API 改造 — 多圖 + R2 上傳

**Files:**
- Modify: `workers/src/routes/admin/products.ts`
- Modify: `workers/src/index.ts` (Env type)

**Step 1: 改寫 products.ts 支援多圖 R2 上傳**

```typescript
import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
  IMAGES?: R2Bucket;
};

type ManualProductRequest = {
  titleJa: string;
  titleZhTw: string;
  brand: string;
  category: string;
  priceJpyTaxIn: number | null;
  description: string;
  specs: Record<string, string>;
  sizeOptions: string[];
  colorOptions: string[];
  images: string[]; // base64 webp images
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function handleAdminProducts(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: ManualProductRequest;
  try {
    body = (await request.json()) as ManualProductRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const titleJa = (body.titleJa || "").trim();
  const titleZhTw = (body.titleZhTw || "").trim();
  if (!titleJa && !titleZhTw) {
    return new Response(
      JSON.stringify({ ok: false, error: "商品名稱（日文或中文）為必填" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const code = `manual-${Date.now()}`;
  const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];

  // 上傳圖片到 R2
  const imageUrls: string[] = [];
  if (env.IMAGES && images.length > 0) {
    for (let i = 0; i < images.length; i++) {
      const raw = images[i];
      // 移除 data URL prefix（若有）
      const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
      const key = `products/${code}/${i}.webp`;
      const buffer = base64ToArrayBuffer(base64);
      await env.IMAGES.put(key, buffer, {
        httpMetadata: { contentType: "image/webp" },
      });
      // R2 public URL 格式（需設定 custom domain 或 public access）
      // 先用相對路徑，前端透過 /api/images/ proxy 或 R2 public URL
      imageUrls.push(key);
    }
  } else if (images.length > 0) {
    // fallback: 無 R2 時存 data URL（向下相容）
    for (const img of images) {
      imageUrls.push(img.startsWith("data:") ? img : `data:image/webp;base64,${img}`);
    }
  }

  const payload = JSON.stringify({
    description: body.description || "",
    specs: body.specs || {},
    sizeOptions: Array.isArray(body.sizeOptions) ? body.sizeOptions : [],
    colorOptions: Array.isArray(body.colorOptions) ? body.colorOptions : [],
    gallery: imageUrls,
  });

  const result = await env.DB
    .prepare(
      `INSERT INTO products (
        source_site, source_product_code, title_ja, title_zh_tw,
        brand, category, price_jpy_tax_in, color_count,
        image_url, is_active, last_crawled_at, source_payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), ?)`
    )
    .bind(
      "manual",
      code,
      titleJa || titleZhTw,
      titleZhTw || null,
      body.brand || null,
      body.category || null,
      body.priceJpyTaxIn ?? null,
      Array.isArray(body.colorOptions) ? body.colorOptions.length : null,
      imageUrls[0] || null,
      payload
    )
    .run();

  const productId = result?.meta?.last_row_id;

  return new Response(
    JSON.stringify({ ok: true, productId, code, imageUrls }),
    { status: 201, headers: { "content-type": "application/json" } }
  );
}
```

**Step 2: 加入 R2 圖片 proxy route（可選，用於存取 R2 圖片）**

在 `index.ts` 加入：

```typescript
// R2 image proxy
if (url.pathname.startsWith("/api/images/")) {
  const key = url.pathname.slice("/api/images/".length);
  if (!env.IMAGES) return json({ ok: false, error: "R2 not configured" }, 500);
  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not Found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
```

**Step 3: Commit**

```bash
git add src/routes/admin/products.ts src/index.ts
git commit -m "feat: multi-image upload to R2 with webp support"
```

---

### Task 5: Admin HTML 重寫 — 底部導航 + 5 個 Tab

**Files:**
- Rewrite: `workers/public/admin.html`

**Step 1: 完整重寫 admin.html**

重寫 `workers/public/admin.html`，結構如下：

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Japan Buy Admin</title>
  <link rel="stylesheet" href="/assets/styles.css" />
</head>
<body class="admin-body">
  <header class="admin-topbar">
    <h1 id="admin-topbar-title">新增商品</h1>
  </header>

  <main class="admin-main" id="admin-main">
    <section id="admin-error" class="notice hidden"></section>

    <!-- Tab 1: 新增商品 -->
    <section class="admin-tab-panel" data-tab="products">
      <div class="tab-sub-nav">
        <button class="tab-sub-btn is-active" data-subtab="manual">手動上架</button>
        <button class="tab-sub-btn" data-subtab="categories">分類管理</button>
      </div>
      <!-- 手動上架子面板 -->
      <div class="admin-sub-panel" data-subtab-panel="manual">
        <div class="admin-form-card">
          <div class="photo-upload-area">
            <div class="photo-preview-row" id="manual-photo-previews"></div>
            <label class="btn-pill secondary photo-add-btn">
              選擇商品圖片（最多 3 張）
              <input id="manual-photo-input" type="file" accept="image/*" multiple hidden />
            </label>
            <p class="meta" id="manual-photo-count">已選 0 / 3 張</p>
          </div>
          <label>日文品名<input id="manual-title-ja" type="text" class="input-cute" /></label>
          <label>中文品名<input id="manual-title-zh" type="text" class="input-cute" /></label>
          <label>品牌<input id="manual-brand" type="text" class="input-cute" /></label>
          <label>分類<input id="manual-category" type="text" class="input-cute" list="category-datalist" /></label>
          <datalist id="category-datalist"></datalist>
          <label>價格（JPY）<input id="manual-price" type="number" min="0" class="input-cute" /></label>
          <label>商品描述<textarea id="manual-description" rows="3" class="input-cute"></textarea></label>
          <label>尺寸選項（逗號分隔）<input id="manual-sizes" type="text" class="input-cute" placeholder="S, M, L" /></label>
          <label>顏色選項（逗號分隔）<input id="manual-colors" type="text" class="input-cute" placeholder="紅色, 藍色" /></label>
          <button id="manual-submit" class="button" type="button">確認上架</button>
          <p id="manual-status" class="meta"></p>
        </div>
      </div>
      <!-- 分類管理子面板 -->
      <div class="admin-sub-panel hidden" data-subtab-panel="categories">
        <div class="admin-form-card">
          <div class="category-add-row">
            <input id="category-new-name" type="text" class="input-cute" placeholder="新分類名稱" />
            <button id="category-add-btn" class="button" type="button">新增</button>
          </div>
          <div id="category-list" class="category-list"></div>
        </div>
      </div>
    </section>

    <!-- Tab 2: 拍照上架 -->
    <section class="admin-tab-panel hidden" data-tab="camera">
      <div class="admin-form-card">
        <div class="photo-upload-area">
          <div class="photo-preview-row" id="photo-previews"></div>
          <label class="btn-pill secondary photo-add-btn">
            拍照 / 選擇圖片（最多 3 張）
            <input id="photo-input" type="file" accept="image/*" capture="environment" multiple hidden />
          </label>
          <p class="meta" id="photo-count">已選 0 / 3 張</p>
        </div>
        <div class="photo-actions">
          <button id="btn-recognize-quick" class="button" type="button" disabled>快速導入</button>
          <button id="btn-recognize-search" class="button secondary" type="button" disabled>聯網搜尋</button>
        </div>
        <p id="recognize-status" class="meta"></p>
        <div id="recognize-draft" class="recognize-draft hidden">
          <h3>商品草稿</h3>
          <label>日文品名<input id="draft-title-ja" type="text" class="input-cute" /></label>
          <label>中文品名<input id="draft-title-zh" type="text" class="input-cute" /></label>
          <label>品牌<input id="draft-brand" type="text" class="input-cute" /></label>
          <label>分類<input id="draft-category" type="text" class="input-cute" /></label>
          <label>價格（JPY）<input id="draft-price" type="number" min="0" class="input-cute" /></label>
          <label>商品描述<textarea id="draft-description" rows="3" class="input-cute"></textarea></label>
          <label>規格（JSON）<textarea id="draft-specs" rows="3" class="input-cute"></textarea></label>
          <label>尺寸選項（逗號分隔）<input id="draft-sizes" type="text" class="input-cute" placeholder="S, M, L" /></label>
          <label>顏色選項（逗號分隔）<input id="draft-colors" type="text" class="input-cute" placeholder="紅色, 藍色" /></label>
          <div id="draft-sources" class="meta hidden"></div>
          <div class="photo-actions">
            <button id="btn-confirm-listing" class="button" type="button">確認上架</button>
            <button id="btn-cancel-draft" class="button secondary" type="button">取消</button>
          </div>
          <p id="listing-status" class="meta"></p>
        </div>
      </div>
    </section>

    <!-- Tab 3: 網站同步 -->
    <section class="admin-tab-panel hidden" data-tab="sync">
      <div class="admin-form-card">
        <h2 class="product-card__title">同步目標網站</h2>
        <p class="meta">來源：fo-online.jp 排行榜</p>
        <button id="sync-crawl-btn" class="button" type="button">開始同步</button>
        <div id="sync-loading" class="sync-loading hidden">
          <div class="sync-loading-bar">
            <div class="sync-loading-bar__fill" id="sync-bar-fill"></div>
          </div>
          <p class="sync-loading-text" id="sync-loading-text">正在同步...</p>
        </div>
        <div id="sync-result" class="sync-result hidden">
          <div class="sync-result-card">
            <h3 id="sync-result-title">同步完成</h3>
            <div class="sync-result-stats">
              <div class="sync-stat">
                <span class="sync-stat__value" id="sync-crawled">0</span>
                <span class="sync-stat__label">抓取筆數</span>
              </div>
              <div class="sync-stat">
                <span class="sync-stat__value" id="sync-upserted">0</span>
                <span class="sync-stat__label">寫入筆數</span>
              </div>
              <div class="sync-stat">
                <span class="sync-stat__value" id="sync-source">-</span>
                <span class="sync-stat__label">來源</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Tab 4: 訂單列表 -->
    <section class="admin-tab-panel hidden" data-tab="orders">
      <div class="admin-tab-header">
        <button id="orders-refresh" class="button secondary" type="button">刷新</button>
      </div>
      <section id="admin-forms" class="admin-forms"></section>
    </section>

    <!-- Tab 5: 網站設定 -->
    <section class="admin-tab-panel hidden" data-tab="settings">
      <div class="tab-sub-nav">
        <button class="tab-sub-btn is-active" data-subtab="pricing">匯率設定</button>
        <button class="tab-sub-btn" data-subtab="apikey">API Key</button>
        <button class="tab-sub-btn" data-subtab="account">帳號設定</button>
      </div>
      <!-- 匯率設定 -->
      <div class="admin-sub-panel" data-subtab-panel="pricing">
        <div class="admin-form-card">
          <label>每筆加價 JPY<input id="markup-jpy" type="number" min="0" step="1" class="input-cute" /></label>
          <label>JPY → TWD 匯率<input id="jpy-to-twd" type="number" min="0.01" step="0.001" class="input-cute" /></label>
          <label>國際運費 (TWD)<input id="international-shipping-twd" type="number" min="0" step="1" class="input-cute" /></label>
          <label>國內運費 (TWD)<input id="domestic-shipping-twd" type="number" min="0" step="1" class="input-cute" /></label>
          <label>優惠門檻 (TWD)<input id="promo-tag-max-twd" type="number" min="0" step="1" class="input-cute" /></label>
          <label>限時連線代購運費 (TWD)<input id="limited-proxy-shipping-twd" type="number" min="0" step="1" class="input-cute" /></label>
          <label><input id="shipping-options-enabled" type="checkbox" /> 顯示運費選項（前端需求單）</label>
          <button id="admin-save-pricing" class="button" type="button">儲存</button>
        </div>
      </div>
      <!-- API Key -->
      <div class="admin-sub-panel hidden" data-subtab-panel="apikey">
        <div class="admin-form-card">
          <label>Gemini API Key<input id="gemini-api-key" type="password" class="input-cute" placeholder="填入 Gemini API Key" /></label>
          <p id="gemini-key-status" class="meta">尚未設定</p>
          <button id="admin-save-gemini-key" class="button" type="button">儲存 API Key</button>
        </div>
      </div>
      <!-- 帳號設定 -->
      <div class="admin-sub-panel hidden" data-subtab-panel="account">
        <div class="admin-form-card">
          <label>舊密碼<input id="old-password" type="password" class="input-cute" /></label>
          <label>新密碼<input id="new-password" type="password" class="input-cute" /></label>
          <label>確認新密碼<input id="confirm-password" type="password" class="input-cute" /></label>
          <button id="admin-change-password" class="button" type="button">更改密碼</button>
          <p id="password-status" class="meta"></p>
          <hr />
          <button id="admin-logout" class="button secondary" type="button">登出</button>
        </div>
      </div>
    </section>
  </main>

  <!-- 底部導航 -->
  <nav class="admin-bottom-nav" id="admin-bottom-nav">
    <button class="admin-nav-item is-active" data-tab="products">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.79 0l-8-4a2 2 0 0 1-1.1-1.8V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0z"/><polyline points="2.32 6.16 12 11 21.68 6.16"/><line x1="12" y1="22.76" x2="12" y2="11"/></svg>
      <span>商品</span>
    </button>
    <button class="admin-nav-item" data-tab="camera">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      <span>拍照</span>
    </button>
    <button class="admin-nav-item" data-tab="sync">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      <span>同步</span>
    </button>
    <button class="admin-nav-item" data-tab="orders">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
      <span>訂單</span>
    </button>
    <button class="admin-nav-item" data-tab="settings">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <span>設定</span>
    </button>
  </nav>

  <script type="module" src="/assets/app-admin.js"></script>
</body>
</html>
```

**Step 2: Commit**

```bash
git add public/admin.html
git commit -m "feat: rewrite admin.html with bottom nav and 5 tab sections"
```

---

### Task 6: CSS — 底部導航 + Tab + Loading Bar + 同步結果

**Files:**
- Modify: `workers/public/assets/styles.css`

**Step 1: 替換舊 admin 相關 CSS，新增底部導航和 tab 系統**

在 styles.css 的 `/* Admin */` 區塊替換為新樣式，並新增以下 CSS：

```css
/* Admin Body */
.admin-body {
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
}

/* Admin Top Bar */
.admin-topbar {
  background: #fff;
  border-bottom: 2px solid transparent;
  border-image: linear-gradient(90deg, var(--primary-color) 0%, var(--accent-warm) 60%, var(--accent-gold) 100%) 1;
  padding: 12px 16px;
  position: sticky;
  top: 0;
  z-index: 30;
}

.admin-topbar h1 {
  font-size: 18px;
  margin: 0;
  font-weight: 700;
}

/* Admin Main */
.admin-main {
  padding: 12px 16px;
  max-width: 600px;
  margin: 0 auto;
}

/* Bottom Navigation */
.admin-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  background: #fff;
  border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.admin-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 4px 6px;
  border: none;
  background: none;
  color: var(--muted);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.admin-nav-item svg {
  width: 22px;
  height: 22px;
}

.admin-nav-item.is-active {
  color: var(--brand);
}

.admin-nav-item:active {
  opacity: 0.7;
}

/* Tab Panels */
.admin-tab-panel {
  animation: fade-in 0.15s ease;
}

/* Sub-tab Navigation */
.tab-sub-nav {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: #eef2e6;
  border: 1px solid #d9e0cc;
  margin-bottom: 12px;
}

.tab-sub-btn {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: #5f6a55;
  cursor: pointer;
  font-family: inherit;
  font-weight: 500;
  transition: background var(--transition-fast), color var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.tab-sub-btn.is-active {
  background: var(--brand);
  color: #fff;
}

/* Admin form card — inside tabs */
.admin-tab-panel .admin-form-card {
  display: grid;
  gap: 10px;
}

.admin-tab-panel .admin-form-card label {
  display: block;
  font-size: 14px;
  font-weight: 500;
}

.admin-tab-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

/* Category List */
.category-list {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.category-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}

.category-item__name {
  flex: 1;
  font-weight: 500;
}

.category-item__count {
  color: var(--muted);
  font-size: 13px;
}

.category-item__actions {
  display: flex;
  gap: 4px;
}

.category-item__actions button {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 6px;
}

.category-add-row {
  display: flex;
  gap: 8px;
}

.category-add-row input {
  flex: 1;
}

/* Sync Loading Bar */
.sync-loading {
  margin-top: 16px;
}

.sync-loading-bar {
  height: 6px;
  background: var(--line);
  border-radius: 3px;
  overflow: hidden;
}

.sync-loading-bar__fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--primary-color), var(--accent-gold));
  border-radius: 3px;
  transition: width 0.4s ease;
}

.sync-loading-bar__fill.phase-1 {
  width: 30%;
  transition: width 0.8s ease;
}

.sync-loading-bar__fill.phase-2 {
  width: 80%;
  transition: width 15s ease-out;
}

.sync-loading-bar__fill.phase-3 {
  width: 100%;
  transition: width 0.3s ease;
}

.sync-loading-text {
  text-align: center;
  margin-top: 8px;
  font-size: 14px;
  color: var(--muted);
  animation: hint-fade 2s ease-in-out infinite;
}

/* Sync Result */
.sync-result {
  margin-top: 16px;
}

.sync-result-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  padding: 16px;
  border-left: 4px solid var(--primary-color);
}

.sync-result-card h3 {
  margin: 0 0 12px;
  font-size: 16px;
  color: var(--primary-color);
}

.sync-result-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.sync-stat {
  text-align: center;
}

.sync-stat__value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-color);
}

.sync-stat__label {
  font-size: 12px;
  color: var(--muted);
}

/* Mobile overrides for admin */
@media (max-width: 720px) {
  .admin-main {
    padding: 10px 12px;
  }

  .admin-tab-panel .admin-form-card label input,
  .admin-tab-panel .admin-form-card label textarea,
  .admin-tab-panel .admin-form-card label select {
    font-size: 16px;
    min-height: 44px;
  }

  .admin-tab-panel .button {
    width: 100%;
    min-height: 44px;
    font-size: 15px;
  }

  .sync-result-stats {
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  .photo-actions {
    flex-direction: column;
  }

  .photo-actions .button {
    width: 100%;
    min-height: 44px;
  }
}
```

**Step 2: Commit**

```bash
git add public/assets/styles.css
git commit -m "feat: add bottom nav, tab system, loading bar, and sync result CSS"
```

---

### Task 7: app-admin.js 重寫 — Tab 切換 + 模組協調

**Files:**
- Rewrite: `workers/public/assets/app-admin.js`

**Step 1: 完整重寫 app-admin.js**

這個檔案變成 Tab router + 模組初始化入口。個別 Tab 邏輯放到獨立模組中。

```javascript
// app-admin.js — Tab 路由 + 模組初始化
import { initSync } from "./app-admin-sync.js";
import { initOrders } from "./app-admin-orders.js";
import { initProducts } from "./app-admin-products.js";
import { initSettings } from "./app-admin-settings.js";

const TAB_TITLES = {
  products: "新增商品",
  camera: "拍照上架",
  sync: "網站同步",
  orders: "訂單列表",
  settings: "網站設定",
};

let currentTab = "products";
const tabInitialized = {};

export function showError(message) {
  const node = document.getElementById("admin-error");
  if (!node) return;
  node.textContent = message;
  node.classList.remove("hidden");
  setTimeout(() => node.classList.add("hidden"), 5000);
}

export function hideError() {
  const node = document.getElementById("admin-error");
  if (node) node.classList.add("hidden");
}

function switchTab(tab) {
  if (tab === currentTab) return;
  currentTab = tab;

  // 切換 panel 可見性
  document.querySelectorAll(".admin-tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.getAttribute("data-tab") !== tab);
  });

  // 更新 nav active 狀態
  document.querySelectorAll(".admin-nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-tab") === tab);
  });

  // 更新 topbar 標題
  const title = document.getElementById("admin-topbar-title");
  if (title) title.textContent = TAB_TITLES[tab] || "";

  // 首次進入 tab 時初始化
  if (!tabInitialized[tab]) {
    tabInitialized[tab] = true;
    if (tab === "orders") initOrders();
    if (tab === "settings") initSettings();
    if (tab === "sync") initSync();
    if (tab === "products") initProducts();
  }
}

function initSubTabs() {
  document.querySelectorAll(".tab-sub-nav").forEach((nav) => {
    nav.querySelectorAll(".tab-sub-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const subtab = btn.getAttribute("data-subtab");
        const parent = btn.closest(".admin-tab-panel");
        if (!parent || !subtab) return;

        // 更新 sub-nav active
        nav.querySelectorAll(".tab-sub-btn").forEach((b) =>
          b.classList.toggle("is-active", b === btn)
        );

        // 切換 sub-panel
        parent.querySelectorAll(".admin-sub-panel").forEach((panel) => {
          panel.classList.toggle("hidden", panel.getAttribute("data-subtab-panel") !== subtab);
        });
      });
    });
  });
}

function bootstrap() {
  // 底部導航事件
  document.querySelectorAll(".admin-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab) switchTab(tab);
    });
  });

  // Sub-tab 初始化
  initSubTabs();

  // 初始化預設 tab
  tabInitialized["products"] = true;
  initProducts();
}

bootstrap();
```

**Step 2: Commit**

```bash
git add public/assets/app-admin.js
git commit -m "feat: rewrite app-admin.js as tab router with module imports"
```

---

### Task 8: 獨立 JS 模組 — Settings + Orders + Sync + Products

**Files:**
- Create: `workers/public/assets/app-admin-settings.js`
- Create: `workers/public/assets/app-admin-orders.js`
- Create: `workers/public/assets/app-admin-sync.js`
- Create: `workers/public/assets/app-admin-products.js`

**Step 1: app-admin-settings.js（匯率 + API Key + 帳號密碼）**

```javascript
import { showError } from "./app-admin.js";

async function loadPricing() {
  const res = await fetch("/api/admin/pricing");
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) return;
  const body = await res.json();
  const p = body?.pricing || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val ?? ""); };
  set("markup-jpy", p.markupJpy ?? 1000);
  set("jpy-to-twd", p.jpyToTwd ?? 0.21);
  set("international-shipping-twd", p.internationalShippingTwd ?? 350);
  set("domestic-shipping-twd", p.domesticShippingTwd ?? 60);
  set("promo-tag-max-twd", p.promoTagMaxTwd ?? 500);
  set("limited-proxy-shipping-twd", p.limitedProxyShippingTwd ?? 80);
  const opt = document.getElementById("shipping-options-enabled");
  if (opt) opt.checked = p.shippingOptionsEnabled !== false;
}

async function savePricing() {
  const get = (id) => Number(document.getElementById(id)?.value || 0);
  const res = await fetch("/api/admin/pricing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      markupJpy: get("markup-jpy"),
      jpyToTwd: get("jpy-to-twd"),
      internationalShippingTwd: get("international-shipping-twd"),
      domesticShippingTwd: get("domestic-shipping-twd"),
      promoTagMaxTwd: get("promo-tag-max-twd"),
      limitedProxyShippingTwd: get("limited-proxy-shipping-twd"),
      shippingOptionsEnabled: Boolean(document.getElementById("shipping-options-enabled")?.checked),
    }),
  });
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) { showError("儲存失敗"); return; }
}

async function loadGeminiSettings() {
  const res = await fetch("/api/admin/settings/gemini");
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) return;
  const body = await res.json();
  const status = document.getElementById("gemini-key-status");
  if (status) status.textContent = body.hasKey ? `已設定（${body.maskedKey}）` : "尚未設定";
}

async function saveGeminiKey() {
  const input = document.getElementById("gemini-api-key");
  const key = input?.value?.trim();
  if (!key) { showError("請填入 Gemini API Key"); return; }
  const res = await fetch("/api/admin/settings/gemini", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ geminiApiKey: key }),
  });
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) { showError("儲存失敗"); return; }
  input.value = "";
  await loadGeminiSettings();
}

async function changePassword() {
  const oldPw = document.getElementById("old-password")?.value?.trim();
  const newPw = document.getElementById("new-password")?.value?.trim();
  const confirmPw = document.getElementById("confirm-password")?.value?.trim();
  const status = document.getElementById("password-status");

  if (!oldPw || !newPw || !confirmPw) { if (status) status.textContent = "所有欄位為必填"; return; }
  if (newPw !== confirmPw) { if (status) status.textContent = "新密碼與確認密碼不一致"; return; }
  if (newPw.length < 4) { if (status) status.textContent = "新密碼至少 4 個字元"; return; }

  const res = await fetch("/api/admin/change-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
  });

  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (status) status.textContent = data.error || "舊密碼錯誤";
    return;
  }
  if (!res.ok) { if (status) status.textContent = "更改失敗"; return; }

  if (status) status.textContent = "密碼已更改！";
  document.getElementById("old-password").value = "";
  document.getElementById("new-password").value = "";
  document.getElementById("confirm-password").value = "";
}

async function logout() {
  await fetch("/api/admin/logout", { method: "POST" });
  location.href = "/admin-login.html";
}

export function initSettings() {
  document.getElementById("admin-save-pricing")?.addEventListener("click", savePricing);
  document.getElementById("admin-save-gemini-key")?.addEventListener("click", saveGeminiKey);
  document.getElementById("admin-change-password")?.addEventListener("click", changePassword);
  document.getElementById("admin-logout")?.addEventListener("click", logout);
  loadPricing();
  loadGeminiSettings();
}
```

**Step 2: app-admin-orders.js（從舊 app-admin.js 提取訂單邏輯）**

```javascript
import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";
import { calculateAdminFormTotals } from "./admin-totals.js";
import { showError, hideError } from "./app-admin.js";

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("en-US");
}

function shippingMethodText(method) {
  if (method === "jp_direct") return "日本直送（需完成EZWAY）";
  if (method === "limited_proxy") return "限時連線代購（固定運費）";
  if (method === "shipping_hidden") return "運費選項隱藏（由客服後續確認）";
  return "集運回台灣（國際+國內）";
}

const STATUS_OPTIONS = [
  { value: "pending", label: "待處理" },
  { value: "ordered", label: "已下單" },
  { value: "shipped", label: "已出貨" },
  { value: "cancelled", label: "取消訂單" },
];

function statusSelectHtml(formId, current) {
  const options = STATUS_OPTIONS.map(
    (o) => `<option value="${o.value}"${o.value === current ? " selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="js-status-select" data-form-id="${formId}">${options}</select>`;
}

function renderForms(forms) {
  const wrapper = document.getElementById("admin-forms");
  if (!wrapper) return;
  if (!Array.isArray(forms) || forms.length === 0) {
    wrapper.innerHTML = '<p class="notice notice--info">目前沒有需求單。</p>';
    return;
  }

  wrapper.innerHTML = forms
    .map((form) => {
      const totals = calculateAdminFormTotals(form);
      const itemsHtml = Array.isArray(form.items)
        ? form.items.map((item) => {
            const imageUrl = withProductImageFallback(item.selectedImageUrl || item.imageUrl || "");
            return `<li class="admin-item-row">
              <img class="admin-item-image" src="${imageUrl}" alt="${item.productNameSnapshot}" data-fallback="product" />
              <div class="admin-item-info">
                <p><strong>${item.productNameSnapshot}</strong>（${item.code || "無代碼"}）x ${item.quantity}</p>
                <p class="meta">尺寸：${item.desiredSize || "未選"}，顏色：${item.desiredColor || "未選"}</p>
                <p class="meta">單價 &yen;${formatCurrency(item.unitPriceJpy)} / NT$${formatCurrency(item.unitPriceTwd)}，小計 &yen;${formatCurrency(item.subtotalJpy)} / NT$${formatCurrency(item.subtotalTwd)}</p>
                ${item.note ? `<p class="meta">備註：${item.note}</p>` : ""}
                ${item.productUrl ? `<a href="${item.productUrl}" target="_blank" rel="noopener noreferrer" class="meta">原商品頁</a>` : ""}
              </div>
            </li>`;
          }).join("")
        : "";
      const displayCode = form.orderCode || String(form.id);
      return `
      <article class="admin-form-card" data-status="${form.status}">
        <div class="admin-form-header">
          <h2 class="product-card__title">需求單 #${displayCode}</h2>
          <div class="admin-form-status">${statusSelectHtml(form.id, form.status)}</div>
        </div>
        <p class="meta">建立時間：${new Date(form.createdAt).toLocaleString("zh-TW")}</p>
        <p class="meta">客戶：${form.customerName}｜電話：${form.memberPhone || "無"}</p>
        <p class="meta">Line ID：${form.lineId || "無"}</p>
        <p class="meta">收件：${form.recipientCity || ""} ${form.recipientAddress || ""}</p>
        <p class="meta">配送：${shippingMethodText(form.shippingMethod)}</p>
        <p class="meta">商品合計：&yen;${formatCurrency(totals.itemsTotalJpy)} / NT$${formatCurrency(totals.itemsTotalTwd)}；總金額：NT$${formatCurrency(totals.grandTotalTwd)}</p>
        <p class="meta">整單備註：${form.notes || "無"}</p>
        <button class="button secondary js-delete-form" type="button" data-form-id="${form.id}">刪除此需求單</button>
        <ul class="admin-form-items">${itemsHtml}</ul>
      </article>`;
    }).join("");

  applyProductImageFallback(wrapper);
  bindOrderEvents(wrapper);
}

function bindOrderEvents(wrapper) {
  wrapper.querySelectorAll(".js-status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const formId = Number(select.getAttribute("data-form-id"));
      hideError();
      const res = await fetch("/api/admin/requirements", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: formId, status: select.value }),
      });
      if (res.status === 401) { location.href = "/admin-login.html"; return; }
      if (!res.ok) { showError(`狀態更新失敗：${res.status}`); return; }
      const card = select.closest(".admin-form-card");
      if (card) card.setAttribute("data-status", select.value);
    });
  });

  wrapper.querySelectorAll(".js-delete-form").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-form-id") || "");
      if (!Number.isInteger(id) || id <= 0) return;
      if (!confirm(`確定刪除需求單 #${id}？此操作無法復原。`)) return;
      hideError();
      const res = await fetch(`/api/admin/requirements?id=${id}`, { method: "DELETE" });
      if (res.status === 401) { location.href = "/admin-login.html"; return; }
      if (!res.ok) { showError(`刪除失敗：${res.status}`); return; }
      await loadForms();
    });
  });
}

async function loadForms() {
  hideError();
  const res = await fetch("/api/admin/requirements");
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) { showError(`讀取失敗：${res.status}`); return; }
  const body = await res.json();
  renderForms(body.forms || []);
}

export function initOrders() {
  document.getElementById("orders-refresh")?.addEventListener("click", loadForms);
  loadForms();
}
```

**Step 3: app-admin-sync.js（Loading bar + 同步結果）**

```javascript
import { showError } from "./app-admin.js";

async function runSync() {
  const btn = document.getElementById("sync-crawl-btn");
  const loading = document.getElementById("sync-loading");
  const result = document.getElementById("sync-result");
  const barFill = document.getElementById("sync-bar-fill");
  const loadingText = document.getElementById("sync-loading-text");

  if (btn) btn.disabled = true;
  if (result) result.classList.add("hidden");
  if (loading) loading.classList.remove("hidden");

  // Phase 1: 快速到 30%
  if (barFill) { barFill.className = "sync-loading-bar__fill"; void barFill.offsetWidth; barFill.classList.add("phase-1"); }
  if (loadingText) loadingText.textContent = "正在連線目標網站...";

  // Phase 2: 緩慢到 80%（延遲 800ms 觸發）
  setTimeout(() => {
    if (barFill) barFill.classList.replace("phase-1", "phase-2");
    if (loadingText) loadingText.textContent = "正在同步商品資料...";
  }, 800);

  try {
    const res = await fetch("/admin/crawl", { method: "POST" });
    if (res.status === 401) { location.href = "/admin-login.html"; return; }

    // Phase 3: 到 100%
    if (barFill) barFill.classList.replace("phase-2", "phase-3");
    if (loadingText) loadingText.textContent = "同步完成！";

    if (!res.ok) {
      showError(`同步失敗：HTTP ${res.status}`);
      setTimeout(() => { if (loading) loading.classList.add("hidden"); }, 1000);
      return;
    }

    const body = await res.json();

    // 延遲顯示結果（讓 bar 到 100% 有時間）
    setTimeout(() => {
      if (loading) loading.classList.add("hidden");
      if (barFill) barFill.className = "sync-loading-bar__fill";

      if (body?.ok) {
        document.getElementById("sync-crawled").textContent = String(body.crawledCount || 0);
        document.getElementById("sync-upserted").textContent = String(body.upserted || 0);
        document.getElementById("sync-source").textContent = body.source || "-";
        if (result) result.classList.remove("hidden");
      } else {
        showError("同步失敗（回應格式錯誤）");
      }
    }, 500);
  } catch (err) {
    showError(`同步失敗：${String(err)}`);
    if (loading) loading.classList.add("hidden");
    if (barFill) barFill.className = "sync-loading-bar__fill";
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function initSync() {
  document.getElementById("sync-crawl-btn")?.addEventListener("click", runSync);
}
```

**Step 4: app-admin-products.js（手動上架 + 分類管理）**

```javascript
import { showError } from "./app-admin.js";

const MAX_PHOTOS = 3;
const MAX_IMAGE_SIZE = 800;
const WEBP_QUALITY = 0.8;

let manualImages = [];

function compressImageToWebp(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > MAX_IMAGE_SIZE || h > MAX_IMAGE_SIZE) {
        if (w > h) { h = Math.round((h * MAX_IMAGE_SIZE) / w); w = MAX_IMAGE_SIZE; }
        else { w = Math.round((w * MAX_IMAGE_SIZE) / h); h = MAX_IMAGE_SIZE; }
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/webp", WEBP_QUALITY);
      const base64 = dataUrl.split(",")[1];
      resolve({ file, dataUrl, base64 });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function renderManualPreviews() {
  const row = document.getElementById("manual-photo-previews");
  if (!row) return;
  row.innerHTML = manualImages.map((img, idx) => `
    <div class="photo-preview-item">
      <img src="${img.dataUrl}" alt="照片 ${idx + 1}" />
      <button class="photo-remove" data-idx="${idx}" type="button">&times;</button>
    </div>
  `).join("");
  row.querySelectorAll(".photo-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      manualImages.splice(Number(btn.getAttribute("data-idx")), 1);
      renderManualPreviews();
      updateManualCount();
    });
  });
}

function updateManualCount() {
  const el = document.getElementById("manual-photo-count");
  if (el) el.textContent = `已選 ${manualImages.length} / ${MAX_PHOTOS} 張`;
}

async function onManualPhotos(event) {
  const files = Array.from(event.target.files || []);
  const remaining = MAX_PHOTOS - manualImages.length;
  for (const file of files.slice(0, remaining)) {
    try { manualImages.push(await compressImageToWebp(file)); } catch { /* skip */ }
  }
  renderManualPreviews();
  updateManualCount();
  event.target.value = "";
}

async function submitManualProduct() {
  const get = (id) => document.getElementById(id)?.value?.trim() || "";
  const titleJa = get("manual-title-ja");
  const titleZhTw = get("manual-title-zh");
  if (!titleJa && !titleZhTw) { showStatus("商品名稱為必填"); return; }

  const priceRaw = get("manual-price");
  const payload = {
    titleJa, titleZhTw,
    brand: get("manual-brand"),
    category: get("manual-category"),
    priceJpyTaxIn: priceRaw ? Number(priceRaw) : null,
    description: get("manual-description"),
    specs: {},
    sizeOptions: get("manual-sizes").split(",").map(s => s.trim()).filter(Boolean),
    colorOptions: get("manual-colors").split(",").map(s => s.trim()).filter(Boolean),
    images: manualImages.map(img => img.base64),
  };

  showStatus("上架中...");
  const btn = document.getElementById("manual-submit");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) { location.href = "/admin-login.html"; return; }
    const data = await res.json();
    if (!data.ok) { showStatus(`上架失敗：${data.error}`); return; }
    showStatus(`上架成功！商品代碼：${data.code}`);
    manualImages = [];
    renderManualPreviews();
    updateManualCount();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showStatus(text) {
  const el = document.getElementById("manual-status");
  if (el) el.textContent = text;
}

// === 分類管理 ===
async function loadCategories() {
  const res = await fetch("/api/admin/categories");
  if (!res.ok) return;
  const body = await res.json();
  const list = document.getElementById("category-list");
  if (!list) return;

  const categories = body.categories || [];
  if (categories.length === 0) {
    list.innerHTML = '<p class="meta">尚無分類</p>';
    return;
  }

  list.innerHTML = categories.map((cat) => `
    <div class="category-item">
      <span class="category-item__name">${cat.name}</span>
      <span class="category-item__count">${cat.total} 件</span>
      <div class="category-item__actions">
        <button class="button secondary js-cat-rename" data-name="${cat.name}">改名</button>
        <button class="button secondary js-cat-delete" data-name="${cat.name}">刪除</button>
      </div>
    </div>
  `).join("");

  // 更新 datalist
  const datalist = document.getElementById("category-datalist");
  if (datalist) {
    datalist.innerHTML = categories.map(c => `<option value="${c.name}">`).join("");
  }

  list.querySelectorAll(".js-cat-rename").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const oldName = btn.getAttribute("data-name");
      const newName = prompt(`將「${oldName}」重新命名為：`, oldName);
      if (!newName || newName.trim() === oldName) return;
      await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldName, newName: newName.trim() }),
      });
      await loadCategories();
    });
  });

  list.querySelectorAll(".js-cat-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.getAttribute("data-name");
      if (!confirm(`確定刪除分類「${name}」？該分類下的商品將歸為未分類。`)) return;
      await fetch(`/api/admin/categories?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      await loadCategories();
    });
  });
}

async function addCategory() {
  const input = document.getElementById("category-new-name");
  const name = input?.value?.trim();
  if (!name) return;
  await fetch("/api/admin/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  input.value = "";
  await loadCategories();
}

export function initProducts() {
  document.getElementById("manual-photo-input")?.addEventListener("change", onManualPhotos);
  document.getElementById("manual-submit")?.addEventListener("click", submitManualProduct);
  document.getElementById("category-add-btn")?.addEventListener("click", addCategory);
  loadCategories();
}
```

**Step 5: Commit**

```bash
git add public/assets/app-admin-settings.js public/assets/app-admin-orders.js public/assets/app-admin-sync.js public/assets/app-admin-products.js
git commit -m "feat: add admin tab modules (settings, orders, sync, products)"
```

---

### Task 9: 修改 app-admin-recognize.js — WebP + 多圖導入

**Files:**
- Modify: `workers/public/assets/app-admin-recognize.js`

**Step 1: 改 compressImage 輸出 WebP，confirmListing 傳所有圖片**

關鍵修改：
1. `compressImage` 中 `canvas.toDataURL("image/jpeg", ...)` 改為 `canvas.toDataURL("image/webp", 0.8)`
2. `confirmListing` 中 `imageDataUrl: selectedImages[0].dataUrl` 改為 `images: selectedImages.map(img => img.base64)`
3. 加入 `import { showError } from "./app-admin.js";` 替換原有的 local showError

**Step 2: Commit**

```bash
git add public/assets/app-admin-recognize.js
git commit -m "feat: recognize module outputs webp and sends all images"
```

---

### Task 10: index.ts 最終整合 + R2 image proxy

**Files:**
- Modify: `workers/src/index.ts`

**Step 1: 確認所有新 route 和 import 齊全**

確認 index.ts 包含：
- `import { handleAdminChangePassword } from "./routes/admin/password";`
- `import { handleAdminCategories } from "./routes/admin/categories";`
- Env type 包含 `IMAGES?: R2Bucket;`
- Routes: `/api/admin/change-password`, `/api/admin/categories`, `/api/images/*`
- `handleAdminLogin(request, env)` 已更新簽名

**Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: register all new admin routes and R2 image proxy"
```

---

## 檔案異動總覽

| 檔案 | 動作 | 說明 |
|---|---|---|
| `wrangler.toml` | 修改 | 加 R2 binding |
| `src/routes/admin/auth.ts` | 修改 | 密碼改讀 app_settings |
| `src/routes/admin/password.ts` | 新增 | 更改密碼 API |
| `src/routes/admin/categories.ts` | 新增 | 分類 CRUD API |
| `src/routes/admin/products.ts` | 修改 | 多圖 + R2 上傳 |
| `src/index.ts` | 修改 | 新 route + Env type + R2 proxy |
| `public/admin.html` | 重寫 | 底部導航 + 5 Tab |
| `public/assets/styles.css` | 修改 | 底部導航 + Tab + Loading bar CSS |
| `public/assets/app-admin.js` | 重寫 | Tab router + 模組初始化 |
| `public/assets/app-admin-recognize.js` | 修改 | WebP + 多圖 |
| `public/assets/app-admin-settings.js` | 新增 | 匯率 + API Key + 帳號密碼 |
| `public/assets/app-admin-orders.js` | 新增 | 訂單列表 |
| `public/assets/app-admin-sync.js` | 新增 | 同步 + Loading bar |
| `public/assets/app-admin-products.js` | 新增 | 手動上架 + 分類管理 |
