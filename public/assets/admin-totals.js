function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function hasAdjustedValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function calculateAdminFormTotals(form) {
  const items = Array.isArray(form?.items) ? form.items : [];
  const itemsTotalJpy = items.reduce((sum, item) => sum + toSafeNumber(item?.subtotalJpy), 0);
  const originalItemsTotalTwd = items.reduce((sum, item) => sum + toSafeNumber(item?.subtotalTwd), 0);
  const originalShippingTotalTwd = toSafeNumber(form?.shippingTotalTwd);
  const hasAdjustedItems = hasAdjustedValue(form?.adjustedItemsTotalTwd);
  const hasAdjustedShipping = hasAdjustedValue(form?.adjustedShippingTotalTwd);
  const itemsTotalTwd = hasAdjustedItems ? toSafeNumber(form.adjustedItemsTotalTwd) : originalItemsTotalTwd;
  const shippingTotalTwd = hasAdjustedShipping ? toSafeNumber(form.adjustedShippingTotalTwd) : originalShippingTotalTwd;
  const grandTotalTwd = itemsTotalTwd + shippingTotalTwd;

  if (hasAdjustedItems || hasAdjustedShipping) {
    return {
      itemsTotalJpy,
      itemsTotalTwd,
      originalItemsTotalTwd,
      shippingTotalTwd,
      originalShippingTotalTwd,
      grandTotalTwd,
      originalGrandTotalTwd: originalItemsTotalTwd + originalShippingTotalTwd,
      amountAdjusted: true,
    };
  }

  return {
    itemsTotalJpy,
    itemsTotalTwd,
    grandTotalTwd,
  };
}
