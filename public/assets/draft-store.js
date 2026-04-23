const DRAFT_KEY = "requirementDraft";

export function getDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
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
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
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
