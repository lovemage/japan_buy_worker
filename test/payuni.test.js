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
