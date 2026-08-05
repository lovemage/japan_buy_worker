import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_RANK,
  isUpgrade,
  isDowngrade,
  computeUpgradeCredit,
  computeUpgradeQuote,
  computeActivation,
} from "./billing-logic.js";

const DAY = 86400000;
const T0 = Date.UTC(2026, 0, 1); // 固定基準時間
const iso = (ms) => new Date(ms).toISOString();

test("PLAN_RANK / isUpgrade / isDowngrade", () => {
  assert.equal(PLAN_RANK.free, 0);
  assert.equal(PLAN_RANK.proplus, 3);
  assert.equal(isUpgrade("pro", "proplus"), true);
  assert.equal(isUpgrade("proplus", "pro"), false);
  assert.equal(isDowngrade("proplus", "pro"), true);
  assert.equal(isDowngrade("pro", "proplus"), false);
});

// §1.1 驗算表：Pro+ 年繳 basis=15360, paidDays=360, bonusDays=60
test("§1.1 第1天升級 → 折抵 15317（近全額）", () => {
  const now = T0 + 1 * DAY;
  const expires = T0 + 420 * DAY; // 升級前一天購買，剩 419 天
  const r = computeUpgradeCredit({
    paidAmount: 15360, paidDays: 360, bonusDays: 60, expiresAt: iso(expires), now,
  });
  assert.equal(r.valid, true);
  assert.equal(r.creditableValue, 15317);
});

test("§1.1 用一半（剩210天）→ 折抵 6400", () => {
  const now = T0;
  const expires = T0 + 210 * DAY;
  const r = computeUpgradeCredit({
    paidAmount: 15360, paidDays: 360, bonusDays: 60, expiresAt: iso(expires), now,
  });
  assert.equal(r.creditableValue, 6400);
});

test("§1.1 只剩贈送尾段（剩40天）→ 折抵 0", () => {
  const now = T0;
  const expires = T0 + 40 * DAY;
  const r = computeUpgradeCredit({
    paidAmount: 15360, paidDays: 360, bonusDays: 60, expiresAt: iso(expires), now,
  });
  assert.equal(r.creditableValue, 0);
});

test("過期 → 折抵 0", () => {
  const now = T0;
  const expires = T0 - 5 * DAY;
  const r = computeUpgradeCredit({
    paidAmount: 15360, paidDays: 360, bonusDays: 60, expiresAt: iso(expires), now,
  });
  assert.equal(r.creditableValue, 0);
});

test("續約疊加：累加 basis/paidDays，不被單筆封頂", () => {
  // 兩筆 Pro 年繳累加：basis 16320, paidDays 720, bonusDays 60，幾乎全剩
  const now = T0;
  const expires = T0 + 780 * DAY; // 720 paid + 60 bonus
  const r = computeUpgradeCredit({
    paidAmount: 16320, paidDays: 720, bonusDays: 60, expiresAt: iso(expires), now,
  });
  assert.equal(r.creditableValue, 16320); // 未被單筆 offer 8160 封頂
});

test("NaN fallback：paidDays=0 → valid:false, credit:0", () => {
  const r = computeUpgradeCredit({
    paidAmount: 8160, paidDays: 0, bonusDays: 0, expiresAt: iso(T0 + 100 * DAY), now: T0,
  });
  assert.equal(r.valid, false);
  assert.equal(r.creditableValue, 0);
});

test("computeUpgradeQuote：差額計算（pro→proplus 年繳）", () => {
  // current Pro 年繳全剩：basis 8160, paidDays 360, bonus 30, 剩 390 天 → credit 8160
  const now = T0;
  const quote = computeUpgradeQuote({
    current: { plan: "pro", paidAmount: 8160, paidDays: 360, bonusDays: 30, expiresAt: iso(T0 + 390 * DAY) },
    newOffer: { amount: 15360, days: 420, bonusDays: 60 },
    now,
  });
  assert.equal(quote.valid, true);
  assert.equal(quote.creditableValue, 8160);
  assert.equal(quote.listAmount, 15360);
  assert.equal(quote.difference, 7200);
  assert.equal(quote.surplusValue, 0);
  assert.equal(quote.extraPaidDays, 0);
  assert.equal(quote.newExpiresAt, iso(T0 + 420 * DAY));
});

test("computeUpgradeQuote：surplus → extraPaidDays（折抵超過新方案原價）", () => {
  // current Pro 年繳全剩 credit 8160；升級到 proplus 月繳 (1280/30天)
  const now = T0;
  const quote = computeUpgradeQuote({
    current: { plan: "pro", paidAmount: 8160, paidDays: 360, bonusDays: 30, expiresAt: iso(T0 + 390 * DAY) },
    newOffer: { amount: 1280, days: 30, bonusDays: 0 },
    now,
  });
  assert.equal(quote.difference, 0);
  assert.equal(quote.surplusValue, 6880);
  assert.equal(quote.extraPaidDays, 161); // floor(6880 / (1280/30))
  assert.equal(quote.newExpiresAt, iso(T0 + (30 + 161) * DAY));
});

test("computeUpgradeQuote：NaN current → valid:false 且 difference=listAmount", () => {
  const quote = computeUpgradeQuote({
    current: { plan: "pro", paidAmount: NaN, paidDays: 360, bonusDays: 30, expiresAt: iso(T0 + 390 * DAY) },
    newOffer: { amount: 15360, days: 420, bonusDays: 60 },
    now: T0,
  });
  assert.equal(quote.valid, false);
  assert.equal(quote.creditableValue, 0);
  assert.equal(quote.difference, 15360);
});

