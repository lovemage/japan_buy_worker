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

function toMs(t) {
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  return new Date(t).getTime();
}

function clampNum(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

// 方案排名：升級/降級判斷用
export const PLAN_RANK = { free: 0, plus: 1, pro: 2, proplus: 3 };

export function isUpgrade(from, to) {
  return (PLAN_RANK[to] ?? -1) > (PLAN_RANK[from] ?? -1);
}

export function isDowngrade(from, to) {
  return (PLAN_RANK[to] ?? -1) < (PLAN_RANK[from] ?? -1);
}

// 折抵價值：分母用累加 paidDays，贈送天數排尾段不折現，全程 ms + Math.floor（計畫 §1.1）
// 任一輸入非有限數或 paidDays<=0 → fallback 0 並回 valid:false（導客服）
export function computeUpgradeCredit({ paidAmount, paidDays, bonusDays, expiresAt, now }) {
  const nowMs = toMs(now);
  const expiresMs = toMs(expiresAt);
  const amount = Number(paidAmount);
  const pDays = Number(paidDays);
  const bDays = Number(bonusDays);
  // 防呆（Codex Medium/Low）：非有限數、超出安全整數、負金額/負天數、paidDays<=0 一律導客服
  if (
    ![nowMs, expiresMs, amount, pDays, bDays].every(Number.isFinite) ||
    !Number.isSafeInteger(amount) ||
    !Number.isSafeInteger(pDays) ||
    !Number.isSafeInteger(bDays) ||
    amount < 0 ||
    bDays < 0 ||
    pDays <= 0
  ) {
    return { creditableValue: 0, valid: false };
  }
  const remainingMs = Math.max(0, expiresMs - nowMs);
  const denom = pDays * DAY_MS;
  const remainingPaidMs = clampNum(remainingMs - bDays * DAY_MS, 0, denom);
  const creditableValue = Math.floor((amount * remainingPaidMs) / denom);
  return { creditableValue, valid: true };
}

// 升級試算：折抵 + 差額 + surplus 換算 extraPaidDays + 新到期日（計畫 §1.1）
export function computeUpgradeQuote({ current, newOffer, now }) {
  const cur = current || {};
  const nowMs = toMs(now);
  const credit = computeUpgradeCredit({
    paidAmount: cur.paidAmount,
    paidDays: cur.paidDays,
    bonusDays: cur.bonusDays,
    expiresAt: cur.expiresAt,
    now: nowMs,
  });
  const listAmount = Number(newOffer?.amount);
  const offerDays = Number(newOffer?.days);
  const offerBonus = Number(newOffer?.bonusDays) || 0;
  // offer 驗證（Codex Medium #5）：金額非負、付費天數為正、贈送天數 0..offerDays
  if (
    !Number.isFinite(listAmount) ||
    !Number.isFinite(offerDays) ||
    !Number.isFinite(nowMs) ||
    listAmount < 0 ||
    offerDays <= 0 ||
    offerBonus < 0 ||
    offerBonus > offerDays
  ) {
    return {
      valid: false,
      creditableValue: 0,
      listAmount: 0,
      difference: 0,
      surplusValue: 0,
      extraPaidDays: 0,
      newExpiresAt: null,
    };
  }
  const creditableValue = credit.valid ? credit.creditableValue : 0;
  const difference = Math.max(0, listAmount - creditableValue);
  const surplusValue = Math.max(0, creditableValue - listAmount);
  const offerPaidDays = offerDays - offerBonus;
  const dailyRate = offerPaidDays > 0 ? listAmount / offerPaidDays : 0;
  const extraPaidDays = dailyRate > 0 ? Math.floor(surplusValue / dailyRate) : 0;
  const newExpiresAt = new Date(nowMs + (offerDays + extraPaidDays) * DAY_MS).toISOString();
  return {
    valid: credit.valid,
    creditableValue,
    listAmount,
    difference,
    surplusValue,
    extraPaidDays,
    newExpiresAt,
  };
}

// computeActivation（向後相容雙模式）
// 1) 舊模式（既有 billing.ts applyActivation 呼叫）：傳 { currentPlan, currentExpiresAt, orderPlan, days, now }
//    → 回 { plan, expiresAt }（行為與舊版完全一致）
// 2) 新模式（credit-basis 累加，計畫 §1.3）：傳 { currentPlan, current, orderPlan, offer, isUpgrade, now }
//    → 回 { plan, resetEntitlement, startedAt, expiresAt, paidAmount, paidDays, bonusDays, ... }
//    resetEntitlement=true（升級）：paidAmount 為「絕對值」(=creditableValue+difference)，由 route 直接 SET
//    resetEntitlement=false（續約/新購）：paidAmount/paidDays/bonusDays 為「增量」，由 route 累加 (+=)
//    startedAt=null 代表續約疊加、route 應保留既有 plan_started_at 不變
export function computeActivation(params) {
  const { currentPlan, orderPlan, now } = params;
  const nowMs = toMs(now);

  // --- 舊模式 ---
  if (params.offer === undefined && params.current === undefined) {
    const days = Number(params.days) || 0;
    let baseMs = nowMs;
    if (currentPlan === orderPlan && params.currentExpiresAt) {
      const c = new Date(params.currentExpiresAt).getTime();
      if (Number.isFinite(c) && c > nowMs) baseMs = c;
    }
    return {
      plan: orderPlan,
      expiresAt: new Date(baseMs + days * DAY_MS).toISOString(),
    };
  }

  // --- 新模式 ---
  const offer = params.offer || {};
  const cur = params.current || {};
  const offerDays = Number(offer.days) || 0;
  const offerBonus = Number(offer.bonusDays) || 0;
  const offerPaidDays = offerDays - offerBonus;

  if (params.isUpgrade) {
    const quote = computeUpgradeQuote({ current: cur, newOffer: offer, now: nowMs });
    return {
      plan: orderPlan,
      resetEntitlement: true,
      startedAt: new Date(nowMs).toISOString(),
      expiresAt: quote.newExpiresAt,
      paidAmount: quote.creditableValue + quote.difference,
      // paidDays 須含 surplus 換得的 extraPaidDays，否則下次升級分母過小、折抵被高估（Codex High #1）
      paidDays: offerPaidDays + quote.extraPaidDays,
      bonusDays: offerBonus,
      creditApplied: quote.creditableValue,
      extraPaidDays: quote.extraPaidDays,
    };
  }

  // 續約 / 新購：回傳增量
  let baseMs = nowMs;
  let stacking = false;
  if (currentPlan === orderPlan && cur.expiresAt) {
    const e = new Date(cur.expiresAt).getTime();
    if (Number.isFinite(e) && e > nowMs) {
      baseMs = e;
      stacking = true;
    }
  }
  return {
    plan: orderPlan,
    resetEntitlement: false,
    startedAt: stacking ? null : new Date(nowMs).toISOString(),
    expiresAt: new Date(baseMs + offerDays * DAY_MS).toISOString(),
    paidAmount: Number(offer.amount) || 0,
    paidDays: offerPaidDays,
    bonusDays: offerBonus,
  };
}
