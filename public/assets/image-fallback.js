export const PRODUCT_PLACEHOLDER = "/assets/images/product-placeholder.svg";

export function withProductImageFallback(url) {
  const value = typeof url === "string" ? url.trim() : "";
  if (!value) return PRODUCT_PLACEHOLDER;
  // Prefix local /api/images/ paths with store base path for multi-tenant routing
  const base = window.__API_BASE || "";
  if (base && value.startsWith("/api/images/")) {
    return base + value;
  }
  return value;
}

export function bindProductImageFallback(image) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const applyFallback = () => {
    if (image.dataset.fallbackApplied === "1") {
      return;
    }
    image.dataset.fallbackApplied = "1";
    image.src = PRODUCT_PLACEHOLDER;
  };
  image.addEventListener("error", applyFallback);
  if (!image.getAttribute("src")) {
    applyFallback();
  }
}

export function applyProductImageFallback(root = document) {
  root.querySelectorAll('img[data-fallback="product"]').forEach((node) => {
    bindProductImageFallback(node);
  });
}
