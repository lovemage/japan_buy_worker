/**
 * Every8D SMS API Service
 * API 2.1 Specification — all endpoints use POST + application/x-www-form-urlencoded
 * Auth: M2 mode (UID/PWD in body)
 */

type Every8DConfig = {
  uid: string;
  pwd: string;
  siteUrl: string; // e.g., "new.e8d.tw"
};

/**
 * Format phone number for Every8D
 * Input: 0912345678 or +886912345678 or 912345678
 * Output: +886912345678 (international format as per API spec)
 */
export function formatPhoneNumberForEvery8D(raw: string): string {
  let num = raw.replace(/[\s\-()]/g, "");
  if (num.startsWith("0")) num = num.substring(1);
  if (!num.startsWith("+")) num = "+886" + num;
  return num;
}

/**
 * Send SMS via Every8D API 2.1 (Section 2.2)
 * POST https://[SiteUrl]/API21/HTTP/SendSMS.ashx
 * Content-Type: application/x-www-form-urlencoded
 */
export async function sendSMS(
  config: Every8DConfig,
  phone: string,
  message: string
): Promise<{ batchId: string; credit: number }> {
  const dest = formatPhoneNumberForEvery8D(phone);

  const body = new URLSearchParams({
    UID: config.uid,
    PWD: config.pwd,
    SB: "",
    MSG: message,
    DEST: dest,
    ST: "",
  });

  const resp = await fetch(`https://${config.siteUrl}/API21/HTTP/SendSMS.ashx`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Every8D SMS failed: ${resp.status} ${text.slice(0, 200)}`);
  }

  const raw = await resp.text();

  // Error: JSON response with Result=false
  if (raw.startsWith("{")) {
    const data = JSON.parse(raw) as { Result: boolean; Status?: string; Msg?: string };
    if (!data.Result) {
      throw new Error(`Every8D SMS error: ${data.Status || ""} ${data.Msg || ""}`.trim());
    }
  }

  // Error: negative code (e.g. "-27,電話號碼不得為空")
  if (raw.startsWith("-")) {
    throw new Error(`Every8D SMS error: ${raw}`);
  }

  // Success: "CREDIT,SENDED,COST,UNSEND,BATCHID"
  const parts = raw.split(",");
  const credit = parseFloat(parts[0]) || 0;
  const batchId = parts[4] || "";

  return { batchId, credit };
}

/**
 * Get remaining credit balance (Section 4.1)
 * POST https://[SiteUrl]/API21/HTTP/GetCredit.ashx
 * Content-Type: application/x-www-form-urlencoded
 */
export async function getCredit(config: Every8DConfig): Promise<number> {
  const body = new URLSearchParams({
    UID: config.uid,
    PWD: config.pwd,
  });

  const resp = await fetch(`https://${config.siteUrl}/API21/HTTP/GetCredit.ashx`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Every8D credit check failed: ${resp.status} ${text.slice(0, 200)}`);
  }

  const text = await resp.text();
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
