import type { D1DatabaseLike } from "./types/d1";

export type RequestContext = {
  storeId: number;
  storeSlug: string;
  storePlan: string; // "free" | "pro"
  db: D1DatabaseLike;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  r2: any | null;
  basePath: string; // "/s/{slug}" for path-based, "" for subdomain
};

export type StoreRow = {
  id: number;
  slug: string;
  name: string;
  owner_email: string;
  password_hash: string;
  password_salt: string;
  destination_country: string;
  display_currency: string;
  line_id: string | null;
  plan: string;
  plan_expires_at: string | null;
  subdomain: string | null;
  is_active: number;
};

export async function resolveStore(
  db: D1DatabaseLike,
  slug: string
): Promise<StoreRow | null> {
  return db
    .prepare("SELECT * FROM stores WHERE slug = ? AND is_active = 1 LIMIT 1")
    .bind(slug)
    .first<StoreRow>();
}

export async function resolveStoreBySubdomain(
  db: D1DatabaseLike,
  subdomain: string
): Promise<StoreRow | null> {
  return db
    .prepare(
      "SELECT * FROM stores WHERE (subdomain = ? OR slug = ?) AND is_active = 1 LIMIT 1"
    )
    .bind(subdomain, subdomain)
    .first<StoreRow>();
}

export function getEffectivePlan(store: StoreRow): string {
  // Paid plans (starter, pro) downgrade to free when expired
  if ((store.plan === "pro" || store.plan === "starter") && store.plan_expires_at) {
    const expires = new Date(store.plan_expires_at);
    if (expires < new Date()) return "free";
  }
  return store.plan;
}
