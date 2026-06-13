// src/shared/secret-box.js
// At-rest AES-GCM encryption for per-store merchant credentials.
//
// Keyring: environment secrets STORE_PAY_ENC_KEY_V1, _V2, …  (Cloudflare Secrets)
// Seal always uses the latest configured version; open uses the version embedded in
// the blob so old blobs survive key rotation.
//
// NEVER log key material or plaintext — callers must honour this contract too.
// Pure-ish module: depends only on the global `crypto` (WebCrypto) and the `env`
// object passed in, so it can be unit-tested by injecting a fake env.

const te = new TextEncoder();
const td = new TextDecoder();

// ── Typed error for decrypt failures ─────────────────────────────────────────

export class DecryptError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "DecryptError";
  }
}

// ── Base64url helpers (no external dep) ──────────────────────────────────────

function b64url(bytes) {
  // bytes -> standard base64 -> strip padding -> replace +/ with -_
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s) {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + "=".repeat(padLen));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Key derivation ────────────────────────────────────────────────────────────

// Derive a non-extractable 256-bit AES-GCM key from a raw secret string via SHA-256.
// Deterministic for a given secret (same key every call).
async function deriveKey(secretStr) {
  const raw = await crypto.subtle.digest("SHA-256", te.encode(secretStr));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// ── Keyring helpers ───────────────────────────────────────────────────────────

// Return the highest configured version number (e.g. if V1 and V2 are set but not V3,
// returns 2).  Returns 0 if not even V1 is present.
export function getLatestVersion(env) {
  if (!env["STORE_PAY_ENC_KEY_V1"]) return 0;
  let v = 1;
  while (env[`STORE_PAY_ENC_KEY_V${v + 1}`]) v++;
  return v;
}

// ── Public API ────────────────────────────────────────────────────────────────

// seal(plaintext, { storeId, provider, field }, env) → compact blob string
//
// Format: sb1:<version>:<b64url(iv)>:<b64url(ciphertext‖tag)>
//   – "sb1" prefix distinguishes this from payuni.js's hex format
//   – version lets open() pick the right keyring entry
//   – 12-byte random IV is generated fresh every call
//   – AAD binds the ciphertext to a specific store/provider/field/version
//
// Throws a plain Error (not DecryptError) if no key is configured, so callers
// can distinguish "misconfigured env" from "corrupt data".
export async function seal(plaintext, { storeId, provider, field }, env) {
  const version = getLatestVersion(env);
  if (version === 0) {
    throw new Error(
      "STORE_PAY_ENC_KEY_V1 is not configured; cannot encrypt merchant credentials. " +
      "Set this Cloudflare Secret before storing any credentials."
    );
  }

  const secretStr = env[`STORE_PAY_ENC_KEY_V${version}`];
  const aad = te.encode(`${storeId}|${provider}|${field}|v${version}`);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await deriveKey(secretStr);

  // WebCrypto AES-GCM output is ciphertext ‖ 16-byte tag (concatenated).
  const ctWithTag = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128, additionalData: aad },
      cryptoKey,
      te.encode(plaintext)
    )
  );

  return `sb1:${version}:${b64url(iv)}:${b64url(ctWithTag)}`;
}

// open(blob, { storeId, provider, field }, env) → plaintext
//
// Parses the version from the blob, picks the matching STORE_PAY_ENC_KEY_V<n>,
// reconstructs the same AAD, and decrypts.
//
// Throws DecryptError on: bad format, missing key version, GCM auth failure,
// wrong AAD (moved across store/field/version).  NEVER reveals why decryption
// failed to untrusted callers — log the DecryptError.message internally only.
export async function open(blob, { storeId, provider, field }, env) {
  let version, ivB64, ctB64;
  try {
    const parts = String(blob).split(":");
    if (parts.length !== 4 || parts[0] !== "sb1") throw new Error("bad prefix or part count");
    // Strict canonical version: digits only, no leading zero, no trailing junk
    // (rejects e.g. "1abc" which parseInt would silently accept as 1).
    if (!/^[1-9]\d*$/.test(parts[1])) throw new Error("invalid version");
    version = Number(parts[1]);
    ivB64 = parts[2];
    ctB64 = parts[3];
    // base64url charset only (no padding chars, no +/)
    if (!/^[A-Za-z0-9_-]+$/.test(ivB64) || !/^[A-Za-z0-9_-]+$/.test(ctB64)) {
      throw new Error("invalid base64url");
    }
  } catch {
    throw new DecryptError("Invalid secret-box blob format");
  }

  const secretStr = env[`STORE_PAY_ENC_KEY_V${version}`];
  if (!secretStr) {
    throw new DecryptError(
      `Key version V${version} is not present in env; cannot decrypt credential`
    );
  }

  const aad = te.encode(`${storeId}|${provider}|${field}|v${version}`);

  let iv, ctWithTag;
  try {
    iv = unb64url(ivB64);
    ctWithTag = unb64url(ctB64);
  } catch {
    throw new DecryptError("Blob base64url decode failed");
  }
  // Structural sanity: 12-byte GCM IV, and ciphertext must carry at least the
  // 16-byte tag (+ >=1 byte of actual ciphertext). Reject before hitting subtle.
  if (iv.length !== 12 || ctWithTag.length < 17) {
    throw new DecryptError("Invalid secret-box blob dimensions");
  }

  let plain;
  try {
    const cryptoKey = await deriveKey(secretStr);
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128, additionalData: aad },
      cryptoKey,
      ctWithTag
    );
  } catch {
    // GCM tag verification failure OR wrong AAD.  Do NOT surface details.
    throw new DecryptError(
      "AES-GCM decryption failed — ciphertext may be tampered, moved, or the key rotated without re-encrypting"
    );
  }

  return td.decode(plain);
}
