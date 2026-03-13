export const PRODUCT_PLACEHOLDER = "/assets/images/product-placeholder.svg";

export function withProductImageFallback(url) {
  const value = typeof url === "string" ? url.trim() : "";
  return value || PRODUCT_PLACEHOLDER;
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
