# PAYUNi 訂閱方案線上付款 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 賣家在主網域選方案（Plus/Pro/Pro+ × 1/6/12 個月）→ 跳轉 PAYUNi UPP 付款（信用卡/ATM）→ notify 自動開通方案。

**Architecture:** 協議層（AES-256-GCM 加解密、HashInfo、UPP 欄位）與決策層（訂單編號、開通計算、notify 動作判斷）放 `src/shared/*.js` 純 JS 模組以便 `node:test` 單測；`src/routes/billing.ts` 是薄 glue 接 D1 與 HTTP；端點掛在 `src/index.ts` 主網域區段（session cookie 為 host-only，與 `/auth/me` 同模式）。

**Tech Stack:** Cloudflare Workers、D1、WebCrypto（Workers 與 Node 20 皆有 `globalThis.crypto.subtle`）、node:test。

**Spec:** `docs/superpowers/specs/2026-06-11-payuni-subscription-billing-design.md`

**PAYUNi 協議備忘（依官方 PHP SDK `payuni/PHP_SDK` 確認）：**
- 端點：正式 `https://api.payuni.com.tw/api/`，sandbox `https://sandbox-api.payuni.com.tw/api/`
- UPP = form POST `{base}upp`，欄位 `MerID` / `Version`("1.0") / `EncryptInfo` / `HashInfo`
- `EncryptInfo` = `hex( base64(ciphertext) + ":::" + base64(gcmTag) )`，AES-256-GCM，key=HashKey(32B)、iv=HashIV(16B)，明文為 query string
- `HashInfo` = `UPPER(SHA256(HashKey + EncryptInfo + HashIV))`
- notify/return 回傳亦為 `EncryptInfo`+`HashInfo`，驗 hash → 解密 → parse query string；`TradeStatus === "1"` 為已付款
- UPP 顯示哪些付款方式由 PAYUNi 商店後台設定（業主需在 PAYUNi 後台只開信用卡＋ATM），程式不傳限制參數

---

### Task 1: payment_orders 資料表 migration

**Files:**
- Create: `migrations/0021_payment_orders.sql`

- [ ] **Step 1: 建立 migration 檔**

```sql
-- Payment orders for PAYUNi subscription billing
CREATE TABLE payment_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  mer_trade_no TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  months INTEGER NOT NULL,
  days INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pay_type TEXT,
  payuni_trade_no TEXT,
  atm_bank_code TEXT,
  atm_account TEXT,
  atm_expire_at TEXT,
  raw_notify TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE INDEX idx_payment_orders_store ON payment_orders(store_id);
```

- [ ] **Step 2: 套用到本機 D1**

Run: `npx wrangler d1 migrations apply japan_buy --local`
Expected: `0021_payment_orders.sql` listed as applied, no error.

- [ ] **Step 3: Commit**

```bash
git add migrations/0021_payment_orders.sql
git commit -m "feat(billing): add payment_orders table for PAYUNi orders"
```

---

### Task 2: PAYUNi 協議模組 `src/shared/payuni.js`

**Files:**
- Create: `src/shared/payuni.js`
- Test: `test/payuni.test.js`

