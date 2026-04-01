# 拍照辨識商品上架 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admin 可透過手機拍攝日本商品包裝照片（最多 3 張），使用 Gemini 3 Flash API 辨識圖片內容（品名、品牌、規格、描述），自動翻譯為繁中後產生商品上架草稿，確認後直接寫入 `products` 表。

**Architecture:** 前端在 Admin 頁面新增拍照區塊，圖片於前端壓縮後以 base64 傳送至 `POST /api/admin/recognize`。Workers 端呼叫 Gemini `gemini-3-flash-preview` 模型的 Vision + 結構化 JSON 輸出，支援兩種模式：快速導入（純圖片辨識）與聯網搜尋（Google Search grounding）。辨識結果回傳前端後顯示為可編輯草稿，Admin 確認後透過 `POST /api/admin/products` 寫入 D1。Gemini API Key 存於 `app_settings` 表，由 Admin 在設定頁填入。

**Tech Stack:** Cloudflare Workers, Cloudflare D1, Gemini API (`gemini-3-flash-preview`), Vanilla JS (MPA)

---

### Task 1: Gemini API Key 管理（app_settings + Admin UI）

**Files:**
- Modify: `workers/src/routes/pricing.ts` — 新增 `gemini_api_key` 的 get/set
- Modify: `workers/src/index.ts` — 註冊新 route `/api/admin/settings/gemini`
- Modify: `workers/public/admin.html` — 新增 API Key 輸入欄位
- Modify: `workers/public/assets/app-admin.js` — 載入/儲存 API Key

**Step 1: 新增 API Key 後端 route**

建立 `workers/src/routes/admin/settings.ts`：

```typescript
import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
};

async function ensureSettingsTable(db: D1DatabaseLike): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
}

export async function getGeminiApiKey(db: D1DatabaseLike): Promise<string> {
  await ensureSettingsTable(db);
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE key = 'gemini_api_key'")
    .first<{ value: string }>();
  return row?.value || "";
}

export async function handleAdminGeminiSettings(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "GET") {
    const key = await getGeminiApiKey(env.DB);
    // 只回傳是否已設定，不回傳完整 key
    return new Response(
      JSON.stringify({ ok: true, hasKey: key.length > 0, maskedKey: key ? key.slice(0, 6) + "..." : "" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: { geminiApiKey?: string };
  try {
    body = (await request.json()) as { geminiApiKey?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const apiKey = (body.geminiApiKey || "").trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "geminiApiKey is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  await ensureSettingsTable(env.DB);
  await env.DB
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('gemini_api_key', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(apiKey)
    .run();

  return new Response(
    JSON.stringify({ ok: true, maskedKey: apiKey.slice(0, 6) + "..." }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
```

**Step 2: 在 `workers/src/index.ts` 註冊 route**

在 `/api/admin/pricing` 後新增：

```typescript
import { handleAdminGeminiSettings } from "./routes/admin/settings";

// ... 在 router 中加入：
if (url.pathname === "/api/admin/settings/gemini") {
  if (!isAdmin) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return handleAdminGeminiSettings(request, env);
}
```

**Step 3: Admin HTML 加入 API Key 設定欄位**

在 `workers/public/admin.html` 的價格設定 section 後加入：

```html
<section class="admin-form-card">
  <h2 class="product-card__title">Gemini API 設定</h2>
  <div class="admin-actions">
    <label>Gemini API Key
      <input id="gemini-api-key" type="password" class="input-cute" placeholder="填入 Gemini API Key" />
    </label>
    <p id="gemini-key-status" class="meta">尚未設定</p>
    <button id="admin-save-gemini-key" class="button" type="button">儲存 API Key</button>
  </div>
</section>
```

**Step 4: Admin JS 加入載入/儲存 API Key 邏輯**

在 `workers/public/assets/app-admin.js` 的 `bootstrap()` 中加入：

```javascript
async function loadGeminiSettings() {
  const res = await fetch("/api/admin/settings/gemini");
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) return;
  const body = await res.json();
  const status = document.getElementById("gemini-key-status");
  if (status) {
    status.textContent = body.hasKey ? `已設定（${body.maskedKey}）` : "尚未設定";
  }
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
  if (!res.ok) { showError("儲存 API Key 失敗"); return; }
  input.value = "";
  await loadGeminiSettings();
}
```

