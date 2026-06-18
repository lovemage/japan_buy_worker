export const RESERVED_SLUGS = [
  "api",
  "assets",
  "admin",
  "register",
  "platform-admin",
  "healthz",
  "s",
  "www",
  "auth",
  "onboarding",
];

export function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

export function getSlugValidationError(value) {
  const slug = normalizeSlug(value);
  if (!slug || slug.length < 3 || slug.length > 30) {
    return "Slug must be 3-30 characters";
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return "Slug must be lowercase alphanumeric with hyphens, no leading/trailing hyphens";
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return "This slug is reserved";
  }
  return "";
}

export function getSlugChangeLimit(effectivePlan) {
  if (effectivePlan === "proplus") return 3;
  if (effectivePlan === "pro") return 1;
  return 0;
}

export function getSlugChangeUsage(options) {
  const effectivePlan = options?.effectivePlan || "free";
  const slugChangeUsed = Math.max(0, Number(options?.slugChangeUsed || 0));
  const limit = getSlugChangeLimit(effectivePlan);
  const remaining = Math.max(0, limit - slugChangeUsed);
  return { limit, used: slugChangeUsed, remaining };
}

export function canChangeSlug(options) {
  const usage = getSlugChangeUsage(options);
  return usage.remaining > 0;
}

export function canChangeSlugOnceForPro(options) {
  return canChangeSlug(options);
}

export function canChangeSlugWithinPlanLimit(options) {
  const effectivePlan = options?.effectivePlan || "free";
  const slugChangeUsed = Number(options?.slugChangeUsed || 0);
  return canChangeSlug({ effectivePlan, slugChangeUsed });
}
