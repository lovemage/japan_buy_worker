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
