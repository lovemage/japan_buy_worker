const LEGACY_DRAFT_KEY = "requirementDraft";
const DRAFT_KEY_PREFIX = "requirementDraft:v2";

function getStoreScope() {
  const slug = typeof window !== "undefined" ? String(window.__STORE_SLUG || "").trim() : "";
  if (slug) return slug;

  const apiBase = typeof window !== "undefined" ? String(window.__API_BASE || "") : "";
  const match = apiBase.match(/^\/s\/([^/]+)/);
  return match?.[1] || "default";
}

function getDraftKey() {
  return `${DRAFT_KEY_PREFIX}:${getStoreScope()}`;
}

function discardLegacyDraft() {
  // The old global key could mix carts from different storefronts. Do not
  // migrate it because its store of origin cannot be trusted.
  localStorage.removeItem(LEGACY_DRAFT_KEY);
}

export function getDraft() {
  try {
    discardLegacyDraft();
    const raw = localStorage.getItem(getDraftKey());
    if (!raw) {
      return { items: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { items: [] };
  }
}

export function setDraft(draft) {
  discardLegacyDraft();
  localStorage.setItem(getDraftKey(), JSON.stringify(draft));
}

export function clearDraft() {
  discardLegacyDraft();
  localStorage.removeItem(getDraftKey());
}

export function addItem(item) {
  const draft = getDraft();
  const addQty = Math.max(1, Number(item.quantity || 1));
  const selectedImageUrl = item.selectedImageUrl || item.imageUrl || "";
  const variantName = (item.variantName || "").trim();
  const variantPriceJpyTaxIn = item.variantPriceJpyTaxIn ?? item.priceJpyTaxIn ?? null;
  const variantUnitPriceTwd = item.variantUnitPriceTwd ?? item.unitPriceTwd ?? null;
  const found = draft.items.find(
    (x) =>
      x.productId === item.productId &&
      (x.selectedImageUrl || x.imageUrl || "") === selectedImageUrl &&
      (x.variantName || "") === variantName
  );
  if (found) {
    found.quantity = Number(found.quantity || 1) + addQty;
    if (!found.code && item.code) {
      found.code = item.code;
    }
    if (!found.selectedImageUrl && selectedImageUrl) {
      found.selectedImageUrl = selectedImageUrl;
    }
    if ((!Array.isArray(found.sizeOptions) || found.sizeOptions.length === 0) && Array.isArray(item.sizeOptions)) {
      found.sizeOptions = item.sizeOptions;
    }
    if ((!Array.isArray(found.colorOptions) || found.colorOptions.length === 0) && Array.isArray(item.colorOptions)) {
      found.colorOptions = item.colorOptions;
    }
    if ((!Array.isArray(found.variantOptions) || found.variantOptions.length === 0) && Array.isArray(item.variantOptions)) {
      found.variantOptions = item.variantOptions;
    }
    if (!found.variantName && variantName) {
      found.variantName = variantName;
    }
    if ((found.variantPriceJpyTaxIn === null || found.variantPriceJpyTaxIn === undefined) && variantPriceJpyTaxIn !== null && variantPriceJpyTaxIn !== undefined) {
      found.variantPriceJpyTaxIn = variantPriceJpyTaxIn;
    }
    if ((found.variantUnitPriceTwd === null || found.variantUnitPriceTwd === undefined) && variantUnitPriceTwd !== null && variantUnitPriceTwd !== undefined) {
      found.variantUnitPriceTwd = variantUnitPriceTwd;
    }
  } else {
    draft.items.push({
      productId: item.productId,
      code: item.code || "",
      productNameSnapshot: item.productNameSnapshot,
      quantity: addQty,
      desiredSize: "",
      desiredColor: "",
      note: "",
      imageUrl: item.imageUrl || "",
      selectedImageUrl,
      priceJpyTaxIn: variantPriceJpyTaxIn,
      unitPriceTwd: variantUnitPriceTwd,
      sizeOptions: Array.isArray(item.sizeOptions) ? item.sizeOptions : [],
      colorOptions: Array.isArray(item.colorOptions) ? item.colorOptions : [],
      variantOptions: Array.isArray(item.variantOptions) ? item.variantOptions : [],
      variantName,
      variantPriceJpyTaxIn,
      variantUnitPriceTwd,
    });
  }
  setDraft(draft);
  return draft;
}
