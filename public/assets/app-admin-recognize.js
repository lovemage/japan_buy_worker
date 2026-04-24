import { loadManagedProducts } from "./app-admin-products.js";
import { handleUnauthorized } from "./session-guard.js";

const MAX_IMAGE_SIZE = 800;
const WEBP_QUALITY = 0.8;

let selectedImages = [];
let draftVariants = [];
let manualVariants = [];

function normalizeVariants(items, fallbackPrice) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      const stock = Number(item.stock);
      const rawPrice = item.price === null || item.price === undefined || item.price === ""
        ? fallbackPrice
        : item.price;
      const price = rawPrice === null || rawPrice === undefined || rawPrice === ""
        ? null
        : Number(rawPrice);
      if (!name) return null;
      return {
        name,
        stock: Number.isFinite(stock) && stock >= 0 ? Math.round(stock) : 10,
        price: Number.isFinite(price) && price >= 0 ? Math.round(price) : null,
      };
    })
    .filter(Boolean);
}

function getVariantState(prefix) {
  return prefix === "me" ? manualVariants : draftVariants;
}

function setVariantState(prefix, value) {
  if (prefix === "me") manualVariants = value;
  else draftVariants = value;
}

function getVariantFallbackPrice(prefix) {
  const price = Number(document.getElementById(`${prefix}-price`)?.value || 0);
  return Number.isFinite(price) && price >= 0 ? Math.round(price) : null;
}

function renderVariantEditor(prefix) {
  const root = document.getElementById(`${prefix}-variants`);
  if (!root) return;
  const variants = getVariantState(prefix);
  if (variants.length === 0) {
    root.innerHTML = '<div class="variant-empty">尚未新增規格</div>';
    return;
  }
  root.innerHTML = `<div class="variant-editor__list">${variants.map((variant, index) => `
    <div class="variant-row" data-prefix="${prefix}" data-variant-index="${index}">
      <label>規格名稱<input type="text" class="input-cute" data-field="name" value="${variant.name || ""}" placeholder="例如：單盒 / 三盒組" /></label>
      <label>數量<input type="number" min="0" class="input-cute" data-field="stock" value="${variant.stock ?? 10}" /></label>
      <label>價格<input type="number" min="0" class="input-cute" data-field="price" value="${variant.price ?? ""}" /></label>
      <button type="button" class="variant-remove" data-remove-index="${index}" data-prefix="${prefix}">×</button>
    </div>
  `).join("")}</div>`;

  root.querySelectorAll(".variant-row input").forEach((input) => {
    input.addEventListener("input", () => {
      const row = input.closest(".variant-row");
      const stateKey = row?.getAttribute("data-prefix");
      const index = Number(row?.getAttribute("data-variant-index"));
      const field = input.getAttribute("data-field");
      const state = getVariantState(stateKey);
      if (!Number.isInteger(index) || index < 0 || !field || !state[index]) return;
      state[index][field] = field === "name" ? input.value : Number(input.value || 0);
    });
  });

  root.querySelectorAll(".variant-remove").forEach((button) => {
    button.addEventListener("click", () => {
      const stateKey = button.getAttribute("data-prefix");
      const index = Number(button.getAttribute("data-remove-index"));
      const state = getVariantState(stateKey);
      if (!Number.isInteger(index) || index < 0) return;
      state.splice(index, 1);
      renderVariantEditor(stateKey);
    });
  });
}

function setDescriptionEditButtonState(button, editing) {
  if (!button) return;
  button.classList.toggle("is-editing", editing);
  button.innerHTML = editing
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>';
}

function getDraftDescriptionElements() {
  return {
    textarea: document.getElementById("draft-description"),
    preview: document.getElementById("draft-description-preview"),
  };
}

function syncDraftDescriptionPreview() {
  const { textarea, preview } = getDraftDescriptionElements();
  if (!textarea || !preview) return;
  const text = (textarea.value || "").trim();
  if (text) {
    preview.textContent = textarea.value;
    preview.classList.remove("is-empty");
  } else {
    preview.textContent = "尚未產生商品描述";
    preview.classList.add("is-empty");
  }
}

function setDraftDescriptionEditing(editing) {
  const { textarea, preview } = getDraftDescriptionElements();
  const editBtn = document.getElementById("btn-edit-draft-description");
  if (!textarea || !preview || !editBtn) return;
  textarea.classList.toggle("hidden", !editing);
  preview.classList.toggle("hidden", editing);
  setDescriptionEditButtonState(editBtn, editing);
  editBtn.setAttribute("aria-label", editing ? "完成商品描述編輯" : "編輯商品描述");
  editBtn.setAttribute("title", editing ? "完成" : "編輯商品描述");
  if (editing) {
    textarea.focus();
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
  } else {
    syncDraftDescriptionPreview();
  }
}

