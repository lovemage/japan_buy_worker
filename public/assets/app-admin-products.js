import { showError } from "./app-admin.js";
import { withProductImageFallback, applyProductImageFallback } from "./image-fallback.js";

function prefixImageUrl(url) {
  if (!url) return url;
  var base = window.__API_BASE || "";
  if (base && typeof url === "string" && url.startsWith("/api/images/")) return base + url;
  return url;
}

// === Product Management ===
let managePage = 1;
let manageSearch = "";
let manageDebounce = null;

function formatPrice(price) {
  if (!price && price !== 0) return "-";
  const sym = (window.__COUNTRY_CONFIG || {}).currencySymbol || "¥";
  return `${sym}${Number(price).toLocaleString("en-US")}`;
}

function renderProductGrid(products, paging) {
  const grid = document.getElementById("manage-product-grid");
  const pagingEl = document.getElementById("manage-paging");
  if (!grid) return;

  if (!products || products.length === 0) {
    grid.innerHTML = '<div class="manage-empty"><p>沒有商品</p></div>';
    if (pagingEl) pagingEl.innerHTML = "";
    return;
  }

  grid.innerHTML = products.map((p) => {
    const imgSrc = withProductImageFallback(p.displayImageUrl || p.imageUrl || "");
    const name = p.nameZhTw || p.nameJa || "未命名";
    return `
    <div class="manage-card">
      <img class="manage-card__img" src="${imgSrc}" alt="${name}" data-fallback="product" />
      <div class="manage-card__body">
        <p class="manage-card__title">${name}</p>
        <p class="manage-card__price">${formatPrice(p.priceJpyTaxIn)}</p>
        <p class="manage-card__meta">${p.brand || ""}${p.category ? " · " + p.category : ""}</p>
        <div class="manage-card__actions">
          <button class="button js-product-edit" data-id="${p.id}" data-code="${p.code}" data-active="${p.isActive}" data-name-ja="${(p.nameJa || "").replace(/"/g, "&quot;")}" data-name-zh="${(p.nameZhTw || "").replace(/"/g, "&quot;")}" data-brand="${(p.brand || "").replace(/"/g, "&quot;")}" data-category="${(p.category || "").replace(/"/g, "&quot;")}" data-price="${p.priceJpyTaxIn ?? ""}">編輯</button>
          <button class="button secondary js-copy-url" data-code="${p.code}" title="複製商品網址">🔗 網址</button>
        </div>
      </div>
    </div>`;
  }).join("");

  applyProductImageFallback(grid);

  grid.querySelectorAll(".js-product-edit").forEach((btn) => {
    btn.addEventListener("click", () => openEditModal(btn));
  });

  grid.querySelectorAll(".js-copy-url").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-code");
      const base = window.__API_BASE || "";
      const url = location.origin + base + "/product?code=" + encodeURIComponent(code) + "&returnTo=" + encodeURIComponent(base + "/");
      navigator.clipboard.writeText(url).then(() => {
        const orig = btn.textContent;
        btn.textContent = "✓ 已複製";
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  });

  grid.querySelectorAll(".js-product-toggle-REMOVED").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const isCurrentlyActive = btn.textContent === "下架";
      btn.disabled = true;
      try {
        const res = await apiFetch("/api/admin/products/toggle", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: Number(id), isActive: isCurrentlyActive ? 0 : 1 }),
        });
        if (res.ok) await loadManagedProducts();
        else showError("操作失敗");
      } finally {
        btn.disabled = false;
      }
    });
  });

  if (pagingEl && paging) {
    const { page, totalPages, total } = paging;
    pagingEl.innerHTML = `
      <button class="button secondary" ${page <= 1 ? "disabled" : ""} id="manage-prev">上一頁</button>
      <span class="meta">${page} / ${totalPages}（${total} 件）</span>
      <button class="button secondary" ${page >= totalPages ? "disabled" : ""} id="manage-next">下一頁</button>
    `;
    document.getElementById("manage-prev")?.addEventListener("click", () => { managePage--; loadManagedProducts(); });
    document.getElementById("manage-next")?.addEventListener("click", () => { managePage++; loadManagedProducts(); });
  }
}

