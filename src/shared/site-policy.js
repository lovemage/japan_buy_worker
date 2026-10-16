// Conservative discovery policy, not a legal determination or a sales approval.
const SENSITIVE = /醫藥品|医薬品|藥品|药品|處方|处方|口內炎|口内炎|保健食品|健康食品|營養補充|营养补充|菸|煙草|烟草|電子煙|电子烟|酒類|酒类|法事|姻緣|姻缘|桃花燈|桃花灯|\b(medicine|pharmaceutical|supplement|tobacco|vape|alcohol)\b/i;

export function isSensitiveProduct(product) {
  return SENSITIVE.test([product.title_zh_tw, product.title_ja, product.category, product.description].filter(Boolean).join(" "));
}

export function isIndexableProduct(product, retailPrice) {
  return !isSensitiveProduct(product)
    && String(product.title_zh_tw || "").trim().length >= 2
    && String(product.description || "").trim().length >= 40
    && /^(https?:\/\/|\/api\/images\/)/i.test(String(product.image_url || ""))
    && Number.isFinite(retailPrice) && retailPrice > 0;
}

export function canonicalRedirect(request, mainDomain) {
  const url = new URL(request.url);
  const managed = url.hostname === mainDomain || url.hostname.endsWith(`.${mainDomain}`);
  if (!managed || (url.protocol === "https:" && url.hostname !== `www.${mainDomain}`)) return null;
  url.protocol = "https:";
  if (url.hostname === `www.${mainDomain}`) url.hostname = mainDomain;
  // Preserve methods/bodies on payment callbacks and other non-GET requests.
  return Response.redirect(url.href, /^(GET|HEAD)$/.test(request.method) ? 301 : 308);
}

export function withSecurityHeaders(response, request) {
  const out = new Response(response.body, response);
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("X-Frame-Options", "SAMEORIGIN");
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Existing checkout pages need inline scripts and cross-origin forms.
  out.headers.set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'self'");
  if (new URL(request.url).protocol === "https:") {
    out.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return out;
}

export function publicCacheTtl(request, mainDomain) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.protocol !== "https:"
    || request.headers.has("cookie") || request.headers.has("authorization")
    || request.headers.has("range") || request.headers.has("x-forwarded-host")
    || /no-cache|no-store/i.test(request.headers.get("cache-control") || "")) return 0;
  if (url.hostname !== mainDomain && !url.hostname.endsWith(`.${mainDomain}`)) return 0;
  if (url.hostname === `www.${mainDomain}`) return 0;
  if (/^\/(sitemap|sitemap-stores)\.xml$/.test(url.pathname) && !url.search) return 300;
  const tenantPath = url.hostname === mainDomain
    ? url.pathname.match(/^\/s\/[a-z0-9-]+(\/.*)?$/)?.[1] || ""
    : url.pathname;
  if (!["/", "/index.html", "/store.html", "/product", "/product.html"].includes(tenantPath)) return 0;
  // Avoid storing unbounded tracking/filter combinations and private previews.
  for (const key of url.searchParams.keys()) if (key !== "code") return 0;
  return 60;
}

export async function serveWithEdgeCache(request, mainDomain, cache, execution, render) {
  const ttl = publicCacheTtl(request, mainDomain);
  if (!ttl || !cache || !execution) return render();
  try {
    const hit = await cache.match(request);
    if (hit) return hit;
  } catch { /* Cache is optional; origin remains authoritative. */ }
  const response = await render();
  if (response.status === 200 && !response.headers.has("set-cookie")
    && /\bpublic\b/i.test(response.headers.get("cache-control") || "")
    && !/private|no-store/i.test(response.headers.get("cache-control") || "")) {
    const cached = new Response(response.clone().body, response);
    cached.headers.set("Cache-Control", `public, max-age=0, s-maxage=${ttl}, must-revalidate`);
    execution.waitUntil(cache.put(request, cached).catch(() => {}));
  }
  return response;
}