- [ ] **Step 1: 先寫失敗測試 `test/payuni.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  encryptInfo,
  decryptInfo,
  hashInfo,
  apiBase,
  buildUppRequest,
  verifyAndDecrypt,
} from "../src/shared/payuni.js";

const KEY = "12345678901234567890123456789012"; // 32 bytes（PHP SDK 範例值）
const IV = "1234567890123456"; // 16 bytes

test("encryptInfo produces PHP-SDK-compatible envelope and round-trips", async () => {
  const params = { MerID: "abc", MerTradeNo: "VS1TEST001", TradeAmt: 490, Timestamp: 1760000000 };
  const enc = await encryptInfo(params, KEY, IV);

  // 整串為 hex
  assert.match(enc, /^[0-9a-f]+$/);
  // hex 解開後是 base64(cipher):::base64(tag)
  const combined = Buffer.from(enc, "hex").toString("utf8");
  const idx = combined.indexOf(":::");
  assert.ok(idx > 0, "expected ':::' separator");
  const tag = Buffer.from(combined.slice(idx + 3), "base64");
  assert.equal(tag.length, 16, "GCM tag must be 16 bytes");

  const dec = await decryptInfo(enc, KEY, IV);
  assert.deepEqual(dec, {
    MerID: "abc",
    MerTradeNo: "VS1TEST001",
    TradeAmt: "490",
    Timestamp: "1760000000",
  });
});

test("decryptInfo rejects tampered ciphertext", async () => {
  const enc = await encryptInfo({ A: "1" }, KEY, IV);
  const tampered = (enc[0] === "0" ? "1" : "0") + enc.slice(1);
  await assert.rejects(() => decryptInfo(tampered, KEY, IV));
});

test("hashInfo matches UPPER(SHA256(key + enc + iv))", async () => {
  const enc = "deadbeef";
  const expected = createHash("sha256").update(`${KEY}${enc}${IV}`).digest("hex").toUpperCase();
  assert.equal(await hashInfo(enc, KEY, IV), expected);
});

test("apiBase switches sandbox/production", () => {
  assert.equal(apiBase(true), "https://sandbox-api.payuni.com.tw/api/");
  assert.equal(apiBase(false), "https://api.payuni.com.tw/api/");
});

test("buildUppRequest returns action url and the four form fields", async () => {
  const req = await buildUppRequest(
    { merId: "abc", hashKey: KEY, hashIv: IV, sandbox: true },
    {
      merTradeNo: "VS1TEST002",
      tradeAmt: 880,
      timestamp: 1760000000,
      prodDesc: "Pro 方案 1 個月",
      usrMail: "a@b.tw",
      returnUrl: "https://vovosnap.com/api/billing/return",
      notifyUrl: "https://vovosnap.com/api/billing/notify",
    }
  );
  assert.equal(req.action, "https://sandbox-api.payuni.com.tw/api/upp");
  assert.equal(req.fields.MerID, "abc");
  assert.equal(req.fields.Version, "1.0");
  assert.equal(req.fields.HashInfo, await hashInfo(req.fields.EncryptInfo, KEY, IV));
  const dec = await decryptInfo(req.fields.EncryptInfo, KEY, IV);
  assert.equal(dec.MerTradeNo, "VS1TEST002");
  assert.equal(dec.TradeAmt, "880");
  assert.equal(dec.NotifyURL, "https://vovosnap.com/api/billing/notify");
});

test("verifyAndDecrypt accepts valid payload and rejects bad hash", async () => {
  const enc = await encryptInfo({ TradeStatus: "1", MerTradeNo: "VS1X" }, KEY, IV);
  const good = { EncryptInfo: enc, HashInfo: await hashInfo(enc, KEY, IV) };
  const dec = await verifyAndDecrypt(good, KEY, IV);
  assert.equal(dec.TradeStatus, "1");

  await assert.rejects(
    () => verifyAndDecrypt({ EncryptInfo: enc, HashInfo: "0".repeat(64) }, KEY, IV),
    /hash/i
  );
  await assert.rejects(() => verifyAndDecrypt({}, KEY, IV), /missing/i);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/payuni.test.js`
Expected: FAIL（`Cannot find module '../src/shared/payuni.js'`）

- [ ] **Step 3: 實作 `src/shared/payuni.js`**

```js
// PAYUNi 統一金流協議層（UPP 整合式支付頁）
// 加密封包格式須與官方 PHP SDK 相容：hex( base64(ciphertext) + ":::" + base64(tag) )
// 純函式、不碰 D1 — 供 src/routes/billing.ts 使用並由 test/payuni.test.js 單測

const te = new TextEncoder();
const td = new TextDecoder();

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error("Invalid hex in EncryptInfo");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToBase64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(key) {
  return crypto.subtle.importKey("raw", te.encode(key.trim()), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptInfo(params, key, iv) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.append(k, String(v));
  const cryptoKey = await importKey(key);
  const buf = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: te.encode(iv.trim()), tagLength: 128 },
      cryptoKey,
      te.encode(qs.toString())
    )
  );
  // WebCrypto 輸出為 ciphertext‖tag 連體，切出最後 16 bytes 當 GCM tag
  const cipher = buf.slice(0, buf.length - 16);
  const tag = buf.slice(buf.length - 16);
  const combined = `${bytesToBase64(cipher)}:::${bytesToBase64(tag)}`;
  return bytesToHex(te.encode(combined));
}

export async function decryptInfo(encryptStr, key, iv) {
  const combined = td.decode(hexToBytes(String(encryptStr).trim()));
  const idx = combined.indexOf(":::");
  if (idx < 0) throw new Error("Invalid EncryptInfo format");
  const cipher = base64ToBytes(combined.slice(0, idx));
  const tag = base64ToBytes(combined.slice(idx + 3));
  const joined = new Uint8Array(cipher.length + tag.length);
  joined.set(cipher, 0);
  joined.set(tag, cipher.length);
  const cryptoKey = await importKey(key);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: te.encode(iv.trim()), tagLength: 128 },
    cryptoKey,
    joined
  );
  const out = {};
  for (const [k, v] of new URLSearchParams(td.decode(plain)).entries()) out[k] = v;
  return out;
}

export async function hashInfo(encryptStr, key, iv) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    te.encode(`${key.trim()}${encryptStr}${iv.trim()}`)
  );
  return bytesToHex(new Uint8Array(digest)).toUpperCase();
}

export function apiBase(sandbox) {
  return sandbox ? "https://sandbox-api.payuni.com.tw/api/" : "https://api.payuni.com.tw/api/";
}

export async function buildUppRequest(cfg, opts) {
  const enc = await encryptInfo(
    {
      MerID: cfg.merId,
      MerTradeNo: opts.merTradeNo,
      TradeAmt: opts.tradeAmt,
      Timestamp: opts.timestamp,
      ReturnURL: opts.returnUrl,
      NotifyURL: opts.notifyUrl,
      ProdDesc: opts.prodDesc,
      UsrMail: opts.usrMail || "",
    },
    cfg.hashKey,
    cfg.hashIv
  );
  return {
    action: `${apiBase(cfg.sandbox)}upp`,
    fields: {
      MerID: cfg.merId,
      Version: "1.0",
      EncryptInfo: enc,
      HashInfo: await hashInfo(enc, cfg.hashKey, cfg.hashIv),
    },
  };
}

export async function verifyAndDecrypt(form, key, iv) {
  if (!form || !form.EncryptInfo || !form.HashInfo) {
    throw new Error("missing EncryptInfo/HashInfo");
  }
  const expected = await hashInfo(form.EncryptInfo, key, iv);
  if (expected !== String(form.HashInfo).toUpperCase()) {
    throw new Error("Hash mismatch");
  }
  return decryptInfo(form.EncryptInfo, key, iv);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/payuni.test.js`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/payuni.js test/payuni.test.js
