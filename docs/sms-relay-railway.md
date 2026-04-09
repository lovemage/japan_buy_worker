# vovosnap SMS Relay（Railway）完整需求與程式碼

## 1. 背景與目標

目前 `Cloudflare Worker -> Every8D` 在正式環境會遇到 `403 Request blocked`，但本機可正常發送。

為了先恢復上線可用性，暫時改成：

`Cloudflare Worker -> Railway Relay API -> Every8D`

這樣可先繞過 Worker 直接連 Every8D 被擋的問題；待 Every8D 放行後，再切回直連模式。

---

## 2. Relay 需求規格

### 2.1 API 介面

- Method: `POST`
- Path: `/send`
- Request Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <RELAY_TOKEN>`（建議必填）
- Request Body:

```json
{
  "phone": "+886979661678",
  "message": "驗證碼 123456"
}
```

- Success Response:

```json
{
  "ok": true,
  "credit": 23,
  "batchId": "xxxx-xxxx-xxxx",
  "raw": "23.00,1,1,0,xxxx-xxxx-xxxx"
}
```

- Error Response:

```json
{
  "ok": false,
  "error": "錯誤訊息"
}
```

### 2.2 安全要求

- Relay API 必須驗證 `RELAY_TOKEN`。
- Every8D 帳密只放在 Railway 環境變數，不寫死程式。

### 2.3 Every8D 行為

- 使用 `new.e8d.tw`。
- 呼叫 `GET /API21/HTTP/sendSMS.ashx`。
- 送出參數：`UID, PWD, SB, MSG, DEST, ST`。
- 若回傳字串以 `-` 開頭，視為失敗。

---

## 3. Railway Relay 程式碼

建立一個新 repo（例如 `sms-relay`），放以下兩個檔案。

### 3.1 `package.json`

```json
{
  "name": "sms-relay",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
```

### 3.2 `server.js`

```js
import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const RELAY_TOKEN = process.env.RELAY_TOKEN || "";
const EVERY8D_UID = process.env.EVERY8D_UID || "";
const EVERY8D_PWD = process.env.EVERY8D_PWD || "";
const EVERY8D_SITE_URL = process.env.EVERY8D_SITE_URL || "new.e8d.tw";

function toLegacyPhone(raw = "") {
  const n = raw.replace(/[^0-9+]/g, "");
  if (n.startsWith("+886")) return `0${n.slice(4)}`;
  if (n.startsWith("886")) return `0${n.slice(3)}`;
  if (n.startsWith("9") && n.length === 9) return `0${n}`;
  return n;
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/send", async (req, res) => {
  try {
    if (RELAY_TOKEN) {
      const auth = req.header("authorization") || "";
      if (auth !== `Bearer ${RELAY_TOKEN}`) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }
    }

    const { phone, message } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({ ok: false, error: "phone/message required" });
    }

    if (!EVERY8D_UID || !EVERY8D_PWD) {
      return res.status(500).json({ ok: false, error: "EVERY8D credentials missing" });
    }

    const query = new URLSearchParams({
      UID: EVERY8D_UID,
      PWD: EVERY8D_PWD,
      SB: "",
      MSG: String(message),
      DEST: toLegacyPhone(String(phone)),
      ST: ""
    });

    const url = `https://${EVERY8D_SITE_URL}/API21/HTTP/sendSMS.ashx?${query.toString()}`;
    const resp = await fetch(url, { method: "GET" });
    const raw = await resp.text();

    if (!resp.ok) {
      return res.status(502).json({ ok: false, error: `Every8D HTTP ${resp.status}`, raw });
    }

    if (raw.startsWith("-")) {
      return res.status(502).json({ ok: false, error: "Every8D error", raw });
    }

    const parts = raw.split(",");
    return res.json({
      ok: true,
      credit: Number(parts[0] || 0),
      batchId: parts[4] || "",
      raw
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

app.listen(PORT, () => {
  console.log(`sms-relay running on :${PORT}`);
});
```

---

## 4. Railway 部署步驟

1. Push 上面 repo 到 GitHub。
2. 在 Railway 建立新專案，選擇 `Deploy from GitHub`。
3. 設定 Railway Variables：
   - `EVERY8D_UID`
   - `EVERY8D_PWD`
   - `EVERY8D_SITE_URL=new.e8d.tw`
   - `RELAY_TOKEN=<你的隨機長字串>`
4. 部署完成後，取得公開 URL，例如：
   - `https://xxx.up.railway.app`

---

## 5. vovosnap Worker 端設定

本專案已支援 relay 模式（設定 `SMS_RELAY_URL` 即啟用）。

### 5.1 Wrangler vars/secrets

- `SMS_RELAY_URL`（建議放 vars）
- `SMS_RELAY_TOKEN`（建議放 secret）

範例：

```toml
# wrangler.toml [vars]
SMS_RELAY_URL = "https://xxx.up.railway.app/send"
```

```bash
wrangler secret put SMS_RELAY_TOKEN
```

### 5.2 部署

```bash
wrangler deploy
```

---

## 6. 驗證步驟

### 6.1 先測 relay 本身

```bash
curl -X POST "https://xxx.up.railway.app/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <RELAY_TOKEN>" \
  -d '{"phone":"+886979661678","message":"relay test"}'
```

### 6.2 再測 vovosnap 前台發送驗證碼

- 從你的後台/註冊流程觸發 `/auth/send-phone-code`。
- 應不再出現 `Every8D 403 Request blocked`（因為流量改走 Railway）。

---

## 7. 回切方案（Every8D 放行後）

Every8D 放行 Cloudflare 後，只要移除 `SMS_RELAY_URL`（或設空）即可回到直連模式，不需改程式。

