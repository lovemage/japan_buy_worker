export const DEFAULT_PLAN_OFFERS = {
  starter: [
    {
      months: 1,
      days: 30,
      amount: 980,
      monthlyPrice: 980,
      originalMonthlyPrice: 980,
      bonusDays: 0,
    },
    {
      months: 6,
      days: 180,
      amount: 5280,
      monthlyPrice: 880,
      originalMonthlyPrice: 980,
      bonusDays: 0,
    },
    {
      months: 12,
      days: 390,
      amount: 8160,
      monthlyPrice: 680,
      originalMonthlyPrice: 980,
      bonusDays: 30,
    },
  ],
  pro: [
    {
      months: 1,
      days: 30,
      amount: 1580,
      monthlyPrice: 1580,
      originalMonthlyPrice: 1580,
      bonusDays: 0,
    },
    {
      months: 6,
      days: 180,
      amount: 8880,
      monthlyPrice: 1480,
      originalMonthlyPrice: 1580,
      bonusDays: 0,
    },
    {
      months: 12,
      days: 390,
      amount: 15360,
      monthlyPrice: 1280,
      originalMonthlyPrice: 1580,
      bonusDays: 30,
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
