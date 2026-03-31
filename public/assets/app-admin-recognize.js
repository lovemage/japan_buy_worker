const MAX_PHOTOS = 3;
const MAX_IMAGE_SIZE = 800;
const JPEG_QUALITY = 0.7;

let selectedImages = [];

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
  const searchBtn = document.getElementById("btn-recognize-search");
  const hasImages = selectedImages.length > 0;
  if (quickBtn) quickBtn.disabled = !hasImages;
  if (searchBtn) searchBtn.disabled = !hasImages;
  const count = document.getElementById("photo-count");
  if (count) count.textContent = `已選 ${selectedImages.length} / ${MAX_PHOTOS} 張`;
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
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
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
  row.innerHTML = selectedImages
    .map(
      (img, idx) => `
    <div class="photo-preview-item">
      <img src="${img.dataUrl}" alt="照片 ${idx + 1}" />
      <button class="photo-remove" data-idx="${idx}" type="button">&times;</button>
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
}

async function onPhotosSelected(event) {
  const files = Array.from(event.target.files || []);
  const remaining = MAX_PHOTOS - selectedImages.length;
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

async function doRecognize(mode) {
  if (selectedImages.length === 0) return;

  showRecognizeStatus(mode === "search" ? "聯網搜尋中，請稍候..." : "辨識中，請稍候...");
  const quickBtn = document.getElementById("btn-recognize-quick");
  const searchBtn = document.getElementById("btn-recognize-search");
  if (quickBtn) quickBtn.disabled = true;
  if (searchBtn) searchBtn.disabled = true;

  try {
    const res = await fetch("/api/admin/recognize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        images: selectedImages.map((img) => img.base64),
        mode,
      }),
    });

    if (res.status === 401) {
      location.href = "/admin-login.html";
      return;
    }

    const data = await res.json();
    if (!data.ok) {
      showRecognizeStatus(`辨識失敗：${data.error || "未知錯誤"}`);
      return;
    }

    showRecognizeStatus("辨識完成！請檢查草稿內容。");
    fillDraft(data.result);
  } catch (err) {
    showRecognizeStatus(`辨識失敗：${String(err)}`);
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
  set("draft-description", result.description);
  set("draft-specs", JSON.stringify(result.specs || {}, null, 2));
  set("draft-sizes", Array.isArray(result.sizeOptions) ? result.sizeOptions.join(", ") : "");
  set("draft-colors", Array.isArray(result.colorOptions) ? result.colorOptions.join(", ") : "");

  const sourcesEl = document.getElementById("draft-sources");
  if (sourcesEl && Array.isArray(result.searchSources) && result.searchSources.length > 0) {
    sourcesEl.classList.remove("hidden");
    sourcesEl.innerHTML = "<strong>搜尋來源：</strong>" +
      result.searchSources.map((s) => `<a href="${s}" target="_blank" rel="noopener">${s}</a>`).join("、");
  } else if (sourcesEl) {
    sourcesEl.classList.add("hidden");
  }
}

function cancelDraft() {
  const draft = document.getElementById("recognize-draft");
  if (draft) draft.classList.add("hidden");
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
    showListingStatus("規格 JSON 格式錯誤");
    return;
  }

  const priceRaw = get("draft-price");
  const priceJpy = priceRaw ? Number(priceRaw) : null;

  const payload = {
    titleJa,
    titleZhTw,
    brand: get("draft-brand"),
    category: get("draft-category"),
    priceJpyTaxIn: Number.isFinite(priceJpy) ? priceJpy : null,
    description: get("draft-description"),
    specs,
    sizeOptions: get("draft-sizes").split(",").map((s) => s.trim()).filter(Boolean),
    colorOptions: get("draft-colors").split(",").map((s) => s.trim()).filter(Boolean),
    imageDataUrl: selectedImages.length > 0 ? selectedImages[0].dataUrl : "",
  };

  showListingStatus("上架中...");
  const btn = document.getElementById("btn-confirm-listing");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      location.href = "/admin-login.html";
      return;
    }

    const data = await res.json();
    if (!data.ok) {
      showListingStatus(`上架失敗：${data.error || "未知錯誤"}`);
      return;
    }

    showListingStatus(`上架成功！商品代碼：${data.code}`);
    selectedImages = [];
    renderPreviews();
    updateButtons();
    setTimeout(() => cancelDraft(), 2000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initPhotoRecognize() {
  const input = document.getElementById("photo-input");
  if (input) input.addEventListener("change", onPhotosSelected);

  const quickBtn = document.getElementById("btn-recognize-quick");
  if (quickBtn) quickBtn.addEventListener("click", () => doRecognize("quick"));

  const searchBtn = document.getElementById("btn-recognize-search");
  if (searchBtn) searchBtn.addEventListener("click", () => doRecognize("search"));

  const cancelBtn = document.getElementById("btn-cancel-draft");
  if (cancelBtn) cancelBtn.addEventListener("click", cancelDraft);

  const confirmBtn = document.getElementById("btn-confirm-listing");
  if (confirmBtn) confirmBtn.addEventListener("click", confirmListing);

  updateButtons();
}

initPhotoRecognize();