function showRecognizeStatus(text) {
  const node = document.getElementById("recognize-status");
  if (node) node.textContent = text;
}

function showListingStatus(text) {
  const node = document.getElementById("listing-status");
  if (node) node.textContent = text;
}

function updateButtons() {
  const quickBtn = document.getElementById("btn-recognize-quick");
  const manualEntryBtn = document.getElementById("btn-manual-entry");
  const hasImages = selectedImages.length > 0;
  if (quickBtn) quickBtn.disabled = !hasImages;
  if (manualEntryBtn) manualEntryBtn.disabled = !hasImages;
  const count = document.getElementById("photo-count");
  if (count) count.textContent = `已選 ${selectedImages.length} / ${window.__MAX_IMAGES || 3} 張`;
  if (typeof updateHint === "function") updateHint();
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > MAX_IMAGE_SIZE || h > MAX_IMAGE_SIZE) {
        if (w > h) {
          h = Math.round((h * MAX_IMAGE_SIZE) / w);
          w = MAX_IMAGE_SIZE;
        } else {
          w = Math.round((w * MAX_IMAGE_SIZE) / h);
          h = MAX_IMAGE_SIZE;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/webp", WEBP_QUALITY);
      const base64 = dataUrl.split(",")[1];
      resolve({ file, dataUrl, base64 });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function renderPreviews() {
  const row = document.getElementById("photo-previews");
  if (!row) return;
  const len = selectedImages.length;
  row.innerHTML = selectedImages
    .map(
      (img, idx) => `
    <div class="photo-preview-item">
      <img src="${img.dataUrl}" alt="照片 ${idx + 1}" />
      <button class="photo-remove" data-idx="${idx}" type="button">&times;</button>
      <div class="photo-reorder">
        ${idx > 0 ? `<button class="photo-move" data-idx="${idx}" data-dir="-1" type="button">◀</button>` : ""}
        ${idx < len - 1 ? `<button class="photo-move" data-idx="${idx}" data-dir="1" type="button">▶</button>` : ""}
      </div>
    </div>`
    )
    .join("");

  row.querySelectorAll(".photo-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      selectedImages.splice(idx, 1);
      renderPreviews();
      updateButtons();
    });
  });
  row.querySelectorAll(".photo-move").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const dir = Number(btn.getAttribute("data-dir"));
      const target = idx + dir;
      if (target < 0 || target >= selectedImages.length) return;
      [selectedImages[idx], selectedImages[target]] = [selectedImages[target], selectedImages[idx]];
      renderPreviews();
    });
  });
}

async function onPhotosSelected(event) {
  const files = Array.from(event.target.files || []);
  const remaining = (window.__MAX_IMAGES || 3) - selectedImages.length;
  const toProcess = files.slice(0, remaining);

  for (const file of toProcess) {
    try {
      const compressed = await compressImage(file);
      selectedImages.push(compressed);
    } catch (err) {
      console.error("壓縮圖片失敗", err);
    }
  }

  renderPreviews();
  updateButtons();
  event.target.value = "";
}

function showRecognizeLoading(show) {
  const loading = document.getElementById("recognize-loading");
  const barFill = document.getElementById("recognize-bar-fill");
  const loadingText = document.getElementById("recognize-loading-text");

  if (show) {
    if (loading) loading.classList.remove("hidden");
    if (barFill) { barFill.className = "sync-loading-bar__fill"; void barFill.offsetWidth; barFill.classList.add("phase-1"); }
    if (loadingText) loadingText.textContent = "vovoci AI 處理中";
    setTimeout(() => {
      if (barFill) barFill.classList.replace("phase-1", "phase-2");
    }, 600);
  } else {
    if (barFill) barFill.classList.replace("phase-2", "phase-3");
    if (loadingText) loadingText.textContent = "vovoci AI 編輯中";
    setTimeout(() => {
      if (loading) loading.classList.add("hidden");
      if (barFill) barFill.className = "sync-loading-bar__fill";
    }, 400);
  }
}

