---
description: Every8D SMS 串接與除錯流程
---

# Every8D SMS Migration Workflow

適用情境：
- 將 Firebase Phone Auth 改為 Every8D
- `/auth/send-phone-code` 回傳 500
- 簡訊可發送但驗證流程失敗

## 1) 必備環境變數

在 `wrangler.toml` 的 `[vars]` 確認：
- `EVERY8D_SITE_URL = "new.e8d.tw"`

在 Cloudflare Worker secrets 設定：
- `EVERY8D_UID`
- `EVERY8D_PWD`

指令：
```bash
wrangler secret put EVERY8D_UID
wrangler secret put EVERY8D_PWD
```

## 2) DB Migration（重點）

務必套用到遠端 D1（不是 local）：
```bash
wrangler d1 migrations apply japan_buy --remote
```

確認 `0011_phone_verification_codes.sql` 已成功。

## 3) API 路由與請求格式

後端需具備：
- `POST /auth/send-phone-code`
- `POST /auth/verify-phone`

Every8D API 2.1 請求建議：
- `GET /API21/HTTP/sendSMS.ashx`
- `GET /API21/HTTP/getCredit.ashx`
- 參數使用 query string（`UID`, `PWD`, `MSG`, `DEST`, `ST`）
- `DEST` 使用台灣本地格式（`09xxxxxxxx`）

## 4) 常見錯誤對照

- `D1_ERROR: no such table: phone_verification_codes`
  - 原因：遠端 migration 未套用
  - 解法：執行 `wrangler d1 migrations apply japan_buy --remote`

- `Every8D SMS failed: 404 ... /API21/HTTP/SMSHandler.ashx`
  - 原因：endpoint 路徑錯誤
  - 解法：改為 `/API21/HTTP/sendSMS.ashx`

- `Every8D SMS send failed: -27 電話號碼不得為空`
  - 原因：請求格式或電話格式不符
  - 解法：改 query GET，`DEST` 改為 `09xxxxxxxx`

## 5) 佈署

```bash
wrangler deploy
```

## 6) 線上驗證（必做）

先開 tail：
```bash
wrangler tail --format pretty
```

再從前端操作「發送驗證碼」，確認日誌出現：
- `Every8D SMS result: { batchId: '...', credit: ... }`

接著輸入驗證碼，確認：
- `POST /auth/verify-phone` 成功

## 7) 交付檢查清單

- [ ] `EVERY8D_UID` / `EVERY8D_PWD` 已設
- [ ] 遠端 migration 已套用
- [ ] send endpoint 使用 `sendSMS.ashx`
- [ ] `DEST` 使用 `09xxxxxxxx`
- [ ] 部署成功並有版本 ID
- [ ] tail 日誌確認 send/verify 皆成功
