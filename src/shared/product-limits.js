export const DEFAULT_PLAN_PRODUCT_LIMITS = { free: 10, plus: 25, pro: 60, proplus: -1 };

export function parsePlanProductLimits(raw) {
  if (!raw) return DEFAULT_PLAN_PRODUCT_LIMITS;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? { ...DEFAULT_PLAN_PRODUCT_LIMITS, ...parsed }
      : DEFAULT_PLAN_PRODUCT_LIMITS;
  } catch {
    return DEFAULT_PLAN_PRODUCT_LIMITS;
  }
}

export function productLimitForPlan(plan, limits = DEFAULT_PLAN_PRODUCT_LIMITS) {
  const fallback = Object.prototype.hasOwnProperty.call(DEFAULT_PLAN_PRODUCT_LIMITS, plan)
    ? DEFAULT_PLAN_PRODUCT_LIMITS[plan]
    : DEFAULT_PLAN_PRODUCT_LIMITS.free;
  const raw = Object.prototype.hasOwnProperty.call(limits, plan) ? limits[plan] : fallback;
  const limit = Number(raw);
  if (!Number.isFinite(limit)) return DEFAULT_PLAN_PRODUCT_LIMITS.free;
  if (limit < 0) return null;
  return Math.max(0, Math.floor(limit));
}

export async function getPlanProductLimit(db, plan) {
  const limitsRow = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'plan_limits'")
    .first();
  return productLimitForPlan(plan, parsePlanProductLimits(limitsRow?.value));
}

export function buildVisibleProductLimitClause({ alias = "p", storeId, limit }) {
  if (limit === null) return { sql: "", params: [] };
  return {
    sql: ` AND ${alias}.id IN (
      SELECT id
      FROM products
      WHERE store_id = ? AND is_active = 1
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    )`,
    params: [storeId, limit],
  };
}
