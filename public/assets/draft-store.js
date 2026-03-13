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
  const found = draft.items.find((x) => x.productId === item.productId);
  if (found) {
    found.quantity = Number(found.quantity || 1) + 1;
    if (!found.code && item.code) {
      found.code = item.code;
    }
    if ((!Array.isArray(found.sizeOptions) || found.sizeOptions.length === 0) && Array.isArray(item.sizeOptions)) {
      found.sizeOptions = item.sizeOptions;
    }
    if ((!Array.isArray(found.colorOptions) || found.colorOptions.length === 0) && Array.isArray(item.colorOptions)) {
      found.colorOptions = item.colorOptions;
    }
  } else {
    draft.items.push({
      productId: item.productId,
      code: item.code || "",
      productNameSnapshot: item.productNameSnapshot,
      quantity: 1,
      desiredSize: "",
      desiredColor: "",
      note: "",
      imageUrl: item.imageUrl || "",
      priceJpyTaxIn: item.priceJpyTaxIn ?? null,
      unitPriceTwd: item.unitPriceTwd ?? null,
      sizeOptions: Array.isArray(item.sizeOptions) ? item.sizeOptions : [],
      colorOptions: Array.isArray(item.colorOptions) ? item.colorOptions : [],
    });
  }
  setDraft(draft);
  return draft;
}
