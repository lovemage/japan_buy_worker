function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function calculateAdminFormTotals(form) {
  const items = Array.isArray(form?.items) ? form.items : [];
  const itemsTotalJpy = items.reduce((sum, item) => sum + toSafeNumber(item?.subtotalJpy), 0);
  const itemsTotalTwd = items.reduce((sum, item) => sum + toSafeNumber(item?.subtotalTwd), 0);
  const shippingTotalTwd = toSafeNumber(form?.shippingTotalTwd);
  const grandTotalTwd = itemsTotalTwd + shippingTotalTwd;

  return {
    itemsTotalJpy,
    itemsTotalTwd,
    grandTotalTwd,
  };
}
