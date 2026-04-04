import { showError } from "./app-admin.js";
import { withProductImageFallback, applyProductImageFallback } from "./image-fallback.js";
import { buildProductShareUrl } from "./store-url.js";

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

const _adminCC = window.__COUNTRY_CONFIG || {};

function formatPrice(price) {
  if (!price && price !== 0) return "-";
  const sym = _adminCC.currencySymbol || "¥";
  return `${sym}${Number(price).toLocaleString("en-US")}`;
}

function formatSellingPrice(basePrice, pricing) {
  if (!basePrice && basePrice !== 0) return "";
  const base = Number(basePrice);
  if (!Number.isFinite(base)) return "";
  const mode = pricing?.markupMode || "flat";
  const rate = Number(pricing?.jpyToTwd ?? 1);

  if (mode === "percent") {
    const pct = Number(pricing?.markupPercent ?? 15);
    const twd = Math.round(base * rate * (1 + pct / 100));
    return `NT$${twd.toLocaleString("en-US")}`;
  }

  const markup = Number(pricing?.markupJpy ?? 0);
  const src = Math.round(base + markup);
  const twd = Math.round(src * rate);
  return `NT$${twd.toLocaleString("en-US")}`;
}

let adminPricing = null;
async function loadAdminPricing() {
  if (adminPricing) return adminPricing;
  try {
    const res = await apiFetch("/api/pricing");
    if (res.ok) {
      const data = await res.json();
      adminPricing = data.pricing || {};
    }
  } catch {}
  return adminPricing || {};
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
        <p class="manage-card__price">${formatSellingPrice(p.priceJpyTaxIn, adminPricing)} <span style="font-size:11px;color:#999;font-weight:400;">(成本 ${formatPrice(p.priceJpyTaxIn)})</span></p>
        <p class="manage-card__meta">${p.brand || ""}</p>
        <div class="manage-card__actions">
          <button class="button js-product-edit" data-id="${p.id}" data-code="${p.code}" data-active="${p.isActive}" data-name-ja="${(p.nameJa || "").replace(/"/g, "&quot;")}" data-name-zh="${(p.nameZhTw || "").replace(/"/g, "&quot;")}" data-brand="${(p.brand || "").replace(/"/g, "&quot;")}" data-category="${(p.category || "").replace(/"/g, "&quot;")}" data-price="${p.priceJpyTaxIn ?? ""}" data-tags="${(p.tags || []).join(",")}">編輯</button>
          <button class="button secondary js-copy-url" data-code="${p.code}" title="複製商品網址">網址</button>
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
      const url = buildProductShareUrl(code, {
        plan: window.__STORE_PLAN,
        slug: window.__STORE_SLUG,
        mainDomain: window.__MAIN_DOMAIN,
        protocol: location.protocol,
        origin: location.origin,
        apiBase: window.__API_BASE || "",
      });
      navigator.clipboard.writeText(url).then(() => {
        const orig = btn.textContent;
        btn.textContent = "✓";
        setTimeout(() => { btn.textContent = orig; }, 1200);
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
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
        <button class="button secondary" ${page <= 1 ? "disabled" : ""} id="manage-prev">上一頁</button>
        <button class="button secondary" ${page >= totalPages ? "disabled" : ""} id="manage-next">下一頁</button>
      </div>
      <p class="meta" style="text-align:center;margin:6px 0 0;">${page} / ${totalPages}（${total} 件）</p>
    `;
    document.getElementById("manage-prev")?.addEventListener("click", () => { managePage--; loadManagedProducts(); });
    document.getElementById("manage-next")?.addEventListener("click", () => { managePage++; loadManagedProducts(); });
  }
}

export async function loadManagedProducts() {
  await loadAdminPricing();
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
  const maxImages = window.__MAX_IMAGES || 3;
  const all = [...editGallery];
  const totalCount = all.length + editNewImages.length;
  const countHtml = `<p class="meta" style="width:100%;margin:0;">圖片 ${totalCount} / ${maxImages}</p>`;
  if (all.length === 0 && editNewImages.length === 0) {
    container.innerHTML = countHtml;
    return;
  }
  let runningIdx = 0;
  container.innerHTML = all.map((url, idx) => {
    const locked = runningIdx >= maxImages;
    runningIdx++;
    return `
    <div class="edit-gallery__item${locked ? " edit-gallery__item--locked" : ""}">
      <img src="${prefixImageUrl(url)}" alt="圖片 ${idx + 1}" />
      ${locked ? '<div class="edit-gallery__lock">🔒</div>' : ""}
      <button class="edit-gallery__remove" data-idx="${idx}" data-type="existing" type="button">&times;</button>
    </div>`;
  }).join("") + editNewImages.map((img, idx) => {
    const locked = runningIdx >= maxImages;
    runningIdx++;
    return `
    <div class="edit-gallery__item${locked ? " edit-gallery__item--locked" : ""}" style="border-color:var(--brand)">
      <img src="${img.dataUrl}" alt="新圖 ${idx + 1}" />
      ${locked ? '<div class="edit-gallery__lock">🔒</div>' : ""}
      <button class="edit-gallery__remove" data-idx="${idx}" data-type="new" type="button">&times;</button>
    </div>`;
  }).join("") + countHtml +
    (totalCount > maxImages ? '<p class="meta" style="width:100%;margin:4px 0 0;color:var(--admin-warning,#D4960A);">升級方案享更多功能</p>' : "");

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

  // Populate tag checkboxes
  const tagStr = btn.getAttribute("data-tags") || "";
  const tagSet = new Set(tagStr.split(",").filter(Boolean));
  const hotCb = document.getElementById("edit-tag-hot");
  const limitedCb = document.getElementById("edit-tag-limited");
  const popularCb = document.getElementById("edit-tag-popular");
  if (hotCb) hotCb.checked = tagSet.has("hot");
  if (limitedCb) limitedCb.checked = tagSet.has("limited");
  if (popularCb) popularCb.checked = tagSet.has("popular");

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
  for (const file of files) {
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
  const tags = [];
  if (document.getElementById("edit-tag-hot")?.checked) tags.push("hot");
  if (document.getElementById("edit-tag-limited")?.checked) tags.push("limited");
  if (document.getElementById("edit-tag-popular")?.checked) tags.push("popular");

  const payload = {
    id,
    titleJa: document.getElementById("edit-title-ja")?.value?.trim() || "",
    titleZhTw: document.getElementById("edit-title-zh")?.value?.trim() || "",
    brand: document.getElementById("edit-brand")?.value?.trim() || "",
    category: document.getElementById("edit-category")?.value?.trim() || "",
    priceJpyTaxIn: document.getElementById("edit-price")?.value ? Number(document.getElementById("edit-price").value) : null,
    gallery: editGallery,
    newImages: editNewImages.map(img => img.base64),
    tags,
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


  // Categories
  document.getElementById("category-add-btn")?.addEventListener("click", addCategory);
  loadCategories();
}