在 `bootstrap()` 內綁定事件並呼叫 `loadGeminiSettings()`。

**Step 5: Commit**

```bash
git add workers/src/routes/admin/settings.ts workers/src/index.ts workers/public/admin.html workers/public/assets/app-admin.js
git commit -m "feat: add Gemini API key management in admin settings"
```

---

### Task 2: 圖片辨識 API Route（`/api/admin/recognize`）

**Files:**
- Create: `workers/src/routes/admin/recognize.ts`
- Modify: `workers/src/index.ts` — 註冊 route

**Step 1: 建立 recognize route**

建立 `workers/src/routes/admin/recognize.ts`：

```typescript
import type { D1DatabaseLike } from "../../types/d1";
import { getGeminiApiKey } from "./settings";

type Env = {
  DB: D1DatabaseLike;
};

type RecognizeRequest = {
  images: string[]; // base64 encoded JPEG, max 3
  mode: "quick" | "search"; // quick=純圖片辨識, search=聯網搜尋
};

type RecognizeResult = {
  titleJa: string;
  titleZhTw: string;
  brand: string;
  category: string;
  description: string;
  specs: Record<string, string>;
  priceJpy: number | null;
  sizeOptions: string[];
  colorOptions: string[];
  searchSources: string[];
};

const RECOGNIZE_PROMPT = `你是日本商品辨識專家。分析以下日本商品包裝照片，提取商品資訊並翻譯為繁體中文。

請回傳以下 JSON 格式：
{
  "titleJa": "日文商品名（從包裝上讀取）",
  "titleZhTw": "繁體中文商品名（翻譯）",
  "brand": "品牌名",
  "category": "商品分類（例如：保養品、零食、日用品、服飾、文具等）",
  "description": "繁體中文商品描述（50-100字）",
  "specs": { "容量": "...", "成分": "...", "產地": "...", "保存期限": "..." },
  "priceJpy": null,
  "sizeOptions": ["S", "M", "L"],
  "colorOptions": ["紅色", "藍色"],
  "searchSources": []
}

注意事項：
- 如果包裝上有價格標籤，填入 priceJpy（整數日圓）
- 如果無法辨識的欄位，用空字串或空陣列
- specs 只列出能從包裝上看到的規格
- sizeOptions/colorOptions 只列出包裝上標示的選項
- 品牌名保留日文/英文原文
- category 用繁體中文`;

const SEARCH_PROMPT_SUFFIX = `

同時請使用搜尋功能查詢這個商品的更多資訊，包括：
- 完整商品規格
- 建議售價
- 可購買的尺寸/顏色選項
- 用戶評價摘要
將搜尋到的資訊整合到回傳的 JSON 中，並在 searchSources 陣列中列出參考來源網址。`;

export async function handleAdminRecognize(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const apiKey = await getGeminiApiKey(env.DB);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Gemini API Key 尚未設定，請至 Admin 設定頁填入" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  let body: RecognizeRequest;
  try {
    body = (await request.json()) as RecognizeRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!Array.isArray(body.images) || body.images.length === 0 || body.images.length > 3) {
    return new Response(
      JSON.stringify({ ok: false, error: "images 需為 1-3 張 base64 圖片" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const mode = body.mode === "search" ? "search" : "quick";
  const prompt = mode === "search"
    ? RECOGNIZE_PROMPT + SEARCH_PROMPT_SUFFIX
    : RECOGNIZE_PROMPT;

  const imageParts = body.images.map((b64) => ({
    inline_data: { mime_type: "image/jpeg" as const, data: b64 },
  }));

  const geminiBody: Record<string, unknown> = {
    contents: [
      {
        parts: [
          ...imageParts,
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  // 聯網搜尋模式加入 Google Search grounding tool
  if (mode === "search") {
    geminiBody.tools = [
      { google_search_retrieval: { dynamic_retrieval_config: { mode: "MODE_DYNAMIC" } } },
    ];
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

  let geminiRes: Response;
  try {
    geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: `Gemini API 連線失敗：${String(err)}` }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => "");
    return new Response(
      JSON.stringify({ ok: false, error: `Gemini API 錯誤 (${geminiRes.status})：${errText.slice(0, 300)}` }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const geminiData = (await geminiRes.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!rawText) {
    return new Response(
      JSON.stringify({ ok: false, error: "Gemini 未回傳結果" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  let result: RecognizeResult;
  try {
    result = JSON.parse(rawText) as RecognizeResult;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Gemini 回傳格式解析失敗", raw: rawText.slice(0, 500) }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, mode, result }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
```

