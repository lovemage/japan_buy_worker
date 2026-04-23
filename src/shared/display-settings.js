export const DEFAULT_DISPLAY_SETTINGS = {
  viewMode: "2card",
  promoEnabled: true,
  promoFilters: ["all", "350", "450", "550"],
};

export function canManageStoreLogo(plan) {
  return plan === "plus" || plan === "pro" || plan === "proplus";
}

export function parseDisplaySettings(rawValue) {
  if (!rawValue) {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }

  try {
    return {
      ...DEFAULT_DISPLAY_SETTINGS,
      ...JSON.parse(rawValue),
    };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

export function sanitizeDisplaySettingsPatch(input, storePlan) {
  const next = { ...(input || {}) };

  if (!canManageStoreLogo(storePlan)) {
    delete next.storeLogo;
  }
  if (storePlan !== "pro") {
    delete next.tagNames;
  }

  return next;
}
