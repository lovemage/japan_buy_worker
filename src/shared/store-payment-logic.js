// src/shared/store-payment-logic.js
// Pure business-logic functions for the store-owned PAYUNi collection feature.
// No D1 access — everything here is unit-testable by direct import.

// ── Amount parsing ─────────────────────────────────────────────────────────────

// parseCanonicalAmount(input) → integer (1..9999999) | null
//
// Accepts: a JS number or a numeric string representing a positive integer.
// Rejects: floats, negative signs, NaN, overflow, non-numeric strings.
// This SAME function is used at create / checkout / notify — never trust client.
export function parseCanonicalAmount(input) {
  if (input === null || input === undefined) return null;
  const str = String(input).trim();
  // Only pure digit strings (no sign, no decimal, no exponent notation)
  if (!/^\d+$/.test(str)) return null;
  const n = Number(str);
  // Number.isInteger guard is redundant after the regex but kept for clarity
  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > 9999999) return null;
  return n;
}

// ── Trade-number / token generation ───────────────────────────────────────────

// genMerTradeNo() → 20-char alphanumeric string (A-Z 0-9)
//
// Requirements (§15.3):
//   – opaque / non-guessable
//   – does NOT encode store_id (store ownership is re-verified after notify decrypt)
//   – ≤ 20 chars (PAYUNi limit)
//   – alphanumeric only
//
// Format: "SP" + 18 random base-36 chars (upper) = exactly 20 chars.
// Slight modulo bias (1.6 %) on the 4 lowest alphabet entries is acceptable
// for a trade-number use-case.
export function genMerTradeNo() {
  const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 36 chars
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let result = "SP";
  for (let i = 0; i < 18; i++) {
    result += ALPHABET[bytes[i] % 36];
  }
  return result; // always exactly 20 chars
}

// genPublicToken() → 32-char base64url string (192 bits of entropy)
//
// This is the only identifier buyers ever see.  High entropy prevents enumeration.
export function genPublicToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24)); // 24 bytes = 192 bits
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  // base64url: no padding, - and _ instead of + and /
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ── Notify action decision (§15.1) ────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["paid", "failed", "expired", "cancelled"]);

// decideStoreNotifyAction({
//   orderStatus,       current DB status of the order
//   orderAmount,       amount (integer) from DB
//   orderIsSandbox,    boolean: is_sandbox snapshot stored at order creation
//   orderTradeNo,      payuni_trade_no already stored on the order (or null)
//   tradeStatus,       PAYUNi TradeStatus field (string, "1" = success)
//   tradeAmt,          PAYUNi TradeAmt field (string or number)
//   notifyIsSandbox,   boolean: current is_sandbox from store config
//   notifyTradeNo,     PAYUNi TradeNo from the decrypted notify payload
// }) → 'ignore' | 'activate' | 'amount-mismatch' | 'sandbox-mismatch' | 'replay' | 'pending'
//
// Decision rules (ordered):
//   1. Terminal state → ignore (do NOT allow notify to un-terminate an order)
//   2. Anti-replay: order already has a PAYUNi TradeNo AND it differs → replay
//   3. Sandbox snapshot mismatch → sandbox-mismatch
//   4. TradeStatus === "1" (success):
//      – amount mismatch → amount-mismatch (mark failed)
//      – else → activate
//   5. Otherwise → pending (e.g. ATM take-number notify)
export function decideStoreNotifyAction({
  orderStatus,
  orderAmount,
  orderIsSandbox,
  orderTradeNo,
  tradeStatus,
  tradeAmt,
  notifyIsSandbox,
  notifyTradeNo,
}) {
  // 1. Terminal states: ignore (return 200 so PAYUNi stops resending)
  if (TERMINAL_STATUSES.has(String(orderStatus))) return "ignore";

  // 2. Anti-replay: if we already recorded a PAYUNi TradeNo and this notify
  //    carries a different one, refuse it (different transaction on the same order).
  if (orderTradeNo != null && notifyTradeNo != null && String(orderTradeNo) !== String(notifyTradeNo)) {
    return "replay";
  }

  // 3. Sandbox snapshot mismatch: the order was created in a different environment
  //    than the current config setting.  Prevents sandbox orders being activated
  //    by prod notifies (and vice versa) when keys happen to be shared.
  if (Boolean(orderIsSandbox) !== Boolean(notifyIsSandbox)) return "sandbox-mismatch";

  // 4. PAYUNi success
  if (String(tradeStatus) === "1") {
    const amt = parseCanonicalAmount(tradeAmt);
    if (amt === null || amt !== orderAmount) return "amount-mismatch";
    return "activate";
  }

  // 5. Everything else (ATM pending, etc.)
  return "pending";
}

// ── Expiry policy (§9.1) ──────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;
const DEFAULT_HOURS = 7 * 24;  // 7 days
const MAX_HOURS = 14 * 24;     // 14 days absolute cap

// computeExpiresAt(hoursRequested, now?) → ISO timestamp string
//
// – If hoursRequested is absent / non-positive / non-finite → default 7 days
// – Clamped to MAX 14 days (no "forever" links per §9.1)
export function computeExpiresAt(hoursRequested, now = Date.now()) {
  const requested = Number(hoursRequested);
  const hours =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_HOURS)
      : DEFAULT_HOURS;
  return new Date(now + hours * HOUR_MS).toISOString();
}

// ── Plan gating (§9.0) ────────────────────────────────────────────────────────

// canUseStoreCollection(effectivePlan) → boolean
//
// Only 'pro' and 'proplus' can use buyer collection.
// plus / free are NOT allowed.  Do NOT reuse PAYABLE_PLANS.
// Caller must pass getEffectivePlan(store) (not store.plan) to get correct
// expiry-aware value.
export function canUseStoreCollection(effectivePlan) {
  return effectivePlan === "pro" || effectivePlan === "proplus";
}

// ── Effective-enabled computation (§15.6) ─────────────────────────────────────

// computeEffectiveEnabled({ isEnabled, planOk, configValid }) → boolean
//
// All three flags must be true.  UI should distinguish each component:
//   isEnabled  = store owner's intent (the is_enabled column)
//   planOk     = canUseStoreCollection(getEffectivePlan(store))
//   configValid= all three credential columns are non-null
export function computeEffectiveEnabled({ isEnabled, planOk, configValid }) {
  return Boolean(isEnabled) && Boolean(planOk) && Boolean(configValid);
}