**Step 2: 在 `workers/src/index.ts` 註冊 route**

```typescript
import { handleAdminRecognize } from "./routes/admin/recognize";

// 在 router 中加入：
if (url.pathname === "/api/admin/recognize") {
  if (!isAdmin) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return handleAdminRecognize(request, env);
}
```

**Step 3: Commit**

```bash
git add workers/src/routes/admin/recognize.ts workers/src/index.ts
git commit -m "feat: add Gemini Vision recognize API route"
```

---

### Task 3: 手動商品上架 API Route（`/api/admin/products`）

**Files:**
- Create: `workers/src/routes/admin/products.ts`
- Modify: `workers/src/index.ts` — 註冊 route

**Step 1: 建立手動上架 route**

建立 `workers/src/routes/admin/products.ts`：

```typescript
import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
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
  imageDataUrl: string; // base64 data URL，先存為 image_url 欄位（後續可改 R2）
};

export async function handleAdminProducts(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: ManualProductRequest;
  try {
    body = (await request.json()) as ManualProductRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
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
  const payload = JSON.stringify({
    description: body.description || "",
    specs: body.specs || {},
    sizeOptions: Array.isArray(body.sizeOptions) ? body.sizeOptions : [],
    colorOptions: Array.isArray(body.colorOptions) ? body.colorOptions : [],
    gallery: body.imageDataUrl ? [body.imageDataUrl] : [],
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
      body.imageDataUrl || null,
      payload
    )
    .run();

  const productId = result?.meta?.last_row_id;

  return new Response(
    JSON.stringify({ ok: true, productId, code }),
    { status: 201, headers: { "content-type": "application/json" } }
  );
}
```

**Step 2: 在 `workers/src/index.ts` 註冊 route**

```typescript
import { handleAdminProducts } from "./routes/admin/products";

// 在 router 中加入：
if (url.pathname === "/api/admin/products") {
  if (!isAdmin) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return handleAdminProducts(request, env);
}
```

**Step 3: Commit**

```bash
git add workers/src/routes/admin/products.ts workers/src/index.ts
git commit -m "feat: add manual product listing API route"
```

---

### Task 4: Admin 前端 — 拍照 UI 區塊

**Files:**
- Modify: `workers/public/admin.html` — 新增拍照上架區塊
- Modify: `workers/public/assets/styles.css` — 新增拍照相關樣式

**Step 1: 在 admin.html 加入拍照上架區塊**

在 Gemini API 設定 section 後加入：