git commit -m "feat(billing): add PAYUNi protocol module (AES-256-GCM, PHP SDK compatible)"
```

---

### Task 3: 決策層 `src/shared/billing-logic.js`

**Files:**
- Create: `src/shared/billing-logic.js`
- Test: `test/billing-logic.test.js`

- [ ] **Step 1: 先寫失敗測試 `test/billing-logic.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  PAYABLE_PLANS,
  PLAN_LABELS,
  makeMerTradeNo,
  decideNotifyAction,
  computeActivation,
} from "../src/shared/billing-logic.js";

test("PAYABLE_PLANS excludes free", () => {
  assert.deepEqual(PAYABLE_PLANS, ["plus", "pro", "proplus"]);
  assert.equal(PLAN_LABELS.proplus, "Pro+");
});

test("makeMerTradeNo is alphanumeric, <=20 chars, unique-ish", () => {
  const a = makeMerTradeNo(999999, 1760000000000);
  const b = makeMerTradeNo(999999, 1760000000000);
  assert.match(a, /^VS[0-9a-z]+$/i);
  assert.ok(a.length <= 20, `length ${a.length} > 20`);
  assert.notEqual(a, b, "random suffix must differ");
});

test("decideNotifyAction: paid order is idempotent", () => {
  assert.equal(
    decideNotifyAction({ orderStatus: "paid", orderAmount: 490, tradeStatus: "1", tradeAmt: "490" }),
    "already-paid"
  );
});

test("decideNotifyAction: amount mismatch is flagged", () => {
  assert.equal(
    decideNotifyAction({ orderStatus: "pending", orderAmount: 490, tradeStatus: "1", tradeAmt: "1" }),
    "amount-mismatch"
  );
});

test("decideNotifyAction: TradeStatus 1 with matching amount activates", () => {
  assert.equal(
    decideNotifyAction({ orderStatus: "pending", orderAmount: 490, tradeStatus: "1", tradeAmt: "490" }),
    "activate"
  );
});

test("decideNotifyAction: non-paid status stays pending (ATM 取號)", () => {
  assert.equal(
    decideNotifyAction({ orderStatus: "pending", orderAmount: 490, tradeStatus: "0", tradeAmt: "490" }),
    "pending"
  );
});

test("computeActivation: same plan with future expiry extends from expiry", () => {
  const now = new Date("2026-06-11T00:00:00.000Z");
  const r = computeActivation({
    currentPlan: "pro",
    currentExpiresAt: "2026-07-01T00:00:00.000Z",
    orderPlan: "pro",
    days: 30,
    now,
  });
  assert.equal(r.plan, "pro");
  assert.equal(r.expiresAt, "2026-07-31T00:00:00.000Z");
});

test("computeActivation: same plan but expired extends from now", () => {
  const now = new Date("2026-06-11T00:00:00.000Z");
  const r = computeActivation({
    currentPlan: "pro",
    currentExpiresAt: "2026-05-01T00:00:00.000Z",
    orderPlan: "pro",
    days: 30,
    now,
  });
  assert.equal(r.expiresAt, "2026-07-11T00:00:00.000Z");
});