async function loadManagedProducts() {
  const params = new URLSearchParams({ limit: "20", offset: String((managePage - 1) * 20) });
  if (manageSearch) params.set("search", manageSearch);
  const res = await apiFetch(`/api/products?${params}`);
  if (!res.ok) { showError("載入商品失敗"); return; }
  const body = await res.json();
  renderProductGrid(body.products || [], body.paging || {});
}

// === Edit Modal ===
let editGallery = [];
let editNewImages = [];

function renderEditGallery() {
  const container = document.getElementById("edit-gallery");
  if (!container) return;
  const all = [...editGallery];
  if (all.length === 0 && editNewImages.length === 0) {
    container.innerHTML = '<p class="meta">尚無圖片</p>';
    return;
  }
  container.innerHTML = all.map((url, idx) => `
    <div class="edit-gallery__item">
      <img src="${prefixImageUrl(url)}" alt="圖片 ${idx + 1}" />
      <button class="edit-gallery__remove" data-idx="${idx}" data-type="existing" type="button">&times;</button>
    </div>
  `).join("") + editNewImages.map((img, idx) => `
    <div class="edit-gallery__item" style="border-color:var(--brand)">
      <img src="${img.dataUrl}" alt="新圖 ${idx + 1}" />
      <button class="edit-gallery__remove" data-idx="${idx}" data-type="new" type="button">&times;</button>
    </div>
  `).join("");

  container.querySelectorAll(".edit-gallery__remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.getAttribute("data-type");
      const idx = Number(btn.getAttribute("data-idx"));
      if (type === "new") {
        editNewImages.splice(idx, 1);
        renderEditGallery();
      } else {
        const url = editGallery[idx];
        const id = Number(document.getElementById("edit-id")?.value);
        if (!url || !id) return;
        btn.disabled = true;
        const res = await apiFetch("/api/admin/products/image-delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, imageUrl: url }),
        });
        if (res.ok) {
          const data = await res.json();
          editGallery = data.gallery || [];
          renderEditGallery();
        } else {
          showError("刪除圖片失敗");
        }
      }
    });
  });
}

async function openEditModal(btn) {
  const modal = document.getElementById("edit-modal");
  if (!modal) return;

  const id = btn.getAttribute("data-id");
  const code = btn.getAttribute("data-code");
  document.getElementById("edit-id").value = id || "";
  document.getElementById("edit-code").value = code || "";
  document.getElementById("edit-title-ja").value = btn.getAttribute("data-name-ja") || "";
  document.getElementById("edit-title-zh").value = btn.getAttribute("data-name-zh") || "";
  document.getElementById("edit-brand").value = btn.getAttribute("data-brand") || "";
  document.getElementById("edit-category").value = btn.getAttribute("data-category") || "";
  document.getElementById("edit-price").value = btn.getAttribute("data-price") || "";
  document.getElementById("edit-status").textContent = "";

  // Set toggle button state
  const isActive = btn.getAttribute("data-active") !== "0";
  const toggleBtn = document.getElementById("edit-toggle");
  if (toggleBtn) {
    toggleBtn.textContent = isActive ? "下架" : "上架";
    toggleBtn.style.color = isActive ? "#ef4444" : "#22c55e";
    toggleBtn.onclick = async function() {
      toggleBtn.disabled = true;
      const res = await apiFetch("/api/admin/products/toggle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: Number(id), isActive: isActive ? 0 : 1 }),
      });
      if (res.ok) {
        modal.classList.add("hidden");
        await loadManagedProducts();
      } else {
        toggleBtn.disabled = false;
        showError("操作失敗");
      }
    };
  }

  editNewImages = [];
  editGallery = [];

  modal.classList.remove("hidden");

  // Fetch product detail to get gallery
  if (code) {
    const res = await apiFetch(`/api/product?code=${encodeURIComponent(code)}`);
    if (res.ok) {
      const data = await res.json();
      editGallery = Array.isArray(data.product?.gallery) ? data.product.gallery : [];
    }
  }
  renderEditGallery();
}