async function doRecognize() {
  if (selectedImages.length === 0) return;

  showRecognizeStatus("");
  showRecognizeLoading(true);
  const quickBtn = document.getElementById("btn-recognize-quick");
  if (quickBtn) quickBtn.disabled = true;

  try {
    const res = await apiFetch("/api/admin/recognize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        images: selectedImages.map((img) => img.base64),
        mode: "quick",
      }),
    });

    showRecognizeLoading(false);

    if (handleUnauthorized(res)) return;

    const data = await res.json();
    if (!data.ok) {
      showRecognizeStatus(data.error || "辨識失敗");
      return;
    }

    showRecognizeStatus("辨識完成");
    fillDraft(data.result);
  } catch (err) {
    showRecognizeLoading(false);
    showRecognizeStatus("辨識失敗");
  } finally {
    updateButtons();
  }
}

function fillDraft(result) {
  const draft = document.getElementById("recognize-draft");
  if (draft) draft.classList.remove("hidden");

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
  };

  set("draft-title-ja", result.titleJa);
  set("draft-title-zh", result.titleZhTw);
  set("draft-brand", result.brand);
  set("draft-category", result.category);
  set("draft-price", result.priceJpy);
  draftVariants = [];
  renderVariantEditor("draft");
  set("draft-description", result.description);
  syncDraftDescriptionPreview();
  setDraftDescriptionEditing(false);
  const specsObj = result.specs || {};
  set("draft-specs", JSON.stringify(specsObj));
  const specsDisplay = document.getElementById("draft-specs-display");
  if (specsDisplay) {
    const entries = Object.entries(specsObj);
    specsDisplay.innerHTML = entries.length > 0
      ? entries.map(([k, v]) => `<span style="color:#888">${k}：</span>${v}`).join("<br>")
      : '<span style="color:#aaa">無規格資訊</span>';
  }
  set("draft-sizes", Array.isArray(result.sizeOptions) ? result.sizeOptions.join(", ") : "");
  set("draft-colors", Array.isArray(result.colorOptions) ? result.colorOptions.join(", ") : "");

  const sourcesEl = document.getElementById("draft-sources");
  if (sourcesEl) sourcesEl.classList.add("hidden");
}

function cancelDraft() {
  const draft = document.getElementById("recognize-draft");
  if (draft) draft.classList.add("hidden");
  draftVariants = [];
  renderVariantEditor("draft");
  setDraftDescriptionEditing(false);
  showRecognizeStatus("");
  showListingStatus("");
}

