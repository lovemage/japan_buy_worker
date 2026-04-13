export const DEFAULT_PLAN_OFFERS = {
  plus: [
    {
      months: 1,
      days: 30,
      amount: 490,
      monthlyPrice: 490,
      originalMonthlyPrice: 490,
      bonusDays: 0,
    },
  ],
  pro: [
    {
      months: 1,
      days: 30,
      amount: 880,
      monthlyPrice: 880,
      originalMonthlyPrice: 880,
      bonusDays: 0,
    },
    {
      months: 6,
      days: 180,
      amount: 4680,
      monthlyPrice: 780,
      originalMonthlyPrice: 880,
      bonusDays: 0,
    },
    {
      months: 12,
      days: 390,
      amount: 8160,
      monthlyPrice: 680,
      originalMonthlyPrice: 880,
      bonusDays: 30,
    },
  ],
  proplus: [
    {
      months: 1,
      days: 30,
      amount: 1280,
      monthlyPrice: 1280,
      originalMonthlyPrice: 1280,
      bonusDays: 0,
    },
    {
      months: 6,
      days: 210,
      amount: 7680,
      monthlyPrice: 1280,
      originalMonthlyPrice: 1280,
      bonusDays: 30,
    },
    {
      months: 12,
      days: 420,
      amount: 15360,
      monthlyPrice: 1280,
      originalMonthlyPrice: 1280,
      bonusDays: 60,
    },
  ],
};

export function getPlanOffers(plan, offers = DEFAULT_PLAN_OFFERS) {
  const rows = Array.isArray(offers?.[plan]) ? offers[plan] : [];
  return rows.slice().sort((a, b) => Number(a.months) - Number(b.months));
}

export function getPlanOfferByMonths(plan, months, offers = DEFAULT_PLAN_OFFERS) {
  const list = getPlanOffers(plan, offers);
  const target = Number(months);
  return list.find((x) => Number(x.months) === target) || null;
}
