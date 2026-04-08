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
    headers: { "content-type": "application/json" },
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

/**
 * Send SMS via Every8D API
 * @returns batch ID for tracking
 */
export async function sendSMS(
  config: Every8DConfig,
  phone: string,
  message: string
): Promise<{ batchId: string; credit: number }> {
  const token = await getConnectionToken(config);

  const formattedPhone = formatPhoneNumberForEvery8D(phone);

  const resp = await fetch(`https://${config.siteUrl}/API21/HTTP/sendSMS.ashx`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      UID: config.uid,
      PWD: config.pwd,
      SB: "", // Subject (optional)
      MSG: message,
      DEST: formattedPhone,
      ST: "", // Send time, empty = immediate
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Every8D SMS failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as {
    Result: boolean;
    Msg?: string;
    Status?: string;
  };

  if (!data.Result) {
    throw new Error(`Every8D SMS send failed: ${data.Status} ${data.Msg}`);
  }

  // Msg format: "credit,count,batchId"
  // e.g., "999630.00,1,1,0,7eff1d50-8814-4f17-aa61-cb23b97987fa"
  const parts = (data.Msg || "").split(",");
  const credit = parseFloat(parts[0]) || 0;
  const batchId = parts[4] || "";

  return { batchId, credit };
}

/**
 * Get remaining credit balance
 */
export async function getCredit(config: Every8DConfig): Promise<number> {
  const token = await getConnectionToken(config);

  const resp = await fetch(`https://${config.siteUrl}/API21/HTTP/getCredit.ashx`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "authorization": `Bearer ${token}`,
    },
    body: new URLSearchParams({
      UID: config.uid,
      PWD: config.pwd,
    }),
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