test("computeActivation 舊模式：續約往後疊（向後相容）", () => {
  const now = new Date(T0);
  const a = computeActivation({
    currentPlan: "pro", currentExpiresAt: iso(T0 + 100 * DAY), orderPlan: "pro", days: 390, now,
  });
  assert.equal(a.plan, "pro");
  assert.equal(a.expiresAt, iso(T0 + 490 * DAY));
  assert.equal(a.resetEntitlement, undefined); // 舊模式不回此鍵
});

// 後台方案彈窗依這兩個行為決定要顯示「剩餘天數不會浪費」還是「剩餘天數不保留」。
// 線上自助付款走的就是舊模式（billing.ts 的 applyActivation），改動請同步 admin.html
// 的 updatePlanModalHint()。
test("computeActivation 舊模式：換方案從付款日重算，剩餘天數不保留", () => {
  const now = new Date(T0);
  const a = computeActivation({
    currentPlan: "pro", currentExpiresAt: iso(T0 + 100 * DAY), orderPlan: "proplus", days: 30, now,
  });
  assert.equal(a.plan, "proplus");
  assert.equal(a.expiresAt, iso(T0 + 30 * DAY), "原方案剩餘 100 天不併入");
});

test("computeActivation 舊模式：已到期續約從付款日起算", () => {
  const now = new Date(T0);
  const a = computeActivation({
    currentPlan: "pro", currentExpiresAt: iso(T0 - 10 * DAY), orderPlan: "pro", days: 30, now,
  });
  assert.equal(a.expiresAt, iso(T0 + 30 * DAY));
});

test("computeActivation 新模式-續約：回傳增量、startedAt=null（疊加）", () => {
  const a = computeActivation({
    currentPlan: "pro",
    current: { expiresAt: iso(T0 + 100 * DAY) },
    orderPlan: "pro",
    offer: { amount: 8160, days: 390, bonusDays: 30 },
    isUpgrade: false,
    now: T0,
  });
  assert.equal(a.resetEntitlement, false);
  assert.equal(a.startedAt, null);
  assert.equal(a.expiresAt, iso(T0 + 490 * DAY));
  assert.equal(a.paidAmount, 8160);
  assert.equal(a.paidDays, 360);
  assert.equal(a.bonusDays, 30);
});

test("computeActivation 新模式-升級：reset、basis=credit+差額、含 extraPaidDays", () => {
  const a = computeActivation({
    currentPlan: "pro",
    current: { plan: "pro", paidAmount: 8160, paidDays: 360, bonusDays: 30, expiresAt: iso(T0 + 390 * DAY) },
    orderPlan: "proplus",
    offer: { amount: 15360, days: 420, bonusDays: 60 },
    isUpgrade: true,
    now: T0,
  });
  assert.equal(a.resetEntitlement, true);
  assert.equal(a.startedAt, iso(T0));
  assert.equal(a.plan, "proplus");
  assert.equal(a.paidAmount, 15360); // 8160 credit + 7200 差額
  assert.equal(a.paidDays, 360);
  assert.equal(a.bonusDays, 60);
  assert.equal(a.extraPaidDays, 0);
  assert.equal(a.expiresAt, iso(T0 + 420 * DAY));
});

test("computeActivation 升級含 surplus：paidDays 須含 extraPaidDays（Codex High #1）", () => {
  // Pro 年繳全剩 credit 8160 → 升 Pro+ 月繳(1280/30天)：difference 0、surplus 6880、extraPaidDays 161
  const a = computeActivation({
    currentPlan: "pro",
    current: { plan: "pro", paidAmount: 8160, paidDays: 360, bonusDays: 30, expiresAt: iso(T0 + 390 * DAY) },
    orderPlan: "proplus",
    offer: { amount: 1280, days: 30, bonusDays: 0 },
    isUpgrade: true,
    now: T0,
  });
  assert.equal(a.extraPaidDays, 161);
  assert.equal(a.paidDays, 30 + 161); // offerPaidDays(30) + extraPaidDays(161)
  assert.equal(a.bonusDays, 0);
  assert.equal(a.expiresAt, iso(T0 + (30 + 161) * DAY));
  // 不變式自洽：總效期 = paidDays + bonusDays（升級後再折抵不會被分母封頂高估）
  const span = (Date.parse(a.expiresAt) - T0) / DAY;
  assert.equal(span, a.paidDays + a.bonusDays);
});

test("防呆：負 paidAmount / 負 bonusDays → valid:false", () => {
  assert.equal(
    computeUpgradeCredit({ paidAmount: -100, paidDays: 360, bonusDays: 30, expiresAt: iso(T0 + 390 * DAY), now: T0 }).valid,
    false
  );
  assert.equal(
    computeUpgradeCredit({ paidAmount: 8160, paidDays: 360, bonusDays: -5, expiresAt: iso(T0 + 390 * DAY), now: T0 }).valid,
    false
  );
});

test("防呆：無效 offer（days<=0 / bonus>days）→ quote.valid:false", () => {
  const bad1 = computeUpgradeQuote({
    current: { paidAmount: 8160, paidDays: 360, bonusDays: 30, expiresAt: iso(T0 + 390 * DAY) },
    newOffer: { amount: 1280, days: 0, bonusDays: 0 },
    now: T0,
  });
  assert.equal(bad1.valid, false);
  assert.equal(bad1.newExpiresAt, null);
  const bad2 = computeUpgradeQuote({
    current: { paidAmount: 8160, paidDays: 360, bonusDays: 30, expiresAt: iso(T0 + 390 * DAY) },
    newOffer: { amount: 1280, days: 30, bonusDays: 40 },
    now: T0,
  });
  assert.equal(bad2.valid, false);
});