async function confirmListing() {
  const get = (id) => document.getElementById(id)?.value?.trim() || "";

  const titleJa = get("draft-title-ja");
  const titleZhTw = get("draft-title-zh");
  if (!titleJa && !titleZhTw) {
    showListingStatus("商品名稱（日文或中文）為必填");
    return;
  }

  let specs = {};
  try {
    const raw = get("draft-specs");
    if (raw) specs = JSON.parse(raw);
  } catch {
    specs = {};
  }

  const priceRaw = get("draft-price");
  const priceJpy = priceRaw ? Number(priceRaw) : null;

  const payload = {
    titleJa,
    titleZhTw,
    brand: get("draft-brand"),
    category: get("draft-category"),
    priceJpyTaxIn: Number.isFinite(priceJpy) ? priceJpy : null,
    variants: normalizeVariants(draftVariants, priceJpy),
    description: get("draft-description"),
    specs,
    sizeOptions: get("draft-sizes").split(",").map((s) => s.trim()).filter(Boolean),
    colorOptions: get("draft-colors").split(",").map((s) => s.trim()).filter(Boolean),
    images: selectedImages.map(img => img.base64),
  };

  showListingStatus("上架中...");
  const btn = document.getElementById("btn-confirm-listing");
  if (btn) btn.disabled = true;

  try {
    const res = await apiFetch("/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (handleUnauthorized(res)) return;

    const data = await res.json();
    if (!data.ok) {
      showListingStatus(data.error || "上架失敗");
      return;
    }

    showListingStatus("上架成功");
    selectedImages = [];
    renderPreviews();
    updateButtons();
    loadManagedProducts();
    setTimeout(() => cancelDraft(), 2000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function updateHint() {
  const hint = document.getElementById("recognize-hint");
  const addMoreHint = document.getElementById("camera-add-more-hint");
  const hasImages = selectedImages.length > 0;

  if (addMoreHint) {
    addMoreHint.classList.toggle("hidden", !hasImages);
  }

  if (hint) {
    hint.classList.toggle("hidden", !hasImages);
  }
}

// ── Camera mode toggle (full-auto / semi-auto) ──

function initCameraModeToggle() {
  const toggle = document.getElementById("camera-mode-toggle");
  const label = document.getElementById("camera-mode-label");
  const autoBtn = document.getElementById("camera-auto-btn");
  const manualBtn = document.getElementById("camera-manual-btn");
  const manualEntryBtn = document.getElementById("btn-manual-entry");
  const manualForm = document.getElementById("manual-entry-form");
  if (!toggle) return;

  function applyCameraMode() {
    const isSemiAuto = toggle.checked;
    if (label) label.textContent = isSemiAuto ? "切換至全自動" : "切換至半自動";

    if (autoBtn) autoBtn.classList.toggle("hidden", isSemiAuto);
    if (manualBtn) manualBtn.classList.toggle("hidden", !isSemiAuto);
    if (manualEntryBtn) manualEntryBtn.classList.toggle("hidden", !isSemiAuto);

    if (!isSemiAuto && manualForm) {
      manualForm.classList.add("hidden");
      showManualEntryStatus("");
    }
  }

  toggle.addEventListener("change", applyCameraMode);
  applyCameraMode();
}

// ── Manual entry listing ──

function showManualEntryStatus(text) {
  const el = document.getElementById("manual-entry-status");
  if (el) el.textContent = text;
}

function showManualEntryForm() {
  if (selectedImages.length === 0) return;
  const form = document.getElementById("manual-entry-form");
  const draft = document.getElementById("recognize-draft");
  if (draft) draft.classList.add("hidden");
  if (form) form.classList.remove("hidden");
  manualVariants = [];
  renderVariantEditor("me");
  loadManualEntryCategories();
}

function cancelManualEntry() {
  const form = document.getElementById("manual-entry-form");
  if (form) form.classList.add("hidden");
  manualVariants = [];
  renderVariantEditor("me");
  showManualEntryStatus("");
}

async function loadManualEntryCategories() {
  try {
    const res = await apiFetch("/api/admin/categories");
    if (!res.ok) return;
    const body = await res.json();
    const dl = document.getElementById("me-category-datalist");
    if (dl && Array.isArray(body.categories)) {
      dl.innerHTML = body.categories.map((c) => `<option value="${c.name}">`).join("");
    }
  } catch {
    // Ignore non-critical failures for category suggestions.
  }
}

async function submitManualEntry() {
  const get = (id) => document.getElementById(id)?.value?.trim() || "";
  const titleJa = get("me-title-ja");
  const titleZhTw = get("me-title-zh");
  if (!titleJa && !titleZhTw) {
    showManualEntryStatus("商品名稱（日文或中文）為必填");
    return;
  }

  const priceRaw = get("me-price");
  const priceJpy = priceRaw ? Number(priceRaw) : null;

  const payload = {
    titleJa,
    titleZhTw,
    brand: get("me-brand"),
    category: get("me-category"),
    priceJpyTaxIn: Number.isFinite(priceJpy) ? priceJpy : null,
    variants: normalizeVariants(manualVariants, priceJpy),
    description: get("me-description"),
    specs: {},
    sizeOptions: get("me-sizes").split(",").map((s) => s.trim()).filter(Boolean),
    colorOptions: get("me-colors").split(",").map((s) => s.trim()).filter(Boolean),
    images: selectedImages.map((img) => img.base64),
  };

  showManualEntryStatus("上架中...");
  const btn = document.getElementById("btn-manual-confirm");
  if (btn) btn.disabled = true;

  try {
    const res = await apiFetch("/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!data.ok) {
      showManualEntryStatus(data.error || "上架失敗");
      return;
    }

    showManualEntryStatus("上架成功");
    selectedImages = [];
    renderPreviews();
    updateButtons();
    loadManagedProducts();
    setTimeout(() => cancelManualEntry(), 1200);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showAiImageEditPopup(show) {
  const popup = document.getElementById("ai-image-edit-popup");
  if (!popup) return;
  popup.style.display = show ? "flex" : "none";
}

function setAiImageEditPopupMsg(msg) {
  const el = document.getElementById("ai-image-edit-popup-msg");
  if (el) el.textContent = msg;
}

async function doAiImageEdit() {
  if (selectedImages.length === 0) {
    alert("請先選擇商品照片");
    return;
  }

  showAiImageEditPopup(true);
  setAiImageEditPopupMsg("");

  const btn = document.getElementById("btn-ai-image-edit");
  if (btn) btn.disabled = true;

  try {
    const res = await apiFetch("/api/admin/ai-image-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64: selectedImages[0].base64 }),
    });

    if (handleUnauthorized(res)) return;

    const data = await res.json();

    if (!data.ok) {
      setAiImageEditPopupMsg(data.error || "優化失敗");
      setTimeout(() => showAiImageEditPopup(false), 2500);
      return;
    }

    // Fetch the AI image and convert to webp base64 via canvas
    const imageRes = await apiFetch(data.imageUrl);
    if (!imageRes.ok) {
      setAiImageEditPopupMsg("圖片下載失敗，請重試");
      setTimeout(() => showAiImageEditPopup(false), 2500);
      return;
    }

    const blob = await imageRes.blob();
    const bmpUrl = URL.createObjectURL(blob);
    const newDataUrl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(bmpUrl);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const c = canvas.getContext("2d");
        c.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/webp", WEBP_QUALITY));
      };
      img.onerror = () => { URL.revokeObjectURL(bmpUrl); reject(new Error("圖片載入失敗")); };
      img.src = bmpUrl;
    });

    const newBase64 = newDataUrl.split(",")[1];
    // Insert AI image as first, move original to second
    selectedImages.splice(0, 0, { dataUrl: newDataUrl, base64: newBase64, file: selectedImages[0].file });
    renderPreviews();
    updateButtons();

    showAiImageEditPopup(false);
  } catch (err) {
    setAiImageEditPopupMsg("圖片優化失敗");
    setTimeout(() => showAiImageEditPopup(false), 2500);
  } finally {
    if (btn) {
      setTimeout(() => { btn.disabled = false; }, 30000);
    }
  }
}

function initPhotoRecognize() {
  const input = document.getElementById("photo-input");
  if (input) input.addEventListener("change", onPhotosSelected);

  const cameraInput = document.getElementById("photo-input-camera");
  if (cameraInput) cameraInput.addEventListener("change", onPhotosSelected);

  const quickBtn = document.getElementById("btn-recognize-quick");
  if (quickBtn) quickBtn.addEventListener("click", doRecognize);

  const cancelBtn = document.getElementById("btn-cancel-draft");
  if (cancelBtn) cancelBtn.addEventListener("click", cancelDraft);

  const confirmBtn = document.getElementById("btn-confirm-listing");
  if (confirmBtn) confirmBtn.addEventListener("click", confirmListing);
  document.getElementById("draft-add-variant")?.addEventListener("click", () => {
    draftVariants.push({ name: "", stock: 10, price: getVariantFallbackPrice("draft") });
    renderVariantEditor("draft");
  });
  document.getElementById("me-add-variant")?.addEventListener("click", () => {
    manualVariants.push({ name: "", stock: 10, price: getVariantFallbackPrice("me") });
    renderVariantEditor("me");
  });

  const aiEditBtn = document.getElementById("btn-ai-image-edit");
  if (aiEditBtn) aiEditBtn.addEventListener("click", doAiImageEdit);

  const editDraftDescBtn = document.getElementById("btn-edit-draft-description");
  if (editDraftDescBtn) {
    editDraftDescBtn.addEventListener("click", () => {
      const { textarea } = getDraftDescriptionElements();
      if (!textarea) return;
      const isEditing = !textarea.classList.contains("hidden");
      setDraftDescriptionEditing(!isEditing);
    });
  }

  const draftDescriptionInput = document.getElementById("draft-description");
  if (draftDescriptionInput) {
    draftDescriptionInput.addEventListener("input", syncDraftDescriptionPreview);
  }
  document.getElementById("draft-price")?.addEventListener("input", () => renderVariantEditor("draft"));
  document.getElementById("me-price")?.addEventListener("input", () => renderVariantEditor("me"));

  const manualEntryBtn = document.getElementById("btn-manual-entry");
  if (manualEntryBtn) manualEntryBtn.addEventListener("click", showManualEntryForm);

  const manualConfirmBtn = document.getElementById("btn-manual-confirm");
  if (manualConfirmBtn) manualConfirmBtn.addEventListener("click", submitManualEntry);

  const manualCancelBtn = document.getElementById("btn-manual-cancel");
  if (manualCancelBtn) manualCancelBtn.addEventListener("click", cancelManualEntry);

  initCameraModeToggle();
  syncDraftDescriptionPreview();
  setDraftDescriptionEditing(false);
  renderVariantEditor("draft");
  renderVariantEditor("me");
  updateButtons();
}

initPhotoRecognize();
