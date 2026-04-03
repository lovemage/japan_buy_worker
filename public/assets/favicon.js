export const DEFAULT_FAVICON_HREF = "/assets/images/logo-3.png";

export function getStorefrontFaviconHref({ displaySettings, apiBase, fallbackHref = DEFAULT_FAVICON_HREF } = {}) {
  const logoKey = typeof displaySettings?.storeLogo === "string" ? displaySettings.storeLogo.trim() : "";
  if (!logoKey) return fallbackHref;
  const base = typeof apiBase === "string" ? apiBase : "";
  return `${base}/api/images/${logoKey}`;
}

export function applyStorefrontFavicon({ displaySettings, apiBase, fallbackHref = DEFAULT_FAVICON_HREF } = {}) {
  const href = getStorefrontFaviconHref({ displaySettings, apiBase, fallbackHref });
  let icon = document.querySelector('link[rel="icon"]');
  if (!(icon instanceof HTMLLinkElement)) {
    icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/png";
    document.head.appendChild(icon);
  }
  icon.href = href;
  return href;
}
