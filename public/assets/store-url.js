export function buildStorePublicBaseUrl(options) {
  const plan = options?.plan || "free";
  const slug = options?.slug || "";
  const mainDomain = options?.mainDomain || "";
  const protocol = options?.protocol || "https:";
  const origin = options?.origin || "";
  const apiBase = options?.apiBase || "";

  if (slug && mainDomain) {
    if (plan === "pro") return `${protocol}//${slug}.${mainDomain}`;
    return `${protocol}//${mainDomain}/s/${slug}`;
  }

  return `${origin}${apiBase}`;
}

export function buildStoreReturnToPath(options) {
  const plan = options?.plan || "free";
  const slug = options?.slug || "";
  const apiBase = options?.apiBase || "";

  if (plan === "pro") return "/";
  if (slug) return `/s/${slug}/`;
  return `${apiBase || ""}/`;
}

export function buildProductShareUrl(code, options) {
  const baseUrl = buildStorePublicBaseUrl(options);
  const returnTo = buildStoreReturnToPath(options);
  return `${baseUrl}/product?code=${encodeURIComponent(code || "")}&returnTo=${encodeURIComponent(returnTo)}`;
}

export function buildStorePublicDisplayText(options) {
  const baseUrl = buildStorePublicBaseUrl(options);
  const withoutProtocol = baseUrl.replace(/^https?:\/\//, "");
  return withoutProtocol.endsWith("/") ? withoutProtocol : `${withoutProtocol}/`;
}
