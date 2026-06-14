import test from "node:test";
import assert from "node:assert/strict";
import { seal, open, getLatestVersion, DecryptError } from "../src/shared/secret-box.js";

// Fake env with a single key version (inject pattern — no real Cloudflare secrets)
const fakeEnv = { STORE_PAY_ENC_KEY_V1: "super-secret-test-master-key-V1" };
const ctx = { storeId: 42, provider: "payuni", field: "hash_key" };

// ── getLatestVersion ──────────────────────────────────────────────────────────

test("getLatestVersion returns 0 when no keys configured", () => {
  assert.equal(getLatestVersion({}), 0);
});

test("getLatestVersion returns 1 for a single key", () => {
  assert.equal(getLatestVersion(fakeEnv), 1);
});

test("getLatestVersion returns highest contiguous version", () => {
  const env = {
    STORE_PAY_ENC_KEY_V1: "key1",
    STORE_PAY_ENC_KEY_V2: "key2",
    STORE_PAY_ENC_KEY_V3: "key3",
    // V4 absent — stops at 3
  };
  assert.equal(getLatestVersion(env), 3);
});

// ── seal ─────────────────────────────────────────────────────────────────────

test("seal throws when no key configured", async () => {
  await assert.rejects(
    () => seal("secret", ctx, {}),
    (err) => err instanceof Error && /STORE_PAY_ENC_KEY/i.test(err.message)
  );
});

test("seal produces sb1-prefixed blob", async () => {
  const blob = await seal("my-merchant-hashkey", ctx, fakeEnv);
  assert.match(blob, /^sb1:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  const parts = blob.split(":");
  assert.equal(parts[0], "sb1");
  assert.equal(Number(parts[1]), 1); // version 1
  assert.ok(parts[2].length > 0, "IV part must be non-empty");
  assert.ok(parts[3].length > 0, "ciphertext part must be non-empty");
});

test("seal produces different blobs each call (fresh IV)", async () => {
  const a = await seal("same-plaintext", ctx, fakeEnv);
  const b = await seal("same-plaintext", ctx, fakeEnv);
  // IVs must differ (cryptographic random IV per call)
  const ivA = a.split(":")[2];
  const ivB = b.split(":")[2];
  assert.notEqual(ivA, ivB, "Each call must use a fresh random IV");
});

// ── open ─────────────────────────────────────────────────────────────────────

test("seal + open round-trips plaintext", async () => {
  const plaintext = "my-secret-hashkey-value-12345";
  const blob = await seal(plaintext, ctx, fakeEnv);
  const result = await open(blob, ctx, fakeEnv);
  assert.equal(result, plaintext);
});

test("open rejects invalid blob format", async () => {
  await assert.rejects(() => open("notvalid", ctx, fakeEnv), DecryptError);
  await assert.rejects(() => open("sb1:1:only-three", ctx, fakeEnv), DecryptError);
  await assert.rejects(() => open("sb2:1:iv:ct", ctx, fakeEnv), DecryptError); // wrong prefix
});

test("open rejects tampered ciphertext (GCM auth tag fails)", async () => {
  const blob = await seal("secret", ctx, fakeEnv);
  const parts = blob.split(":");
  // Corrupt one base64url character in the ciphertext+tag part
  const ct = parts[3];
  const corrupted = ct.slice(0, -2) + (ct.slice(-2) === "AA" ? "BB" : "AA");
  const tamperedBlob = `${parts[0]}:${parts[1]}:${parts[2]}:${corrupted}`;
  await assert.rejects(() => open(tamperedBlob, ctx, fakeEnv), DecryptError);
});

test("open rejects wrong storeId in AAD (cross-store move attack)", async () => {
  const blob = await seal("secret", ctx, fakeEnv);
  const wrongCtx = { ...ctx, storeId: 99 }; // different store
  await assert.rejects(() => open(blob, wrongCtx, fakeEnv), DecryptError);
});

test("open rejects wrong field in AAD (cross-column move attack)", async () => {
  const blob = await seal("secret", ctx, fakeEnv);
  const wrongCtx = { ...ctx, field: "mer_id" }; // sealed for hash_key, opened as mer_id
  await assert.rejects(() => open(blob, wrongCtx, fakeEnv), DecryptError);
});

test("open rejects wrong provider in AAD", async () => {
  const blob = await seal("secret", ctx, fakeEnv);
  const wrongCtx = { ...ctx, provider: "stripe" };
  await assert.rejects(() => open(blob, wrongCtx, fakeEnv), DecryptError);
});

test("open throws DecryptError (not plain Error) for missing key version", async () => {
  const blob = await seal("secret", ctx, fakeEnv);
  // Try with an env that doesn't have V1
  await assert.rejects(
    () => open(blob, ctx, {}),
    (err) => err instanceof DecryptError
  );
});

test("open works with keyring rotation (open old blob with old key in env)", async () => {
  // V2 is now the latest; V1 blob must still decrypt using V1 key in the keyring
  const envV2 = {
    STORE_PAY_ENC_KEY_V1: "super-secret-test-master-key-V1",
    STORE_PAY_ENC_KEY_V2: "super-secret-test-master-key-V2",
  };
  // blob sealed with V1 (using fakeEnv which only has V1)
  const blobV1 = await seal("payload", ctx, fakeEnv);
  assert.match(blobV1, /^sb1:1:/);

  // After rotation (envV2), the V1 blob must still open because V1 is still in the keyring
  const result = await open(blobV1, ctx, envV2);
  assert.equal(result, "payload");

  // New seal uses V2
  const blobV2 = await seal("payload", ctx, envV2);
  assert.match(blobV2, /^sb1:2:/);
  const resultV2 = await open(blobV2, ctx, envV2);
  assert.equal(resultV2, "payload");
});
