export const DEFAULT_DISPLAY_SETTINGS = {
  viewMode: "2card",
  promoEnabled: true,
  wholesalePriceEnabled: false,
};

export function canManageStoreLogo(plan) {
  return plan === "plus" || plan === "pro" || plan === "proplus";
}

export function parseDisplaySettings(rawValue) {
  if (!rawValue) {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }

  try {
    const parsed = JSON.parse(rawValue);
    delete parsed.promoFilters;
    return {
      ...DEFAULT_DISPLAY_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

export function sanitizeDisplaySettingsPatch(input, storePlan) {
  const next = { ...(input || {}) };
  delete next.promoFilters;

  if (!canManageStoreLogo(storePlan)) {
    delete next.storeLogo;
  }
  if (storePlan !== "pro") {
    delete next.tagNames;
  }

  return next;
}
