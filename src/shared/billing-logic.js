// 訂閱付款決策層：訂單編號、notify 動作判斷、方案開通計算
// 純函式、不碰 D1 — 供 src/routes/billing.ts 使用

export const PAYABLE_PLANS = ["plus", "pro", "proplus"];

export const PLAN_LABELS = { plus: "Plus", pro: "Pro", proplus: "Pro+" };

// PAYUNi MerTradeNo 上限 20 字元、英數字。
// VS + storeId + base36 時戳 + 3 碼亂數；storeId 到 6 位數仍 <= 20。
export function makeMerTradeNo(storeId, nowMs = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 5);
  return `VS${storeId}${nowMs.toString(36)}${rand}`;
}

export function decideNotifyAction({ orderStatus, orderAmount, tradeStatus, tradeAmt }) {
  if (orderStatus === "paid") return "already-paid";
  if (String(tradeStatus) === "1") {
    if (Number(tradeAmt) !== Number(orderAmount)) return "amount-mismatch";
    return "activate";
  }
  return "pending";
}

const DAY_MS = 86400000;

export function computeActivation({ currentPlan, currentExpiresAt, orderPlan, days, now }) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  let baseMs = nowMs;
  if (currentPlan === orderPlan && currentExpiresAt) {
    const cur = new Date(currentExpiresAt).getTime();
    if (Number.isFinite(cur) && cur > nowMs) baseMs = cur;
  }
  return {
    plan: orderPlan,
    expiresAt: new Date(baseMs + days * DAY_MS).toISOString(),
  };
}
