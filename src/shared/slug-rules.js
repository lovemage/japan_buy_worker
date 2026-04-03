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

export function canChangeSlugOnceForPro(options) {
  const effectivePlan = options?.effectivePlan || "free";
  const slugChangeUsed = Number(options?.slugChangeUsed || 0);
  return effectivePlan === "pro" && slugChangeUsed === 0;
}
