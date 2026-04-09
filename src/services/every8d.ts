/**
 * Every8D SMS API Service
 * API 2.1 Specification
 */

type Every8DConfig = {
  uid: string;
  pwd: string;
  siteUrl: string; // e.g., "new.e8d.tw" for enterprise users
};

type TokenCache = {
  token: string;
  expiresAt: number; // Unix timestamp in ms
};

// Token cache (valid for 8 hours, refresh 7.5 hours to be safe)
let tokenCache: TokenCache | null = null;
const TOKEN_REFRESH_BEFORE_EXPIRY_MS = 30 * 60 * 1000; // Refresh 30 min before expiry

/**
 * Get connection token from Every8D
 * Token is valid for 8 hours, recommended to refresh every 8 hours
 */
async function getConnectionToken(config: Every8DConfig): Promise<string> {
  // Return cached token if still valid
  if (tokenCache && tokenCache.expiresAt > Date.now() + TOKEN_REFRESH_BEFORE_EXPIRY_MS) {
    return tokenCache.token;
  }

  const resp = await fetch(`https://${config.siteUrl}/API21/HTTP/ConnectionHandler.ashx`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; vovosnap/1.0)",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      HandlerType: 3,
      VerifyType: 1,
      UID: config.uid,
      PWD: config.pwd,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Every8D token request failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as { Result: boolean; Msg?: string; Status?: string };
  
  if (!data.Result) {
    throw new Error(`Every8D token failed: ${data.Status} ${data.Msg}`);
  }

  // Token valid for 8 hours
  const token = data.Msg;
  if (!token) {
    throw new Error("Every8D returned empty token");
  }

  tokenCache = {
    token,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
  };

  return token;
}

/**
 * Format phone number for Every8D
 * Input: 0912345678 or +886912345678
 * Output: +886912345678
 */
export function formatPhoneNumberForEvery8D(raw: string): string {
  let num = raw.replace(/[\s\-()]/g, "");
  // Remove leading 0 if present
  if (num.startsWith("0")) {
    num = num.substring(1);
  }
  // Add +886 if not present
  if (!num.startsWith("+")) {
    num = "+886" + num;
  }
  return num;
}

function formatPhoneNumberForEvery8DLegacy(raw: string): string {
  const num = raw.replace(/[^0-9+]/g, "");
  if (num.startsWith("+886")) return `0${num.slice(4)}`;
  if (num.startsWith("886")) return `0${num.slice(3)}`;
  if (num.startsWith("9") && num.length === 9) return `0${num}`;
  return num;
}

/**
 * Send SMS via Every8D API
 * @returns batch ID for tracking
 */
export async function sendSMS(
  config: Every8DConfig,
  phone: string,
  message: string
): Promise<{ batchId: string; credit: number }> {
  const formattedPhone = formatPhoneNumberForEvery8D(phone);
  const legacyPhone = formatPhoneNumberForEvery8DLegacy(formattedPhone);

  const query = new URLSearchParams({
    UID: config.uid,
    PWD: config.pwd,
    SB: "",
    MSG: message,
    DEST: legacyPhone,
    ST: "",
  });
  const url = `https://${config.siteUrl}/API21/HTTP/sendSMS.ashx?${query.toString()}`;

  // Retry up to 2 times on 403 (CloudFront intermittent blocks)
  let resp: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; vovosnap/1.0)",
        "Accept": "text/plain, application/json",
      },
    });
    if (resp.status !== 403) break;
    if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }

  if (!resp || !resp.ok) {
    const text = resp ? await resp.text() : "No response";
    throw new Error(`Every8D SMS failed: ${resp?.status} ${text}`);
  }

  const raw = await resp.text();
  let msg = raw;

  // API may return JSON (Result/Msg) or plain text (e.g. "-27,電話號碼不得為空")
  if (raw.startsWith("{")) {
    const data = JSON.parse(raw) as {
      Result: boolean;
      Msg?: string;
      Status?: string;
    };
    if (!data.Result) {
      throw new Error(`Every8D SMS send failed: ${data.Status || ""} ${data.Msg || ""}`.trim());
    }
    msg = data.Msg || "";
  } else if (raw.startsWith("-")) {
    const parts = raw.split(",");
    throw new Error(`Every8D SMS send failed: ${parts.slice(1).join(",").trim() || raw}`);
  }

  // Msg format: "credit,count,success,fail,batchId"
  const parts = msg.split(",");
  const credit = parseFloat(parts[0]) || 0;
  const batchId = parts[4] || "";

  return { batchId, credit };
}

/**
 * Get remaining credit balance
 */
export async function getCredit(config: Every8DConfig): Promise<number> {
  const query = new URLSearchParams({
    UID: config.uid,
    PWD: config.pwd,
  });
  const resp = await fetch(`https://${config.siteUrl}/API21/HTTP/getCredit.ashx?${query.toString()}`, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; vovosnap/1.0)",
      "Accept": "text/plain, application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Every8D credit check failed: ${resp.status} ${text}`);
  }

  const text = await resp.text();
  // Response format: "1000.00" or "-99,Error message"
  if (text.startsWith("-")) {
    throw new Error(`Every8D credit error: ${text}`);
  }

  return parseFloat(text) || 0;
}

/**
 * Generate a random 6-digit verification code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create Every8D config from environment
 */
export function createEvery8DConfig(env: {
  EVERY8D_UID: string;
  EVERY8D_PWD: string;
  EVERY8D_SITE_URL: string;
}): Every8DConfig {
  return {
    uid: env.EVERY8D_UID,
    pwd: env.EVERY8D_PWD,
    siteUrl: env.EVERY8D_SITE_URL || "new.e8d.tw",
  };
}