```html
<section class="admin-form-card" id="photo-recognize-section">
  <h2 class="product-card__title">📷 拍照辨識上架</h2>

  <div class="photo-upload-area">
    <div class="photo-preview-row" id="photo-previews"></div>
    <label class="btn-pill secondary photo-add-btn">
      拍照 / 選擇圖片（最多 3 張）
      <input id="photo-input" type="file" accept="image/*" capture="environment" multiple hidden />
    </label>
    <p class="meta" id="photo-count">已選 0 / 3 張</p>
  </div>

  <div class="photo-actions">
    <button id="btn-recognize-quick" class="button" type="button" disabled>⚡ 快速導入</button>
    <button id="btn-recognize-search" class="button secondary" type="button" disabled>🔍 聯網搜尋</button>
  </div>
  <p id="recognize-status" class="meta"></p>

  <div id="recognize-draft" class="recognize-draft hidden">
    <h3>商品草稿</h3>
    <label>日文品名
      <input id="draft-title-ja" type="text" class="input-cute" />
    </label>
    <label>中文品名
      <input id="draft-title-zh" type="text" class="input-cute" />
    </label>
    <label>品牌
      <input id="draft-brand" type="text" class="input-cute" />
    </label>
    <label>分類
      <input id="draft-category" type="text" class="input-cute" />
    </label>
    <label>價格（JPY）
      <input id="draft-price" type="number" min="0" class="input-cute" />
    </label>
    <label>商品描述
      <textarea id="draft-description" rows="3" class="input-cute"></textarea>
    </label>
    <label>規格（JSON）
      <textarea id="draft-specs" rows="3" class="input-cute"></textarea>
    </label>
    <label>尺寸選項（逗號分隔）
      <input id="draft-sizes" type="text" class="input-cute" placeholder="S, M, L" />
    </label>
    <label>顏色選項（逗號分隔）
      <input id="draft-colors" type="text" class="input-cute" placeholder="紅色, 藍色" />
    </label>
    <div id="draft-sources" class="meta hidden"></div>
    <div class="photo-actions">
      <button id="btn-confirm-listing" class="button" type="button">✅ 確認上架</button>
      <button id="btn-cancel-draft" class="button secondary" type="button">取消</button>
    </div>
    <p id="listing-status" class="meta"></p>
  </div>
</section>
```

**Step 2: 新增 CSS 樣式**

在 `workers/public/assets/styles.css` 末尾加入：

```css
/* Photo recognize */
.photo-upload-area {
  margin-bottom: 1rem;
}

.photo-preview-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.photo-preview-item {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--line);
}

.photo-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-preview-item .photo-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  font-size: 12px;
  cursor: pointer;
  line-height: 1;
}

.photo-add-btn {
  display: inline-block;
  cursor: pointer;
}

.photo-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.recognize-draft label {
  display: block;
  margin-bottom: 0.5rem;
}

.recognize-draft .input-cute {
  width: 100%;
}
```

**Step 3: Commit**

```bash
git add workers/public/admin.html workers/public/assets/styles.css
git commit -m "feat: add photo recognize UI section in admin page"
```

---

### Task 5: Admin 前端 — 拍照辨識 + 上架 JS 邏輯

**Files:**
- Create: `workers/public/assets/app-admin-recognize.js` — 拍照辨識模組
- Modify: `workers/public/admin.html` — 引入新 script

**Step 1: 建立拍照辨識 JS 模組**

建立 `workers/public/assets/app-admin-recognize.js`：