test("computeActivation: cross-plan starts fresh from now", () => {
  const now = new Date("2026-06-11T00:00:00.000Z");
  const r = computeActivation({
    currentPlan: "plus",
    currentExpiresAt: "2026-12-01T00:00:00.000Z",
    orderPlan: "proplus",
    days: 420,
    now,
  });
  assert.equal(r.plan, "proplus");
  assert.equal(r.expiresAt, new Date(now.getTime() + 420 * 86400000).toISOString());
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/billing-logic.test.js`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作 `src/shared/billing-logic.js`**

```js
// 訂閱付款決策層：訂單編號、notify 動作判斷、方案開通計算
// 純函式、不碰 D1 — 供 src/routes/billing.ts 使用

export const PAYABLE_PLANS = ["plus", "pro", "proplus"];

export const PLAN_LABELS = { plus: "Plus", pro: "Pro", proplus: "Pro+" };

// PAYUNi MerTradeNo 上限 20 字元、英數字。
// VS + storeId + base36 時戳 + 3 碼亂數；storeId 到 6 位數仍 <= 20。
export function makeMerTradeNo(storeId, nowMs = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 5);
  return `VS${storeId}${nowMs.toString(36)}${rand}`;
}

export function decideNotifyAction({ orderStatus, orderAmount, tradeStatus, tradeAmt }) {
  if (orderStatus === "paid") return "already-paid";
  if (String(tradeStatus) === "1") {
    if (Number(tradeAmt) !== Number(orderAmount)) return "amount-mismatch";
    return "activate";
  }
  return "pending";
}

const DAY_MS = 86400000;

export function computeActivation({ currentPlan, currentExpiresAt, orderPlan, days, now }) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  let baseMs = nowMs;
  if (currentPlan === orderPlan && currentExpiresAt) {
    const cur = new Date(currentExpiresAt).getTime();
    if (Number.isFinite(cur) && cur > nowMs) baseMs = cur;
  }
  return {
    plan: orderPlan,
    expiresAt: new Date(baseMs + days * DAY_MS).toISOString(),
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/billing-logic.test.js`
Expected: 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/billing-logic.js test/billing-logic.test.js
git commit -m "feat(billing): add billing decision logic (order no, notify action, activation)"
```

---

### Task 4: HTTP 層 `src/routes/billing.ts` ＋ index.ts 掛載

**Files:**
- Create: `src/routes/billing.ts`
- Modify: `src/index.ts`（Env type ＋ 主網域路由區段，`/api/plan-offers` 附近）
- Modify: `src/routes/platform-admin.ts:48,65`（`ensureLogTable`、`getTestStoreIds` 加 `export`）
- Test: `test/billing-routes.test.js`（字串斷言，比照 `test/ai-image-storage.test.js` 形式）

- [ ] **Step 1: platform-admin.ts 兩個函式加 export**

`src/routes/platform-admin.ts:48` 的 `async function ensureLogTable` 與 `:65` 的 `async function getTestStoreIds` 前面各加 `export `。

- [ ] **Step 2: 建立 `src/routes/billing.ts`**

```ts
import type { D1DatabaseLike } from "../types/d1";
import { DEFAULT_PLAN_OFFERS, getPlanOfferByMonths } from "../shared/plan-offers.js";
import {
  PAYABLE_PLANS,
  PLAN_LABELS,
  makeMerTradeNo,
  decideNotifyAction,
  computeActivation,
} from "../shared/billing-logic.js";
import { buildUppRequest, verifyAndDecrypt } from "../shared/payuni.js";
import { parseCookieHeader, STORE_COOKIE_NAME } from "./admin/auth";
import { ensureLogTable, getTestStoreIds } from "./platform-admin";

export type BillingEnv = {
  DB: D1DatabaseLike;
  APP_URL: string;
  PAYUNI_MER_ID?: string;
  PAYUNI_HASH_KEY?: string;
  PAYUNI_HASH_IV?: string;
  PAYUNI_SANDBOX?: string; // "1" = sandbox
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function payuniConfig(env: BillingEnv) {
  if (!env.PAYUNI_MER_ID || !env.PAYUNI_HASH_KEY || !env.PAYUNI_HASH_IV) return null;
  return {
    merId: env.PAYUNI_MER_ID,
    hashKey: env.PAYUNI_HASH_KEY,
    hashIv: env.PAYUNI_HASH_IV,
    sandbox: env.PAYUNI_SANDBOX === "1",
  };
}

type SessionStore = {
  id: number;
  plan: string;
  plan_expires_at: string | null;
  owner_email: string | null;
};

async function getSessionStore(request: Request, db: D1DatabaseLike): Promise<SessionStore | null> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[STORE_COOKIE_NAME];
  if (!token) return null;
  const session = await db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(token)
    .first<{ store_id: number }>();
  if (!session) return null;
  return db
    .prepare("SELECT id, plan, plan_expires_at, owner_email FROM stores WHERE id = ? AND is_active = 1")
    .bind(session.store_id)
    .first<SessionStore>();
}

type OrderRow = {
  id: number;
  store_id: number;
  mer_trade_no: string;
  plan: string;
  months: number;
  days: number;
  amount: number;
  status: string;
  atm_bank_code: string | null;
  atm_account: string | null;
  atm_expire_at: string | null;
  paid_at: string | null;
};

// POST /api/billing/checkout  body: { plan, months }
export async function handleBillingCheckout(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const cfg = payuniConfig(env);
  if (!cfg) return json({ ok: false, error: "金流尚未設定" }, 503);

  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "請先登入" }, 401);

  let body: { plan?: string; months?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const plan = String(body.plan || "");
  const months = Number(body.months);
  if (!PAYABLE_PLANS.includes(plan)) return json({ ok: false, error: "無效的方案" }, 400);
  const offer = getPlanOfferByMonths(plan, months, DEFAULT_PLAN_OFFERS);
  if (!offer) return json({ ok: false, error: "無效的方案期數" }, 400);

  const merTradeNo = makeMerTradeNo(store.id);
  await env.DB
    .prepare(
      "INSERT INTO payment_orders (store_id, mer_trade_no, plan, months, days, amount) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(store.id, merTradeNo, plan, offer.months, offer.days, offer.amount)
    .run();

  const usrMail =
    store.owner_email && !store.owner_email.endsWith("@placeholder.local")
      ? store.owner_email
      : "";
  const upp = await buildUppRequest(cfg, {
    merTradeNo,
    tradeAmt: offer.amount,
    timestamp: Math.floor(Date.now() / 1000),
    prodDesc: `我拍開店平台 ${PLAN_LABELS[plan as keyof typeof PLAN_LABELS]} 方案 ${offer.months} 個月`,
    usrMail,
    returnUrl: `${env.APP_URL}/api/billing/return`,
    notifyUrl: `${env.APP_URL}/api/billing/notify`,
  });

  return json({ ok: true, merTradeNo, action: upp.action, fields: upp.fields });
}

async function applyActivation(db: D1DatabaseLike, order: OrderRow, data: Record<string, string>) {
  const storeRow = await db
    .prepare("SELECT plan, plan_expires_at FROM stores WHERE id = ?")
    .bind(order.store_id)
    .first<{ plan: string; plan_expires_at: string | null }>();
  const activation = computeActivation({
    currentPlan: storeRow?.plan || "free",
    currentExpiresAt: storeRow?.plan_expires_at || null,
    orderPlan: order.plan,
    days: order.days,
    now: new Date(),
  });
  await db
    .prepare(
      "UPDATE stores SET plan = ?, plan_expires_at = ?, plan_paid_amount = ?, plan_started_at = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .bind(activation.plan, activation.expiresAt, order.amount, new Date().toISOString(), order.store_id)
    .run();
  await db
    .prepare(
      "UPDATE payment_orders SET status = 'paid', paid_at = datetime('now'), pay_type = ?, payuni_trade_no = ?, raw_notify = ? WHERE id = ? AND status != 'paid'"
    )
    .bind(data.PaymentType || null, data.TradeNo || null, JSON.stringify(data), order.id)
    .run();

  // 與 platform-admin 人工開通一致：記錄營收（排除測試店）
  const testIds = await getTestStoreIds(db);
  if (!testIds.includes(order.store_id)) {
    await ensureLogTable(db);
    const s = await db
      .prepare("SELECT name, owner_email FROM stores WHERE id = ?")
      .bind(order.store_id)
      .first<{ name: string; owner_email: string }>();
    await db
      .prepare(
        "INSERT INTO plan_change_logs (store_id, store_name, store_email, plan, days, amount) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(order.store_id, s?.name || "", s?.owner_email || "", order.plan, order.days, order.amount)
      .run();
  }
}

async function parseNotifyForm(request: Request): Promise<Record<string, string>> {
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

// POST /api/billing/notify — PAYUNi 伺服器背景通知
export async function handleBillingNotify(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const cfg = payuniConfig(env);
  if (!cfg) return new Response("not configured", { status: 503 });

  let data: Record<string, string>;
  try {
    data = await verifyAndDecrypt(await parseNotifyForm(request), cfg.hashKey, cfg.hashIv);
  } catch {
    return new Response("verify failed", { status: 400 });
  }

  const order = await env.DB
    .prepare("SELECT * FROM payment_orders WHERE mer_trade_no = ?")
    .bind(data.MerTradeNo || "")
    .first<OrderRow>();
  if (!order) return new Response("order not found", { status: 404 });

  const action = decideNotifyAction({
    orderStatus: order.status,
    orderAmount: order.amount,
    tradeStatus: data.TradeStatus,
    tradeAmt: data.TradeAmt,
  });

  if (action === "already-paid") return new Response("OK");
  if (action === "amount-mismatch") {
    await env.DB
      .prepare("UPDATE payment_orders SET status = 'failed', raw_notify = ? WHERE id = ?")
      .bind(JSON.stringify(data), order.id)
      .run();
    return new Response("OK");
  }
  if (action === "activate") {
    await applyActivation(env.DB, order, data);
    return new Response("OK");
  }
  // pending：ATM 取號等，回填帳號資訊（欄位名稱防禦性讀取）
  await env.DB
    .prepare(
      "UPDATE payment_orders SET pay_type = ?, payuni_trade_no = ?, atm_bank_code = ?, atm_account = ?, atm_expire_at = ?, raw_notify = ? WHERE id = ?"
    )
    .bind(
      data.PaymentType || null,
      data.TradeNo || null,
      data.BankType || data.Bank || null,
      data.PayNo || data.Account || null,
      data.ExpireDate || null,
      JSON.stringify(data),
      order.id
    )
    .run();
  return new Response("OK");
}

// POST /api/billing/return — 瀏覽器從 PAYUNi 跳回
export async function handleBillingReturn(request: Request, env: BillingEnv): Promise<Response> {
  const cfg = payuniConfig(env);
  const redirect = (qs: string) =>
    new Response(null, { status: 302, headers: { location: `/billing-result.html?${qs}` } });
  if (!cfg) return redirect("status=error");
  try {
    const data = await verifyAndDecrypt(await parseNotifyForm(request), cfg.hashKey, cfg.hashIv);
    const order = encodeURIComponent(data.MerTradeNo || "");
    const status = String(data.TradeStatus) === "1" ? "paid" : "pending";
    return redirect(`order=${order}&status=${status}`);
  } catch {
    return redirect("status=error");
  }
}

// GET /api/billing/order-status?order={merTradeNo} — 結果頁輪詢（限本店訂單）
export async function handleBillingOrderStatus(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "請先登入" }, 401);
  const merTradeNo = new URL(request.url).searchParams.get("order") || "";
  const order = await env.DB
    .prepare("SELECT * FROM payment_orders WHERE mer_trade_no = ? AND store_id = ?")
    .bind(merTradeNo, store.id)
    .first<OrderRow>();
  if (!order) return json({ ok: false, error: "找不到訂單" }, 404);
  return json({
    ok: true,
    order: {
      merTradeNo: order.mer_trade_no,
      plan: order.plan,
      months: order.months,
      amount: order.amount,
      status: order.status,
      paidAt: order.paid_at,
      atm:
        order.atm_account
          ? { bankCode: order.atm_bank_code, account: order.atm_account, expireAt: order.atm_expire_at }
          : null,
    },
  });
}

// GET /api/billing/orders — 本店訂單列表
export async function handleBillingOrders(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "請先登入" }, 401);
  const rows = await env.DB
    .prepare(
      "SELECT mer_trade_no, plan, months, amount, status, created_at, paid_at FROM payment_orders WHERE store_id = ? ORDER BY id DESC LIMIT 50"
    )
    .bind(store.id)
    .all<Record<string, unknown>>();
  return json({ ok: true, orders: rows?.results || [] });
}
```

- [ ] **Step 3: `src/index.ts` 掛載**

Env type（`src/index.ts:27` 的 `type Env`）加：

```ts
  // PAYUNi billing
  PAYUNI_MER_ID?: string;
  PAYUNI_HASH_KEY?: string;
  PAYUNI_HASH_IV?: string;
  PAYUNI_SANDBOX?: string;
```

import 區加：

```ts
import {
  handleBillingCheckout,
  handleBillingNotify,
  handleBillingReturn,
  handleBillingOrderStatus,
  handleBillingOrders,
} from "./routes/billing";
```

在 `/api/plan-offers` 路由（`src/index.ts:268` 附近）後面加：

```ts
    // ── PAYUNi billing（主網域） ──
    if (url.pathname === "/api/billing/checkout") {
      return handleBillingCheckout(request, env);
    }
    if (url.pathname === "/api/billing/notify") {
      return handleBillingNotify(request, env);
    }
    if (url.pathname === "/api/billing/return") {
      return handleBillingReturn(request, env);
    }
    if (url.pathname === "/api/billing/order-status") {
      return handleBillingOrderStatus(request, env);
    }
    if (url.pathname === "/api/billing/orders") {
      return handleBillingOrders(request, env);
    }
```

- [ ] **Step 4: 寫守護測試 `test/billing-routes.test.js`**（比照 `test/ai-image-storage.test.js` 的字串斷言形式）

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const billing = readFileSync(new URL("../src/routes/billing.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("billing routes are mounted on the main domain", () => {
  for (const p of [
    "/api/billing/checkout",
    "/api/billing/notify",
    "/api/billing/return",
    "/api/billing/order-status",
    "/api/billing/orders",
  ]) {
    assert.ok(index.includes(`"${p}"`), `index.ts must route ${p}`);
  }
});

test("checkout derives amount from plan offers, never from request body", () => {
  assert.ok(billing.includes("getPlanOfferByMonths(plan, months, DEFAULT_PLAN_OFFERS)"));
  assert.ok(!/body\.(amount|tradeAmt|price)/.test(billing), "amount must not come from client");
});

test("notify is idempotent and guards against amount mismatch", () => {
  assert.ok(billing.includes('if (action === "already-paid") return new Response("OK")'));
  assert.ok(billing.includes('"amount-mismatch"'));
  assert.ok(billing.includes("status != 'paid'"), "paid update must be guarded");
});

test("order-status only exposes the session store's own orders", () => {
  assert.ok(billing.includes("WHERE mer_trade_no = ? AND store_id = ?"));
});
```

- [ ] **Step 5: 跑全部測試**

Run: `node --test test/`
Expected: 全部 PASS（既有測試不受影響）

- [ ] **Step 6: 本機啟動冒煙測試**

Run: `npx wrangler dev` 後另開 shell：
```bash
curl -s -X POST http://localhost:8787/api/billing/checkout -H 'content-type: application/json' -d '{"plan":"pro","months":1}'
```
Expected: `{"ok":false,"error":"請先登入"}`（401；未設金流 secrets 時為 503「金流尚未設定」——兩者皆證明路由已通）。

- [ ] **Step 7: Commit**

```bash
git add src/routes/billing.ts src/index.ts src/routes/platform-admin.ts test/billing-routes.test.js
git commit -m "feat(billing): add PAYUNi checkout/notify/return/status endpoints on main domain"
```

---

### Task 5: 前端 — 結帳啟動 JS 與付款結果頁

**Files:**
- Create: `public/assets/billing-checkout.js`
- Create: `public/billing-result.html`

- [ ] **Step 1: 建立 `public/assets/billing-checkout.js`**

（給首頁與後台共用；首頁 redesign 計畫會掛上它）

```js
// 啟動 PAYUNi 結帳：POST checkout 取得 UPP 欄位 → 動態 form 跳轉
// 用法：startPlanCheckout("pro", 12)
function startPlanCheckout(plan, months) {
  return fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan: plan, months: months }),
  })
    .then(function (r) {
      if (r.status === 401) {
        window.location.href = "/login.html";
        return null;
      }
      return r.json();
    })
    .then(function (d) {
      if (!d) return;
      if (!d.ok) {
        alert(d.error || "建立訂單失敗，請稍後再試");
        return;
      }
      var form = document.createElement("form");
      form.method = "POST";
      form.action = d.action;
      Object.keys(d.fields).forEach(function (k) {
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = d.fields[k];
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    })
    .catch(function () {
      alert("連線失敗，請稍後再試");
    });
}
window.startPlanCheckout = startPlanCheckout;
```

- [ ] **Step 2: 建立 `public/billing-result.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>付款結果｜我拍開店平台</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Noto Sans TC", sans-serif; background: #f7f8fa; color: #1a1d21;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card { background: #fff; border: 1px solid #e6e8eb; border-radius: 16px; padding: 40px 32px;
          max-width: 480px; width: 100%; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
  .icon { font-size: 56px; line-height: 1; margin-bottom: 16px; }
  h1 { font-size: 22px; font-weight: 900; margin-bottom: 8px; }
  p { font-size: 15px; color: #5c636e; line-height: 1.8; }
  .atm-box { margin: 20px 0 4px; padding: 16px; background: #f7f8fa; border-radius: 12px; text-align: left; }
  .atm-box dt { font-size: 12px; color: #8a919c; margin-top: 10px; }
  .atm-box dt:first-child { margin-top: 0; }
  .atm-box dd { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .btn { display: inline-block; margin-top: 24px; padding: 13px 32px; border-radius: 10px;
         background: #f26b1d; color: #fff; font-weight: 700; text-decoration: none; font-size: 15px; }
  .muted { font-size: 13px; color: #8a919c; margin-top: 12px; }
</style>
</head>
<body>
<div class="card" id="card">
  <div class="icon">⏳</div>
  <h1>正在確認付款狀態…</h1>
  <p>請稍候，正在向金流系統確認你的訂單。</p>
</div>
<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var order = params.get("order") || "";
  var card = document.getElementById("card");
  var tries = 0;

  function render(html) { card.innerHTML = html; }

  function renderError() {
    render('<div class="icon">⚠️</div><h1>付款狀態確認失敗</h1>' +
      '<p>若你已完成付款，方案會在系統收到通知後自動開通。<br>有問題請聯繫客服。</p>' +
      '<a class="btn" href="/">回首頁</a>');
  }

  function renderPaid(o) {
    render('<div class="icon">🎉</div><h1>付款成功，方案已開通！</h1>' +
      '<p>' + o.plan.toUpperCase() + ' 方案 ' + o.months + ' 個月已生效，現在就開始上架商品吧。</p>' +
      '<a class="btn" href="/login.html">進入我的商店後台</a>');
  }

  function renderAtm(o) {
    var atm = o.atm || {};
    render('<div class="icon">🏦</div><h1>請完成 ATM 轉帳</h1>' +
      '<p>轉帳入帳後方案會自動開通，無需再操作。</p>' +
      '<dl class="atm-box">' +
      '<dt>銀行代碼</dt><dd>' + (atm.bankCode || "—") + '</dd>' +
      '<dt>虛擬帳號</dt><dd>' + (atm.account || "—") + '</dd>' +
      '<dt>繳費期限</dt><dd>' + (atm.expireAt || "—") + '</dd>' +
      '<dt>金額</dt><dd>NT$ ' + Number(o.amount).toLocaleString() + '</dd>' +
      '</dl>' +
      '<p class="muted">這個頁面會自動更新付款狀態。</p>' +
      '<a class="btn" href="/">回首頁</a>');
  }

  function poll() {
    if (!order) { renderError(); return; }
    fetch("/api/billing/order-status?order=" + encodeURIComponent(order))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { renderError(); return; }
        var o = d.order;
        if (o.status === "paid") { renderPaid(o); return; }
        if (o.status === "failed") {
          render('<div class="icon">❌</div><h1>付款未完成</h1>' +
            '<p>這筆訂單未成功，未扣款或將自動退刷。<br>請重新選購方案，或聯繫客服。</p>' +
            '<a class="btn" href="/#pricing">重新選購</a>');
          return;
        }
        if (o.atm) { renderAtm(o); }
        tries++;
        if (tries < 36) setTimeout(poll, 5000); // 輪詢最多 3 分鐘
      })
      .catch(renderError);
  }
  poll();
})();
</script>
</body>
</html>
```

- [ ] **Step 3: 手動驗證頁面**

Run: `npx wrangler dev`，瀏覽 `http://localhost:8787/billing-result.html?order=NOPE`
Expected: 未登入 → 顯示「付款狀態確認失敗」卡片（API 401），版面正常。

- [ ] **Step 4: Commit**

```bash
git add public/assets/billing-checkout.js public/billing-result.html
git commit -m "feat(billing): add checkout launcher script and payment result page"
```

---

### Task 6: 設定 — wrangler.toml、.dev.vars、secrets

**Files:**
- Modify: `wrangler.toml`（`[vars]` 區段與 secrets 註解）
- Modify: `.dev.vars`（如不存在則建立；已在 .gitignore）

- [ ] **Step 1: wrangler.toml `[vars]` 加**

```toml
PAYUNI_SANDBOX = "1"  # 先走 sandbox 驗流程；切正式改 "0" 並換正式金鑰
```

同檔的 secrets 註解區（`# Secrets (set via: wrangler secret put <KEY>):`）加三行：

```toml
# PAYUNI_MER_ID
# PAYUNI_HASH_KEY
# PAYUNI_HASH_IV
```

- [ ] **Step 2: `.dev.vars` 加本機測試值**（向 PAYUNi 後台「商店串接資訊」取 sandbox 金鑰）

```
PAYUNI_MER_ID=<sandbox 商店代號>
PAYUNI_HASH_KEY=<sandbox Hash Key>
PAYUNI_HASH_IV=<sandbox Hash IV>
```

- [ ] **Step 3: Commit（不含 .dev.vars）**

```bash
git add wrangler.toml
git commit -m "chore(billing): add PAYUNI_SANDBOX var and secret placeholders"
```

---

### Task 7: Sandbox 端對端驗證（手動）

**Files:** 無程式變更；驗證清單。

- [ ] **Step 1: 部署或本機 tunnel**

notify 需要 PAYUNi 伺服器打得到的公開網址。建議直接 `npm run deploy` 部署，並先設好三個 secrets：

```bash
npx wrangler secret put PAYUNI_MER_ID
npx wrangler secret put PAYUNI_HASH_KEY
npx wrangler secret put PAYUNI_HASH_IV
npx wrangler d1 migrations apply japan_buy --remote
```

- [ ] **Step 2: 信用卡流程**

登入測試店 → 呼叫 `startPlanCheckout("pro", 1)`（可在 console 手動執行）→ UPP sandbox 頁出現 → 用 PAYUNi 測試卡號完成付款 → 跳回 `/billing-result.html` 顯示「付款成功」→ 確認 D1：`payment_orders.status = 'paid'`、`stores.plan = 'pro'`、`plan_expires_at` 約 30 天後、`plan_change_logs` 有一筆。

- [ ] **Step 3: ATM 流程**

同上選 ATM → 取得虛擬帳號 → 結果頁顯示銀行代碼/帳號/期限 → sandbox 模擬入帳 → 結果頁輪詢自動轉「付款成功」。

- [ ] **Step 4: 防護驗證**

- 重送同一筆 notify（PAYUNi 後台重發或 curl 原始 payload）→ 不重複延長到期日
- 偽造 HashInfo 打 notify → 400
- `plan=free` 或 `months=5` 打 checkout → 400

- [ ] **Step 5: 切正式**

PAYUNi 後台確認只開信用卡＋ATM → `PAYUNI_SANDBOX = "0"` → 三個 secrets 換正式金鑰 → 重新部署 → 以最低額方案實付一筆驗證後退款。

---

## Self-Review 紀錄

- Spec 覆蓋：migration（Task 1）、協議（Task 2）、決策（Task 3）、五個端點＋開通＋營收 log（Task 4）、結果頁＋啟動 JS（Task 5）、設定（Task 6）、E2E 與防護（Task 7）。首頁定價 CTA 掛 `startPlanCheckout` 屬首頁改版計畫。
- ATM 欄位名（BankType/PayNo/ExpireDate）為防禦性讀取，未命中時 raw_notify 仍保留全文，結果頁顯示「—」不會壞。
- 型別一致：`computeActivation` 回傳 `{plan, expiresAt}`，handler 自行寫入 started/paid；測試與實作簽名一致。
