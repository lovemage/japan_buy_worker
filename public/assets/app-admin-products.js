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
let manageCategory = "";
let manageStatus = "";
let manageDebounce = null;
let selectedIds = new Set();

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

  if (pricing?.pricingMode === "manual") {
    const rate = Number(pricing?.jpyToTwd ?? 1);
    const twd = Math.round(base);
    const srcVal = (Number.isFinite(rate) && rate > 0) ? Math.round(base / rate) : null;
    const sym = _adminCC.currencySymbol || "¥";
    const srcPart = srcVal !== null ? ` <span style="font-size:11px;color:var(--admin-text-muted);font-weight:400;">(${sym}${srcVal.toLocaleString("en-US")})</span>` : "";
    return `NT$${twd.toLocaleString("en-US")}${srcPart}`;
  }

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

function updateEditPriceInfo() {
  const infoEl = document.getElementById("edit-price-info");
  if (!infoEl) return;
  const raw = document.getElementById("edit-price")?.value;
  if (!raw && raw !== "0") { infoEl.style.display = "none"; return; }
  const base = Number(raw);
  if (!Number.isFinite(base) || base < 0) { infoEl.style.display = "none"; return; }

  const p = adminPricing || {};
  const rate = Number(p.jpyToTwd ?? 1);
  const sym = _adminCC.currencySymbol || "¥";
  const currLabel = _adminCC.currencyLabel || "日圓";
  const lines = [];

  if (p.pricingMode === "manual") {
    // Manual: input is TWD, reverse-calc source currency
    const twd = Math.round(base);
    const srcVal = (Number.isFinite(rate) && rate > 0) ? Math.round(base / rate) : null;
    lines.push(`<b>來源幣值：</b>${srcVal !== null ? `${sym}${srcVal.toLocaleString("en-US")}（${currLabel}）` : "—"}`);
    lines.push(`<b>台幣價格：</b>NT$${twd.toLocaleString("en-US")}（匯率 ${rate}）`);
    lines.push(`<b>商店顯示價格：</b>NT$${twd.toLocaleString("en-US")}`);
  } else {
    // Auto: input is source currency, calc TWD with markup
    const mode = p.markupMode || "flat";
    let twd;
    if (mode === "percent") {
      const pct = Number(p.markupPercent ?? 15);
      twd = Math.round(base * rate * (1 + pct / 100));
    } else {
      const markup = Number(p.markupJpy ?? 0);
      twd = Math.round((base + markup) * rate);
    }
    lines.push(`<b>來源幣值：</b>${sym}${base.toLocaleString("en-US")}（${currLabel}）`);
    lines.push(`<b>台幣價格：</b>NT$${twd.toLocaleString("en-US")}（匯率 ${rate}）`);
    lines.push(`<b>商店顯示價格：</b>NT$${twd.toLocaleString("en-US")}`);
  }

  infoEl.innerHTML = lines.join("<br>");
  infoEl.style.display = "";
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

// Track product active status for bulk operations
let productActiveMap = {};

function renderProductGrid(products, paging) {
  const grid = document.getElementById("manage-product-grid");
  const pagingEl = document.getElementById("manage-paging");
  if (!grid) return;

  // Build active map
  productActiveMap = {};
  (products || []).forEach(p => { productActiveMap[p.id] = p.isActive; });

  if (!products || products.length === 0) {
    grid.innerHTML = '<div class="manage-empty"><p>沒有商品</p></div>';
    if (pagingEl) pagingEl.innerHTML = "";
    return;
  }

  grid.innerHTML = products.map((p) => {
    const imgSrc = withProductImageFallback(p.displayImageUrl || p.imageUrl || "");
    const name = p.nameZhTw || p.nameJa || "未命名";
    const inactive = p.isActive === 0;
    const noPrice = p.isActive === 1 && (p.priceJpyTaxIn === null || p.priceJpyTaxIn === undefined);
    const checked = selectedIds.has(p.id) ? "checked" : "";
    const badges = [];
    if (inactive) badges.push('<span class="manage-card__badge manage-card__badge--inactive">已下架</span>');
    if (noPrice) badges.push('<span class="manage-card__badge manage-card__badge--no-price">無價格</span>');
    return `
    <div class="manage-card${inactive ? " manage-card--inactive" : ""}">
      <label class="manage-card__check"><input type="checkbox" class="js-product-check" data-id="${p.id}" ${checked} /></label>
      ${badges.length ? `<div class="manage-card__badges">${badges.join("")}</div>` : ""}
      <img class="manage-card__img" src="${imgSrc}" alt="${name}" data-fallback="product" />
      <div class="manage-card__body">
        <p class="manage-card__title">${name}</p>
        <p class="manage-card__price">${formatSellingPrice(p.priceJpyTaxIn, adminPricing)}${adminPricing?.pricingMode !== "manual" ? ` <span style="font-size:11px;color:var(--admin-text-muted);font-weight:400;">(${formatPrice(p.priceJpyTaxIn)})</span>` : ""}</p>
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

  // Multi-select checkboxes
  grid.querySelectorAll(".js-product-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = Number(cb.getAttribute("data-id"));
      if (cb.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateSelectedCount();
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

function updateSelectedCount() {
  const el = document.getElementById("manage-selected-count");
  if (el) el.textContent = `已選 ${selectedIds.size} 件`;
  const bar = document.getElementById("manage-multi-bar");
  if (bar) bar.classList.toggle("is-visible", selectedIds.size > 0);
}

function setGridLoading(on) {
  const grid = document.getElementById("manage-product-grid");
  if (grid) grid.classList.toggle("is-loading", on);
}

export async function loadManagedProducts() {
  await loadAdminPricing();
  setGridLoading(true);
  const params = new URLSearchParams({ limit: "20", offset: String((managePage - 1) * 20), includeInactive: "1" });
  if (manageSearch) params.set("search", manageSearch);
  if (manageCategory) params.set("category", manageCategory);
  if (manageStatus === "active") params.delete("includeInactive");
  if (manageStatus === "inactive") { params.set("includeInactive", "1"); params.set("onlyInactive", "1"); }
  try {
    const res = await apiFetch(`/api/products?${params}`);
    if (!res.ok) { showError("載入商品失敗"); return; }
    const body = await res.json();
    renderProductGrid(body.products || [], body.paging || {});
  } finally {
    setGridLoading(false);
  }
}

// === Multi-select ===

function exitMultiSelect() {
  selectedIds.clear();
  updateSelectedCount();
  // Uncheck all visible checkboxes
  document.querySelectorAll(".js-product-check").forEach(cb => { cb.checked = false; });
}

function showBulkHint(msg) {
  const el = document.getElementById("manage-bulk-hint");
  if (el) { el.textContent = msg; setTimeout(() => { el.textContent = ""; }, 3000); }
}

async function bulkToggle(isActive) {
  if (selectedIds.size === 0) return;
  const ids = Array.from(selectedIds);
  if (isActive === 1) {
    if (ids.some(id => productActiveMap[id] === 1)) { showBulkHint("請檢查選擇商品"); return; }
  } else {
    if (ids.some(id => productActiveMap[id] === 0)) { showBulkHint("請檢查選擇商品"); return; }
  }
  setGridLoading(true);
  for (const id of ids) {
    await apiFetch("/api/admin/products/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
  }
  selectedIds.clear();
  updateSelectedCount();
  await loadManagedProducts();
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  const ids = Array.from(selectedIds);
  if (ids.some(id => productActiveMap[id] === 1)) {
    showBulkHint("請檢查選擇商品");
    return;
  }
  if (!confirm(`確定要永久刪除 ${ids.length} 件商品？此操作不可復原！`)) return;
  setGridLoading(true);
  for (const id of ids) {
    await apiFetch("/api/admin/products/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }
  selectedIds.clear();
  updateSelectedCount();
  await loadManagedProducts();
}

// === Category filter ===

async function loadCategoryFilter() {
  try {
    const res = await apiFetch("/api/admin/categories");
    if (!res.ok) return;
    const body = await res.json();
    const select = document.getElementById("manage-category-filter");
    if (!select) return;
    const cats = body.categories || [];
    select.innerHTML = '<option value="">全部分類</option>' +
      cats.map(c => `<option value="${c.name}">${c.name}（${c.total}）</option>`).join("");
  } catch {}
}

// === Edit Modal ===
let editGallery = [];
let editNewImages = [];

// Unified ordered list: { type: "existing", url } or { type: "new", img }
let editOrderedItems = [];

function rebuildEditOrdered() {
  editOrderedItems = [
    ...editGallery.map(url => ({ type: "existing", url })),
    ...editNewImages.map(img => ({ type: "new", img })),
  ];
}

function syncFromOrdered() {
  editGallery = editOrderedItems.filter(i => i.type === "existing").map(i => i.url);
  editNewImages = editOrderedItems.filter(i => i.type === "new").map(i => i.img);
}

function renderEditGallery() {
  const container = document.getElementById("edit-gallery");
  if (!container) return;
  const maxImages = window.__MAX_IMAGES || 3;
  const items = editOrderedItems;
  const totalCount = items.length;
  const countHtml = `<p class="meta" style="width:100%;margin:0;">圖片 ${totalCount} / ${maxImages}</p>`;
  if (totalCount === 0) {
    container.innerHTML = countHtml;
    return;
  }
  const svgLeft = '<svg viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  const svgRight = '<svg viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  const svgTrash = '<svg viewBox="0 0 24 24" fill="none" stroke="#c44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  container.innerHTML = items.map((item, pos) => {
    const locked = pos >= maxImages;
    const isNew = item.type === "new";
    const src = isNew ? item.img.dataUrl : prefixImageUrl(item.url);
    return `
    <div class="edit-gallery__item${locked ? " edit-gallery__item--locked" : ""}">
      <div class="edit-gallery__thumb"${isNew ? ' style="border-color:var(--brand)"' : ""} data-src="${src}">
        <img src="${src}" alt="圖片 ${pos + 1}" />
        ${locked ? '<div class="edit-gallery__lock">&#128274;</div>' : ""}
      </div>
      <div class="edit-gallery__actions">
        ${pos > 0 ? `<button class="edit-gallery__move" data-pos="${pos}" data-dir="-1" type="button" title="左移">${svgLeft}</button>` : ""}
        <button class="edit-gallery__remove" data-pos="${pos}" type="button" title="刪除">${svgTrash}</button>
        ${pos < totalCount - 1 ? `<button class="edit-gallery__move" data-pos="${pos}" data-dir="1" type="button" title="右移">${svgRight}</button>` : ""}
      </div>
    </div>`;
  }).join("") + countHtml +
    (totalCount > maxImages ? '<p class="meta" style="width:100%;margin:4px 0 0;color:var(--admin-warning,#D4960A);">升級方案享更多功能</p>' : "");

  // Click to enlarge
  container.querySelectorAll(".edit-gallery__thumb").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const src = thumb.getAttribute("data-src");
      if (!src) return;
      const lb = document.createElement("div");
      lb.className = "edit-lightbox";
      lb.innerHTML = '<img src="' + src + '" />';
      lb.addEventListener("click", () => lb.remove());
      document.body.appendChild(lb);
    });
  });

  container.querySelectorAll(".edit-gallery__remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pos = Number(btn.getAttribute("data-pos"));
      const item = editOrderedItems[pos];
      if (!item) return;
      if (item.type === "new") {
        editOrderedItems.splice(pos, 1);
        syncFromOrdered();
        renderEditGallery();
      } else {
        const id = Number(document.getElementById("edit-id")?.value);
        if (!item.url || !id) return;
        btn.disabled = true;
        const res = await apiFetch("/api/admin/products/image-delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, imageUrl: item.url }),
        });
        if (res.ok) {
          const data = await res.json();
          editOrderedItems.splice(pos, 1);
          editGallery = data.gallery || [];
          syncFromOrdered();
          renderEditGallery();
        } else {
          showError("刪除圖片失敗");
        }
      }
    });
  });
  container.querySelectorAll(".edit-gallery__move").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pos = Number(btn.getAttribute("data-pos"));
      const dir = Number(btn.getAttribute("data-dir"));
      const target = pos + dir;
      if (target < 0 || target >= editOrderedItems.length) return;
      [editOrderedItems[pos], editOrderedItems[target]] = [editOrderedItems[target], editOrderedItems[pos]];
      syncFromOrdered();
      renderEditGallery();
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
  const priceLabel = document.getElementById("edit-price-label");
  if (priceLabel) {
    priceLabel.innerHTML = adminPricing?.pricingMode === "manual"
      ? "售價（TWD）"
      : `價格（<span class="src-currency">${(_adminCC.currencyCode || "JPY")}</span>）`;
  }
  updateEditPriceInfo();
  const priceInput = document.getElementById("edit-price");
  if (priceInput) {
    priceInput.oninput = updateEditPriceInfo;
  }
  document.getElementById("edit-status").textContent = "";

  // Set button visibility based on active state
  const isActive = btn.getAttribute("data-active") !== "0";
  const deactivateBtn = document.getElementById("edit-deactivate");
  const activateBtn = document.getElementById("edit-activate");
  const deleteBtn = document.getElementById("edit-delete");

  if (isActive) {
    // Active product: show deactivate, hide activate + delete
    if (deactivateBtn) { deactivateBtn.style.display = ""; deactivateBtn.disabled = false; }
    if (activateBtn) activateBtn.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
  } else {
    // Inactive product: show activate + delete, hide deactivate
    if (deactivateBtn) deactivateBtn.style.display = "none";
    if (activateBtn) { activateBtn.style.display = ""; activateBtn.disabled = false; }
    if (deleteBtn) { deleteBtn.style.display = ""; deleteBtn.disabled = false; }
  }

  // Wire up deactivate
  if (deactivateBtn) {
    deactivateBtn.onclick = async function() {
      deactivateBtn.disabled = true;
      setGridLoading(true);
      const res = await apiFetch("/api/admin/products/toggle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: Number(id), isActive: 0 }),
      });
      if (res.ok) {
        modal.classList.add("hidden");
        await loadManagedProducts();
      } else {
        setGridLoading(false);
        deactivateBtn.disabled = false;
        const data = await res.json().catch(() => ({}));
        showError(data.error || "下架失敗");
      }
    };
  }

  // Wire up activate
  if (activateBtn) {
    activateBtn.onclick = async function() {
      activateBtn.disabled = true;
      setGridLoading(true);
      const res = await apiFetch("/api/admin/products/toggle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: Number(id), isActive: 1 }),
      });
      if (res.ok) {
        modal.classList.add("hidden");
        await loadManagedProducts();
      } else {
        setGridLoading(false);
        activateBtn.disabled = false;
        const data = await res.json().catch(() => ({}));
        showError(data.error || "上架失敗");
      }
    };
  }

  // Wire up delete
  if (deleteBtn) {
    deleteBtn.onclick = async function() {
      if (!confirm("確定要永久刪除此商品？此操作不可復原！")) return;
      deleteBtn.disabled = true;
      setGridLoading(true);
      const res = await apiFetch("/api/admin/products/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: Number(id) }),
      });
      if (res.ok) {
        modal.classList.add("hidden");
        await loadManagedProducts();
      } else {
        setGridLoading(false);
        deleteBtn.disabled = false;
        const data = await res.json().catch(() => ({}));
        showError(data.error || "刪除失敗");
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
  editOrderedItems = [];

  modal.classList.remove("hidden");

  // Fetch product detail to get gallery and description
  document.getElementById("edit-description").value = "";
  if (code) {
    const res = await apiFetch(`/api/product?code=${encodeURIComponent(code)}`);
    if (res.ok) {
      const data = await res.json();
      editGallery = Array.isArray(data.product?.gallery) ? data.product.gallery : [];
      const descEl = document.getElementById("edit-description");
      if (descEl && data.product?.description) descEl.value = data.product.description;
    }
  }
  rebuildEditOrdered();
  renderEditGallery();
}

async function onEditPhotos(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    try {
      const img = await compressImageToWebp(file);
      editOrderedItems.push({ type: "new", img });
    } catch { /* skip */ }
  }
  syncFromOrdered();
  renderEditGallery();
  event.target.value = "";
}

function closeEditModal() {
  const modal = document.getElementById("edit-modal");
  if (modal) modal.classList.add("hidden");
  editNewImages = [];
  editGallery = [];
  editOrderedItems = [];
  hideEditCategoryDropdown();
}

function hideEditCategoryDropdown() {
  var dd = document.getElementById("edit-category-dropdown");
  if (dd) dd.classList.add("hidden");
}

async function showEditCategoryDropdown() {
  var dd = document.getElementById("edit-category-dropdown");
  if (!dd) return;
  var inner = dd.querySelector("div");
  if (!inner) return;
  inner.innerHTML = '<div style="padding:10px;font-size:12px;color:#999;">載入中...</div>';
  dd.classList.remove("hidden");

  try {
    var res = await apiFetch("/api/admin/categories");
    if (!res.ok) { hideEditCategoryDropdown(); return; }
    var body = await res.json();
    var cats = (body.categories || []).map(function(c) { return c.name; });
    if (cats.length === 0) {
      inner.innerHTML = '<div style="padding:10px;font-size:12px;color:#999;">尚無分類</div>';
      return;
    }
    inner.innerHTML = cats.map(function(name) {
      return '<div class="edit-cat-option" style="padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f0f0f0;transition:background 0.1s;" onmouseover="this.style.background=\'#f5f5f5\'" onmouseout="this.style.background=\'#fff\'">' + name + '</div>';
    }).join("");
    inner.querySelectorAll(".edit-cat-option").forEach(function(el) {
      el.addEventListener("click", function() {
        document.getElementById("edit-category").value = el.textContent;
        hideEditCategoryDropdown();
      });
    });
  } catch {
    hideEditCategoryDropdown();
  }
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
    description: document.getElementById("edit-description")?.value?.trim() || "",
    gallery: editOrderedItems.filter(i => i.type === "existing").map(i => i.url),
    newImages: editOrderedItems.filter(i => i.type === "new").map(i => i.img.base64),
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

async function doEditAiImage() {
  // Determine the first image source: existing gallery URL or new image base64
  let imageBase64 = null;

  if (editGallery.length > 0) {
    // Fetch the first existing image from gallery URL and convert to base64
    const popup = document.getElementById("ai-image-edit-popup");
    const popupMsg = document.getElementById("ai-image-edit-popup-msg");
    if (popup) popup.style.display = "flex";
    if (popupMsg) popupMsg.textContent = "";

    const btn = document.getElementById("btn-edit-ai-image");
    if (btn) btn.disabled = true;

    try {
      const imgRes = await apiFetch(editGallery[0]);
      if (!imgRes.ok) throw new Error("圖片下載失敗");
      const blob = await imgRes.blob();
      const bmpUrl = URL.createObjectURL(blob);
      imageBase64 = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(bmpUrl);
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext("2d").drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/webp", 0.8).split(",")[1]);
        };
        img.onerror = () => { URL.revokeObjectURL(bmpUrl); reject(new Error("圖片載入失敗")); };
        img.src = bmpUrl;
      });
    } catch (err) {
      if (popupMsg) popupMsg.textContent = String(err);
      setTimeout(() => { if (popup) popup.style.display = "none"; }, 2000);
      setTimeout(() => { if (btn) btn.disabled = false; }, 30000);
      return;
    }
  } else if (editNewImages.length > 0) {
    imageBase64 = editNewImages[0].base64;
  } else {
    alert("請先新增至少一張商品圖片");
    return;
  }

  // Show popup if not already shown (for editNewImages path)
  const popup = document.getElementById("ai-image-edit-popup");
  const popupMsg = document.getElementById("ai-image-edit-popup-msg");
  if (popup) popup.style.display = "flex";
  if (popupMsg) popupMsg.textContent = "";

  const btn = document.getElementById("btn-edit-ai-image");
  if (btn) btn.disabled = true;

  try {
    const res = await apiFetch("/api/admin/ai-image-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64 }),
    });

    const data = await res.json();
    if (!data.ok) {
      if (popupMsg) popupMsg.textContent = data.error || "失敗";
      setTimeout(() => { if (popup) popup.style.display = "none"; }, 2500);
      return;
    }

    // Fetch the AI image and convert to webp
    const aiRes = await apiFetch(data.imageUrl);
    if (!aiRes.ok) throw new Error("AI 圖片下載失敗");
    const aiBlob = await aiRes.blob();
    const bmpUrl = URL.createObjectURL(aiBlob);
    const newDataUrl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(bmpUrl);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/webp", 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(bmpUrl); reject(new Error("圖片載入失敗")); };
      img.src = bmpUrl;
    });

    // Insert AI image as first, keep all originals
    const newImg = { dataUrl: newDataUrl, base64: newDataUrl.split(",")[1] };
    editOrderedItems.unshift({ type: "new", img: newImg });
    syncFromOrdered();
    renderEditGallery();

    if (popup) popup.style.display = "none";
  } catch (err) {
    if (popupMsg) popupMsg.textContent = String(err);
    setTimeout(() => { if (popup) popup.style.display = "none"; }, 2500);
  } finally {
    if (btn) {
      setTimeout(() => { btn.disabled = false; }, 30000);
    }
  }
}

function initEditModal() {
  document.getElementById("edit-cancel")?.addEventListener("click", closeEditModal);
  document.getElementById("edit-save")?.addEventListener("click", saveEdit);
  document.getElementById("edit-photo-input")?.addEventListener("change", onEditPhotos);
  document.getElementById("btn-edit-ai-image")?.addEventListener("click", function() {
    if (!confirm("AI 圖片優化僅會處理第一張圖片，優化後的圖片會自動插入為首張。\n\n確定要進行 AI 圖片優化嗎？")) return;
    doEditAiImage();
  });
  document.querySelector(".edit-modal__backdrop")?.addEventListener("click", closeEditModal);
  const pricingHelpLink = document.getElementById("edit-pricing-help-link");
  const pricingHelpPopup = document.getElementById("edit-pricing-help-popup");
  if (pricingHelpLink && pricingHelpPopup) {
    pricingHelpLink.addEventListener("click", (e) => { e.preventDefault(); pricingHelpPopup.style.display = "flex"; });
    document.getElementById("edit-pricing-help-close")?.addEventListener("click", () => { pricingHelpPopup.style.display = "none"; });
    document.getElementById("edit-pricing-help-backdrop")?.addEventListener("click", () => { pricingHelpPopup.style.display = "none"; });
  }
  document.getElementById("edit-category-pick")?.addEventListener("click", function(e) {
    e.stopPropagation();
    var dd = document.getElementById("edit-category-dropdown");
    if (dd && !dd.classList.contains("hidden")) { hideEditCategoryDropdown(); return; }
    showEditCategoryDropdown();
  });
  document.addEventListener("click", function(e) {
    var dd = document.getElementById("edit-category-dropdown");
    if (dd && !dd.classList.contains("hidden") && !dd.contains(e.target) && e.target.id !== "edit-category-pick") {
      hideEditCategoryDropdown();
    }
  });
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

function initStatusFilter() {
  const select = document.getElementById("manage-status-filter");
  if (!select) return;
  select.addEventListener("change", () => {
    manageStatus = select.value;
    managePage = 1;
    loadManagedProducts();
  });
}

function initCategoryFilter() {
  const select = document.getElementById("manage-category-filter");
  if (!select) return;
  select.addEventListener("change", () => {
    manageCategory = select.value;
    managePage = 1;
    loadManagedProducts();
  });
  loadCategoryFilter();
}

function initMultiSelect() {
  document.getElementById("manage-multi-cancel")?.addEventListener("click", exitMultiSelect);
  document.getElementById("manage-bulk-activate")?.addEventListener("click", () => bulkToggle(1));
  document.getElementById("manage-bulk-deactivate")?.addEventListener("click", () => bulkToggle(0));
  document.getElementById("manage-bulk-delete")?.addEventListener("click", bulkDelete);
}

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
  const max = window.__MAX_IMAGES || 3;
  if (el) el.textContent = `已選 ${manualImages.length} / ${max} 張`;
}

async function onManualPhotos(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
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
    loadManagedProducts();
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
      await loadCategoryFilter();
    });
  });

  list.querySelectorAll(".js-cat-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.getAttribute("data-name");
      if (!confirm(`確定刪除分類「${name}」？該分類下的商品將歸為未分類。`)) return;
      await apiFetch(`/api/admin/categories?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      await loadCategories();
      await loadCategoryFilter();
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
  await loadCategoryFilter();
}

export function initProducts() {
  // Product management
  initManageSearch();
  initStatusFilter();
  initCategoryFilter();
  initMultiSelect();
  initEditModal();
  loadManagedProducts();

  // Manual upload
  document.getElementById("manual-photo-input")?.addEventListener("change", onManualPhotos);
  document.getElementById("manual-submit")?.addEventListener("click", submitManualProduct);

  // Categories
  document.getElementById("category-add-btn")?.addEventListener("click", addCategory);
  loadCategories();
}