```javascript
const MAX_PHOTOS = 3;
const MAX_IMAGE_SIZE = 800; // 壓縮到最大 800px 邊
const JPEG_QUALITY = 0.7;

let selectedImages = []; // { file, dataUrl, base64 }

function showRecognizeStatus(text) {
  const node = document.getElementById("recognize-status");
  if (node) node.textContent = text;
}

function showListingStatus(text) {
  const node = document.getElementById("listing-status");
  if (node) node.textContent = text;
}

function updateButtons() {
  const quickBtn = document.getElementById("btn-recognize-quick");
  const searchBtn = document.getElementById("btn-recognize-search");
  const hasImages = selectedImages.length > 0;
  if (quickBtn) quickBtn.disabled = !hasImages;
  if (searchBtn) searchBtn.disabled = !hasImages;
  const count = document.getElementById("photo-count");
  if (count) count.textContent = `已選 ${selectedImages.length} / ${MAX_PHOTOS} 張`;
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > MAX_IMAGE_SIZE || h > MAX_IMAGE_SIZE) {
        if (w > h) {
          h = Math.round((h * MAX_IMAGE_SIZE) / w);
          w = MAX_IMAGE_SIZE;
        } else {
          w = Math.round((w * MAX_IMAGE_SIZE) / h);
          h = MAX_IMAGE_SIZE;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64 = dataUrl.split(",")[1];
      resolve({ file, dataUrl, base64 });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function renderPreviews() {
  const row = document.getElementById("photo-previews");
  if (!row) return;
  row.innerHTML = selectedImages
    .map(
      (img, idx) => `
    <div class="photo-preview-item">
      <img src="${img.dataUrl}" alt="照片 ${idx + 1}" />
      <button class="photo-remove" data-idx="${idx}" type="button">&times;</button>
    </div>`
    )
    .join("");

  row.querySelectorAll(".photo-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      selectedImages.splice(idx, 1);
      renderPreviews();
      updateButtons();
    });
  });
}

async function onPhotosSelected(event) {
  const files = Array.from(event.target.files || []);
  const remaining = MAX_PHOTOS - selectedImages.length;
  const toProcess = files.slice(0, remaining);

  for (const file of toProcess) {
    try {
      const compressed = await compressImage(file);
      selectedImages.push(compressed);
    } catch (err) {
      console.error("壓縮圖片失敗", err);
    }
  }

  renderPreviews();
  updateButtons();
  event.target.value = "";
}

async function doRecognize(mode) {
  if (selectedImages.length === 0) return;

  showRecognizeStatus(mode === "search" ? "聯網搜尋中，請稍候..." : "辨識中，請稍候...");
  const quickBtn = document.getElementById("btn-recognize-quick");
  const searchBtn = document.getElementById("btn-recognize-search");
  if (quickBtn) quickBtn.disabled = true;
  if (searchBtn) searchBtn.disabled = true;

  try {
    const res = await fetch("/api/admin/recognize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        images: selectedImages.map((img) => img.base64),
        mode,
      }),
    });

    if (res.status === 401) {
      location.href = "/admin-login.html";
      return;
    }

    const data = await res.json();
    if (!data.ok) {
      showRecognizeStatus(`辨識失敗：${data.error || "未知錯誤"}`);
      return;
    }

    showRecognizeStatus("辨識完成！請檢查草稿內容。");
    fillDraft(data.result);
  } catch (err) {
    showRecognizeStatus(`辨識失敗：${String(err)}`);
  } finally {
    updateButtons();
  }
}

function fillDraft(result) {
  const draft = document.getElementById("recognize-draft");
  if (draft) draft.classList.remove("hidden");

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
  };

  set("draft-title-ja", result.titleJa);
  set("draft-title-zh", result.titleZhTw);
  set("draft-brand", result.brand);
  set("draft-category", result.category);
  set("draft-price", result.priceJpy);
  set("draft-description", result.description);
  set("draft-specs", JSON.stringify(result.specs || {}, null, 2));
  set("draft-sizes", Array.isArray(result.sizeOptions) ? result.sizeOptions.join(", ") : "");
  set("draft-colors", Array.isArray(result.colorOptions) ? result.colorOptions.join(", ") : "");

  const sourcesEl = document.getElementById("draft-sources");
  if (sourcesEl && Array.isArray(result.searchSources) && result.searchSources.length > 0) {
    sourcesEl.classList.remove("hidden");
    sourcesEl.innerHTML = "<strong>搜尋來源：</strong>" +
      result.searchSources.map((s) => `<a href="${s}" target="_blank" rel="noopener">${s}</a>`).join("、");
  } else if (sourcesEl) {
    sourcesEl.classList.add("hidden");
  }
}

function cancelDraft() {
  const draft = document.getElementById("recognize-draft");
  if (draft) draft.classList.add("hidden");
  showRecognizeStatus("");
  showListingStatus("");
}

async function confirmListing() {
  const get = (id) => document.getElementById(id)?.value?.trim() || "";

  const titleJa = get("draft-title-ja");
  const titleZhTw = get("draft-title-zh");
  if (!titleJa && !titleZhTw) {
    showListingStatus("商品名稱（日文或中文）為必填");
    return;
  }

  let specs = {};
  try {
    const raw = get("draft-specs");
    if (raw) specs = JSON.parse(raw);
  } catch {
    showListingStatus("規格 JSON 格式錯誤");
    return;
  }

  const priceRaw = get("draft-price");
  const priceJpy = priceRaw ? Number(priceRaw) : null;

  const payload = {
    titleJa,
    titleZhTw,
    brand: get("draft-brand"),
    category: get("draft-category"),
    priceJpyTaxIn: Number.isFinite(priceJpy) ? priceJpy : null,
    description: get("draft-description"),
    specs,
    sizeOptions: get("draft-sizes").split(",").map((s) => s.trim()).filter(Boolean),
    colorOptions: get("draft-colors").split(",").map((s) => s.trim()).filter(Boolean),
    imageDataUrl: selectedImages.length > 0 ? selectedImages[0].dataUrl : "",
  };

  showListingStatus("上架中...");
  const btn = document.getElementById("btn-confirm-listing");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      location.href = "/admin-login.html";
      return;
    }

    const data = await res.json();
    if (!data.ok) {
      showListingStatus(`上架失敗：${data.error || "未知錯誤"}`);
      return;
    }

    showListingStatus(`上架成功！商品代碼：${data.code}`);
    selectedImages = [];
    renderPreviews();
    updateButtons();
    setTimeout(() => cancelDraft(), 2000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function initPhotoRecognize() {
  const input = document.getElementById("photo-input");
  if (input) input.addEventListener("change", onPhotosSelected);

  const quickBtn = document.getElementById("btn-recognize-quick");
  if (quickBtn) quickBtn.addEventListener("click", () => doRecognize("quick"));

  const searchBtn = document.getElementById("btn-recognize-search");
  if (searchBtn) searchBtn.addEventListener("click", () => doRecognize("search"));

  const cancelBtn = document.getElementById("btn-cancel-draft");
  if (cancelBtn) cancelBtn.addEventListener("click", cancelDraft);

  const confirmBtn = document.getElementById("btn-confirm-listing");
  if (confirmBtn) confirmBtn.addEventListener("click", confirmListing);

  updateButtons();
}
```