async function onEditPhotos(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files.slice(0, 5)) {
    try { editNewImages.push(await compressImageToWebp(file)); } catch { /* skip */ }
  }
  renderEditGallery();
  event.target.value = "";
}

function closeEditModal() {
  const modal = document.getElementById("edit-modal");
  if (modal) modal.classList.add("hidden");
  editNewImages = [];
  editGallery = [];
}

async function saveEdit() {
  const id = Number(document.getElementById("edit-id")?.value);
  if (!id) return;

  const status = document.getElementById("edit-status");
  const payload = {
    id,
    titleJa: document.getElementById("edit-title-ja")?.value?.trim() || "",
    titleZhTw: document.getElementById("edit-title-zh")?.value?.trim() || "",
    brand: document.getElementById("edit-brand")?.value?.trim() || "",
    category: document.getElementById("edit-category")?.value?.trim() || "",
    priceJpyTaxIn: document.getElementById("edit-price")?.value ? Number(document.getElementById("edit-price").value) : null,
    gallery: editGallery,
    newImages: editNewImages.map(img => img.base64),
  };

  const btn = document.getElementById("edit-save");
  if (btn) btn.disabled = true;
  if (status) status.textContent = "儲存中...";

  try {
    const res = await apiFetch("/api/admin/products/update", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) { location.href = "/admin-login.html"; return; }
    const data = await res.json();
    if (!data.ok) { if (status) status.textContent = `儲存失敗：${data.error}`; return; }
    closeEditModal();
    await loadManagedProducts();
  } catch (err) {
    if (status) status.textContent = `儲存失敗：${String(err)}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initEditModal() {
  document.getElementById("edit-cancel")?.addEventListener("click", closeEditModal);
  document.getElementById("edit-save")?.addEventListener("click", saveEdit);
  document.getElementById("edit-photo-input")?.addEventListener("change", onEditPhotos);
  document.querySelector(".edit-modal__backdrop")?.addEventListener("click", closeEditModal);
}

function initManageSearch() {
  const input = document.getElementById("manage-search");
  if (!input) return;
  input.addEventListener("input", () => {
    clearTimeout(manageDebounce);
    manageDebounce = setTimeout(() => {
      manageSearch = input.value.trim();
      managePage = 1;
      loadManagedProducts();
    }, 300);
  });
}

const MAX_PHOTOS = 3;
const MAX_IMAGE_SIZE = 800;
const WEBP_QUALITY = 0.8;

let manualImages = [];

function compressImageToWebp(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > MAX_IMAGE_SIZE || h > MAX_IMAGE_SIZE) {
        if (w > h) { h = Math.round((h * MAX_IMAGE_SIZE) / w); w = MAX_IMAGE_SIZE; }
        else { w = Math.round((w * MAX_IMAGE_SIZE) / h); h = MAX_IMAGE_SIZE; }
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/webp", WEBP_QUALITY);
      const base64 = dataUrl.split(",")[1];
      resolve({ file, dataUrl, base64 });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function renderManualPreviews() {
  const row = document.getElementById("manual-photo-previews");
  if (!row) return;
  row.innerHTML = manualImages.map((img, idx) => `
    <div class="photo-preview-item">
      <img src="${img.dataUrl}" alt="照片 ${idx + 1}" />
      <button class="photo-remove" data-idx="${idx}" type="button">&times;</button>
    </div>
  `).join("");
  row.querySelectorAll(".photo-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      manualImages.splice(Number(btn.getAttribute("data-idx")), 1);
      renderManualPreviews();
      updateManualCount();
    });
  });
}

function updateManualCount() {
  const el = document.getElementById("manual-photo-count");
  if (el) el.textContent = `已選 ${manualImages.length} / ${MAX_PHOTOS} 張`;
}

async function onManualPhotos(event) {
  const files = Array.from(event.target.files || []);
  const remaining = MAX_PHOTOS - manualImages.length;
  for (const file of files.slice(0, remaining)) {
    try { manualImages.push(await compressImageToWebp(file)); } catch { /* skip */ }
  }
  renderManualPreviews();
  updateManualCount();
  event.target.value = "";
}

function showStatus(text) {
  const el = document.getElementById("manual-status");
  if (el) el.textContent = text;
}

async function submitManualProduct() {
  const get = (id) => document.getElementById(id)?.value?.trim() || "";
  const titleJa = get("manual-title-ja");
  const titleZhTw = get("manual-title-zh");
  if (!titleJa && !titleZhTw) { showStatus("商品名稱為必填"); return; }

  const priceRaw = get("manual-price");
  const payload = {
    titleJa, titleZhTw,
    brand: get("manual-brand"),
    category: get("manual-category"),
    priceJpyTaxIn: priceRaw ? Number(priceRaw) : null,
    description: get("manual-description"),
    specs: {},
    sizeOptions: get("manual-sizes").split(",").map(s => s.trim()).filter(Boolean),
    colorOptions: get("manual-colors").split(",").map(s => s.trim()).filter(Boolean),
    images: manualImages.map(img => img.base64),
  };

  showStatus("上架中...");
  const btn = document.getElementById("manual-submit");
  if (btn) btn.disabled = true;

  try {
    const res = await apiFetch("/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) { location.href = "/admin-login.html"; return; }
    const data = await res.json();
    if (!data.ok) { showStatus(`上架失敗：${data.error}`); return; }
    showStatus(`上架成功！商品代碼：${data.code}`);
    manualImages = [];
    renderManualPreviews();
    updateManualCount();
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadCategories() {
  const res = await apiFetch("/api/admin/categories");
  if (!res.ok) return;
  const body = await res.json();
  const list = document.getElementById("category-list");
  if (!list) return;

  const categories = body.categories || [];
  if (categories.length === 0) {
    list.innerHTML = '<p class="meta">尚無分類</p>';
    return;
  }

  list.innerHTML = categories.map((cat) => `
    <div class="category-item">
      <span class="category-item__name">${cat.name}</span>
      <span class="category-item__count">${cat.total} 件</span>
      <div class="category-item__actions">
        <button class="button secondary js-cat-rename" data-name="${cat.name}">改名</button>
        <button class="button secondary js-cat-delete" data-name="${cat.name}">刪除</button>
      </div>
    </div>
  `).join("");

  const datalist = document.getElementById("category-datalist");
  if (datalist) {
    datalist.innerHTML = categories.map(c => `<option value="${c.name}">`).join("");
  }

  list.querySelectorAll(".js-cat-rename").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const oldName = btn.getAttribute("data-name");
      const newName = prompt(`將「${oldName}」重新命名為：`, oldName);
      if (!newName || newName.trim() === oldName) return;
      await apiFetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldName, newName: newName.trim() }),
      });
      await loadCategories();
    });
  });

  list.querySelectorAll(".js-cat-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.getAttribute("data-name");
      if (!confirm(`確定刪除分類「${name}」？該分類下的商品將歸為未分類。`)) return;
      await apiFetch(`/api/admin/categories?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      await loadCategories();
    });
  });
}

async function addCategory() {
  const input = document.getElementById("category-new-name");
  const name = input?.value?.trim();
  if (!name) return;
  await apiFetch("/api/admin/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  input.value = "";
  await loadCategories();
}

export function initProducts() {
  // Product management
  initManageSearch();
  initEditModal();
  loadManagedProducts();

  // Manual upload
  document.getElementById("manual-photo-input")?.addEventListener("change", onManualPhotos);
  document.getElementById("manual-submit")?.addEventListener("click", submitManualProduct);

  // Categories
  document.getElementById("category-add-btn")?.addEventListener("click", addCategory);
  loadCategories();
}