**Step 2: 在 admin.html 引入模組並初始化**

在 `workers/public/admin.html` 的 `<script>` 標籤前加入：

```html
<script type="module">
  import { initPhotoRecognize } from "/assets/app-admin-recognize.js";
  document.addEventListener("DOMContentLoaded", initPhotoRecognize);
</script>
```

注意：因為 `app-admin.js` 已經在頁面底部，新模組可以獨立載入初始化，不需改動 `app-admin.js`。

**Step 3: Commit**

```bash
git add workers/public/assets/app-admin-recognize.js workers/public/admin.html
git commit -m "feat: add photo recognize + product listing JS logic in admin"
```

---

### Task 6: 整合測試與收尾

**Files:**
- Modify: `workers/src/index.ts` — 確認所有新 route 完整註冊
- 全部檔案 — 手動測試

**Step 1: 確認 `index.ts` 完整 route 註冊**

確認以下三個新 route 都已在 `workers/src/index.ts` 中：

```typescript
// 在 admin routes 區塊中，確認以下三行存在：
if (url.pathname === "/api/admin/settings/gemini") { ... }
if (url.pathname === "/api/admin/recognize") { ... }
if (url.pathname === "/api/admin/products") { ... }
```

**Step 2: 啟動 dev server 測試**

```bash
cd workers && npx wrangler dev
```

測試流程：
1. 登入 Admin → 看到 Gemini API 設定區塊 → 填入 API Key → 儲存 → 顯示已設定
2. 看到拍照辨識區塊 → 選擇 1-3 張照片 → 預覽顯示正確
3. 點「快速導入」→ 顯示辨識中 → 回傳結果填入草稿
4. 點「聯網搜尋」→ 顯示搜尋中 → 回傳結果含搜尋來源
5. 修改草稿欄位 → 點「確認上架」→ 寫入成功 → 前台商品列表可見

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete photo recognize product listing feature"
```

---

## 檔案異動總覽

| 檔案 | 動作 | 說明 |
|---|---|---|
| `workers/src/routes/admin/settings.ts` | 新增 | Gemini API Key CRUD |
| `workers/src/routes/admin/recognize.ts` | 新增 | Gemini Vision 辨識 API |
| `workers/src/routes/admin/products.ts` | 新增 | 手動商品上架 API |
| `workers/public/assets/app-admin-recognize.js` | 新增 | 拍照 + 辨識 + 上架前端邏輯 |
| `workers/src/index.ts` | 修改 | 註冊 3 個新 route |
| `workers/public/admin.html` | 修改 | 新增 API Key 設定 + 拍照上架 UI |
| `workers/public/assets/styles.css` | 修改 | 拍照預覽樣式 |
| `workers/public/assets/app-admin.js` | 修改 | API Key 載入/儲存 |
