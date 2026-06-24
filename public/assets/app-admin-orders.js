import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";
import { calculateAdminFormTotals } from "./admin-totals.js";
import { showError, hideError } from "./app-admin.js";
import { handleUnauthorized } from "./session-guard.js";

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("en-US");
}

function shippingMethodText(method) {
  if (method === "jp_direct") return "日本直送（需完成EZWAY）";
  if (method === "limited_proxy") return "限時連線代購（固定運費）";
  if (method === "shipping_hidden") return "運費選項隱藏（由客服後續確認）";
  return "集運回台灣（國際+國內）";
}

const STATUS_OPTIONS = [
  { value: "pending", label: "待處理" },
  { value: "paid", label: "已付款" },
  { value: "preparing", label: "待出貨" },
  { value: "ordered", label: "已下單" },
  { value: "shipped", label: "已出貨" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "取消訂單" },
];

const FILTER_TABS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待處理" },
  { value: "paid", label: "已付款" },
  { value: "preparing", label: "待出貨" },
  { value: "shipped", label: "已出貨" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

const ITEM_STATUS_OPTIONS = [
  { value: "pending", label: "待處理" },
  { value: "processed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

let allForms = [];
let activeFilter = "pending";
let searchQuery = "";

function isWholesaleEnabled() {
  if (typeof window === "undefined") return false;
  if (window.__WHOLESALE_ENABLED) return true;
  return !!(window.__DISPLAY_SETTINGS && window.__DISPLAY_SETTINGS.wholesalePriceEnabled);
}

function isPaymentEnabled() {
  if (typeof window === "undefined") return false;
  var plan = (window.__STORE_PLAN || "free").toLowerCase();
  return plan === "pro" || plan === "proplus";
}

function matchesSearch(form, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const fields = [
    form.customerName,
    form.memberPhone,
    form.lineId,
    form.orderCode,
    form.id,
  ];
  return fields.some((v) => String(v ?? "").toLowerCase().includes(q));
}

function getSearchFiltered() {
  return allForms.filter((f) => matchesSearch(f, searchQuery));
}

function statusSelectHtml(formId, current) {
  const value = String(current || "");
  const hasSelectedValue = STATUS_OPTIONS.some((o) => o.value === value);
  const placeholder = `<option value="" disabled${hasSelectedValue ? "" : " selected"}>訂單狀態</option>`;
  const options = STATUS_OPTIONS.map(
    (o) => `<option value="${o.value}"${o.value === value ? " selected" : ""}>${o.label}</option>`
  ).join("");
  return `<label class="admin-form-status-label"><select class="js-status-select" data-form-id="${formId}">${placeholder}${options}</select></label>`;
}

function itemStatusSelectHtml(itemId, current) {
  const value = String(current || "");
  const hasSelectedValue = ITEM_STATUS_OPTIONS.some((o) => o.value === value);
  const placeholder = `<option value="" disabled${hasSelectedValue ? "" : " selected"}>商品狀態</option>`;
  const options = ITEM_STATUS_OPTIONS.map(
    (o) => `<option value="${o.value}"${o.value === value ? " selected" : ""}>${o.label}</option>`
  ).join("");
  return `<label class="admin-item-status"><select class="js-item-status-select" data-item-id="${itemId}">${placeholder}${options}</select></label>`;
}

function paymentBadgeHtml(status) {
  const value = String(status || "");
  if (!value) return "";
  const labelMap = {
    paid: "已付款",
    pending: "待付款",
    failed: "付款未完成",
    expired: "付款逾期",
    cancelled: "付款取消",
  };
  const label = labelMap[value];
  if (!label) return "";
  return `<span class="payment-status-badge payment-status-badge--${value}">${label}</span>`;
}

function adjustedValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function productDetailUrl(code) {
  const value = String(code || "").trim();
  if (!value) return "";
  return `${window.__API_BASE || ""}/product?code=${encodeURIComponent(value)}`;
}

function renderFilterTabs() {
  const tabsEl = document.getElementById("order-filter-tabs");
  if (!tabsEl) return;
  const searchFiltered = getSearchFiltered();
  const counts = {};
  let total = searchFiltered.length;
  for (const f of searchFiltered) {
    counts[f.status] = (counts[f.status] || 0) + 1;
  }
  tabsEl.innerHTML = FILTER_TABS.map((t) => {
    const count = t.value === "all" ? total : (counts[t.value] || 0);
    const active = t.value === activeFilter ? " is-active" : "";
    return `<button class="order-filter-tab${active}" data-filter="${t.value}">${t.label}<span class="order-filter-count">${count}</span></button>`;
  }).join("");
  tabsEl.querySelectorAll(".order-filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.getAttribute("data-filter");
      renderFilterTabs();
      renderForms(allForms);
    });
  });
}

function renderForms(forms) {
  const wrapper = document.getElementById("admin-forms");
  if (!wrapper) return;

  const searchFiltered = forms.filter((f) => matchesSearch(f, searchQuery));
  const filtered = activeFilter === "all" ? searchFiltered : searchFiltered.filter((f) => f.status === activeFilter);

  if (!Array.isArray(filtered) || filtered.length === 0) {
    const filterLabel = activeFilter === "all" ? "" : FILTER_TABS.find((t) => t.value === activeFilter)?.label || "";
    const trimmedQuery = String(searchQuery || "").trim();
    const message = trimmedQuery
      ? `沒有符合「${trimmedQuery}」的${filterLabel}訂單。`
      : `目前沒有${filterLabel}訂單。`;
    wrapper.innerHTML = `<p class="notice notice--info">${message}</p>`;
    return;
  }

  wrapper.innerHTML = filtered.map((form) => {
    const totals = calculateAdminFormTotals(form);
    const noteText = String(form.notes || "").trim();
    const itemsHtml = Array.isArray(form.items)
      ? form.items.map((item) => {
          const imageUrl = withProductImageFallback(item.selectedImageUrl || item.imageUrl || "");
          const variantText = item.variantName || item.desiredSize || item.desiredColor || "";
          return `<li class="admin-item-row">
            <img class="admin-item-image" src="${imageUrl}" alt="${item.productNameSnapshot}" data-fallback="product" />
            <div class="admin-item-info">
              <div class="admin-item-head">
                <p><strong>${item.productNameSnapshot}</strong>（${item.code || "無代碼"}）x ${item.quantity}</p>
              </div>
              <p class="meta">規格：${variantText || "未選"}</p>
              <p class="meta">小計 &yen;${formatCurrency(item.subtotalJpy)} / NT$${formatCurrency(item.subtotalTwd)}</p>
              ${item.note ? `<p class="meta">備註：${item.note}</p>` : ""}
              <div class="admin-item-meta-actions">
                ${item.productUrl ? `<a href="${item.productUrl}" target="_blank" rel="noopener noreferrer" class="meta">原商品頁</a>` : "<span></span>"}
                ${itemStatusSelectHtml(item.id, item.itemStatus)}
              </div>
            </div>
          </li>`;
        }).join("")
      : "";
    const displayCode = form.orderCode || String(form.id);
    return `
    <article class="admin-form-card" data-status="${form.status}">
      <div class="admin-form-header">
        <h2 class="product-card__title">訂單 #${displayCode} ${paymentBadgeHtml(form.paymentStatus)}</h2>
        <div class="admin-form-status">${statusSelectHtml(form.id, form.status)}</div>
      </div>
      <p class="meta">建立時間：${new Date(form.createdAt).toLocaleString("zh-TW")}</p>
      <p class="meta">客戶：${form.customerName}｜電話：${form.memberPhone || "無"}</p>
      <p class="meta">Line ID：${form.lineId || "無"}</p>
      <p class="meta">收件：${form.recipientCity || ""} ${form.recipientAddress || ""}</p>
      <p class="meta">配送：${shippingMethodText(form.shippingMethod)}</p>
      <p class="meta">商品合計：&yen;${formatCurrency(totals.itemsTotalJpy)} / NT$${formatCurrency(totals.itemsTotalTwd)}；總金額：NT$${formatCurrency(totals.grandTotalTwd)} ${totals.amountAdjusted ? '<span class="order-adjusted-badge">已調整金額</span>' : ""}</p>
      <div class="admin-adjust-box">
        <input class="input-cute js-adjusted-items-total" type="number" min="0" step="1" value="${adjustedValue(form.adjustedItemsTotalTwd)}" placeholder="調整訂單金額" aria-label="調整訂單金額" data-form-id="${form.id}" />
        <button class="button secondary js-save-adjustment" type="button" data-form-id="${form.id}">儲存金額</button>
      </div>
      ${noteText ? `<p class="meta">整單備註：${noteText}</p>` : ""}
      ${isWholesaleEnabled() ? `<button class="button secondary js-apply-wholesale" type="button" data-form-id="${form.id}">套用批發價</button>` : ""}
      ${isPaymentEnabled() ? `<button class="button secondary js-make-paylink" type="button" data-form-id="${Number(form.id) || 0}" data-amount="${Number(totals.grandTotalTwd) || 0}">產生收款連結</button>` : ""}
      ${form.status === "cancelled" ? `<button class="button secondary js-delete-form" type="button" data-form-id="${form.id}">刪除此訂單</button>` : ""}
      <ul class="admin-form-items">${itemsHtml}</ul>
    </article>`;
  }).join("");

  applyProductImageFallback(wrapper);

  wrapper.querySelectorAll(".js-status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const formId = Number(select.getAttribute("data-form-id"));
      hideError();
      const res = await apiFetch("/api/admin/requirements", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: formId, status: select.value }),
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) { showError(`狀態更新失敗：${res.status}`); return; }
      const target = allForms.find((f) => f.id === formId);
      if (target) target.status = select.value;
      renderFilterTabs();
      renderForms(allForms);
    });
  });

  wrapper.querySelectorAll(".js-item-status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const itemId = Number(select.getAttribute("data-item-id"));
      hideError();
      const res = await apiFetch("/api/admin/requirements", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, itemStatus: select.value }),
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) { showError(`商品狀態更新失敗：${res.status}`); return; }
      for (const form of allForms) {
        const target = Array.isArray(form.items) ? form.items.find((item) => item.id === itemId) : null;
        if (target) {
          target.itemStatus = select.value;
          break;
        }
      }
    });
  });

  wrapper.querySelectorAll(".js-save-adjustment").forEach((button) => {
    button.addEventListener("click", async () => {
      const formId = Number(button.getAttribute("data-form-id"));
      const card = button.closest(".admin-form-card");
      const target = allForms.find((f) => f.id === formId);
      if (!target || !card) return;
      const itemsInput = card.querySelector(".js-adjusted-items-total");
      hideError();
      const res = await apiFetch("/api/admin/requirements", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: formId,
          status: target.status,
          adjustedItemsTotalTwd: itemsInput?.value || null,
          adjustedShippingTotalTwd: null,
        }),
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) { showError(`金額更新失敗：${res.status}`); return; }
      const body = await res.json();
      target.adjustedItemsTotalTwd = body.adjustedItemsTotalTwd;
      target.adjustedShippingTotalTwd = body.adjustedShippingTotalTwd;
      renderForms(allForms);
    });
  });

  wrapper.querySelectorAll(".js-apply-wholesale").forEach((button) => {
    button.addEventListener("click", async () => {
      const formId = Number(button.getAttribute("data-form-id"));
      if (!Number.isInteger(formId) || formId <= 0) return;
      if (!confirm("確定將此訂單金額改為批發價？將以商品批發價重新計算訂單總金額。")) return;
      hideError();
      button.disabled = true;
      const res = await apiFetch("/api/admin/requirements", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: formId, applyWholesale: true }),
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data?.error || `套用批發價失敗：${res.status}`);
        button.disabled = false;
        return;
      }
      const body = await res.json();
      const target = allForms.find((f) => f.id === formId);
      if (target) target.adjustedItemsTotalTwd = body.adjustedItemsTotalTwd;
      renderForms(allForms);
    });
  });

  wrapper.querySelectorAll(".js-delete-form").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-form-id") || "");
      if (!Number.isInteger(id) || id <= 0) return;
      if (!confirm(`確定刪除訂單 #${id}？此操作無法復原。`)) return;
      hideError();
      const res = await apiFetch(`/api/admin/requirements?id=${id}`, { method: "DELETE" });
      if (handleUnauthorized(res)) return;
      if (!res.ok) { showError(`刪除失敗：${res.status}`); return; }
      await loadForms();
    });
  });

  wrapper.querySelectorAll(".js-make-paylink").forEach((button) => {
    button.addEventListener("click", async () => {
      const formId = Number(button.getAttribute("data-form-id") || "");
      const defaultAmount = Number(button.getAttribute("data-amount") || "0");
      if (!Number.isInteger(formId) || formId <= 0) return;

      const defaultTitle = `訂單 #${formId} 收款`;
      const inputTitle = prompt("收款說明（帳單名稱）", defaultTitle);
      if (inputTitle === null) return; // 使用者取消

      const inputAmount = prompt("收款金額（NT$，後端為準）", String(defaultAmount));
      if (inputAmount === null) return;
      const amount = parseInt(inputAmount, 10);
      if (!Number.isInteger(amount) || amount < 1 || amount > 9999999) {
        alert("金額必須為 1 到 9,999,999 之間的整數");
        return;
      }

      hideError();
      button.disabled = true;
      try {
        const res = await apiFetch("/api/store-pay/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: inputTitle.trim() || defaultTitle,
            amount,
            expiresInHours: 168, // 7 天
            requirementFormId: formId,
          }),
        });
        if (handleUnauthorized(res)) return;
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showError(data.error || `產生收款連結失敗：${res.status}`);
          return;
        }
        // 顯示 payUrl 並提供複製，不 console.log
        const payUrl = data.payUrl || "";
        const copied = await navigator.clipboard.writeText(payUrl).then(() => true, () => false);
        const msgEl = document.createElement("p");
        msgEl.className = "meta";
        msgEl.style.cssText = "word-break:break-all;margin-top:6px;color:var(--admin-text-muted);";
        msgEl.textContent = payUrl;
        const card = button.closest(".admin-form-card");
        if (card) {
          const old = card.querySelector(".js-paylink-result");
          if (old) old.remove();
          msgEl.classList.add("js-paylink-result");
          button.insertAdjacentElement("afterend", msgEl);
        }
        alert(copied ? "收款連結已複製到剪貼簿！" : "收款連結：" + payUrl);
      } catch (e) {
        showError("產生收款連結失敗，請稍後重試");
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function loadForms() {
  hideError();
  const res = await apiFetch("/api/admin/requirements");
  if (handleUnauthorized(res)) return;
  if (!res.ok) { showError(`讀取失敗：${res.status}`); return; }
  const body = await res.json();
  allForms = body.forms || [];
  renderFilterTabs();
  renderForms(allForms);
}

const STATS_STORAGE_KEY = "vovosnap_order_stats";

const STATS_STATUS_OPTIONS = [
  { value: "all", label: "全部訂單" },
  { value: "pending", label: "待處理" },
  { value: "paid", label: "已付款" },
  { value: "preparing", label: "待出貨" },
  { value: "ordered", label: "已下單" },
  { value: "shipped", label: "已出貨" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

function computeStats(statusFilter) {
  const forms = statusFilter === "all" ? allForms : allForms.filter((f) => f.status === statusFilter);
  const counts = new Map();
  for (const form of forms) {
    if (!Array.isArray(form.items)) continue;
    for (const item of form.items) {
      const name = item.productNameSnapshot || "未知商品";
      const qty = Number(item.quantity) || 1;
      const current = counts.get(name) || { name, qty: 0, imageUrl: "", code: "" };
      current.qty += qty;
      if (!current.imageUrl) current.imageUrl = item.selectedImageUrl || item.imageUrl || "";
      if (!current.code) current.code = item.code || "";
      counts.set(name, current);
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.qty - a.qty);
}

function formatStatsText(stats) {
  return stats.map((entry) => {
    const item = normalizeStatsEntry(entry);
    return `${item.name} x ${item.qty}`;
  }).join("\n");
}

function normalizeStatsEntry(entry) {
  if (Array.isArray(entry)) {
    return { name: entry[0] || "未知商品", qty: Number(entry[1] || 0), imageUrl: "", code: "" };
  }
  return {
    name: entry?.name || "未知商品",
    qty: Number(entry?.qty || 0),
    imageUrl: entry?.imageUrl || "",
    code: entry?.code || "",
  };
}

function renderStatsPanel() {
  const wrapper = document.getElementById("stats-content");
  if (!wrapper) return;

  let cached = null;
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch {}

  const statusOpts = STATS_STATUS_OPTIONS.map((o) => {
    return `<option value="${o.value}"${o.value === "all" ? " selected" : ""}>${o.label}</option>`;
  }).join("");

  const statsHtml = cached ? buildStatsHtml(cached.data) : `<p class="meta">尚未統計，請點擊按鈕開始統計。</p>`;

  wrapper.innerHTML = `
    <div class="stats-helper">
      <select id="stats-status-filter" class="stats-select">${statusOpts}</select>
      <div class="stats-actions">
        <button class="button primary" id="btn-run-stats">統計</button>
        <button class="button secondary" id="btn-copy-stats" ${cached ? "" : "disabled"}>複製</button>
      </div>
      <div id="stats-result">${statsHtml}</div>
    </div>
  `;
  applyProductImageFallback(wrapper);

  document.getElementById("btn-run-stats").addEventListener("click", () => {
    const filter = document.getElementById("stats-status-filter").value;
    const stats = computeStats(filter);
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify({ filter, data: stats }));
    document.getElementById("stats-result").innerHTML = buildStatsHtml(stats);
    applyProductImageFallback(document.getElementById("stats-result"));
    const copyBtn = document.getElementById("btn-copy-stats");
    if (copyBtn) copyBtn.disabled = false;
  });

  document.getElementById("btn-copy-stats").addEventListener("click", () => {
    let cached;
    try { cached = JSON.parse(localStorage.getItem(STATS_STORAGE_KEY)); } catch { return; }
    if (!cached || !cached.data) return;
    const text = formatStatsText(cached.data);
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById("btn-copy-stats");
      const orig = btn.textContent;
      btn.textContent = "已複製！";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });
}

function buildStatsHtml(stats) {
  if (!stats || stats.length === 0) return `<p class="meta">沒有任何商品資料。</p>`;
  const entries = stats.map(normalizeStatsEntry);
  const totalItems = entries.reduce((sum, item) => sum + item.qty, 0);
  const rows = entries.map((item, i) => {
    const imageUrl = withProductImageFallback(item.imageUrl);
    const detailUrl = productDetailUrl(item.code);
    const imageHtml = `<img class="stats-thumb" src="${imageUrl}" alt="${item.name}" data-fallback="product" />`;
    const nameHtml = detailUrl
      ? `<a class="stats-product-link" href="${detailUrl}">${imageHtml}<span>${item.name}</span></a>`
      : `<span class="stats-product-link">${imageHtml}<span>${item.name}</span></span>`;
    return `<tr><td class="stats-rank">${i + 1}</td><td class="stats-product-cell">${nameHtml}</td><td class="stats-qty">x ${item.qty}</td></tr>`;
  }).join("");
  return `
    <p class="stats-summary">共 <strong>${entries.length}</strong> 種商品，合計 <strong>${totalItems}</strong> 件</p>
    <table class="stats-table">
      <thead><tr><th>#</th><th>商品名稱</th><th>數量</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export function refreshOrders() {
  loadForms();
}

let statsInitialized = false;

export function initOrders() {
  loadForms();

  const searchInput = document.getElementById("order-search-input");
  if (searchInput) {
    searchInput.value = searchQuery;
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      renderFilterTabs();
      renderForms(allForms);
    });
  }

  const toggle = document.getElementById("orders-stats-toggle");
  const label = document.getElementById("orders-mode-label");
  const listView = document.getElementById("orders-list-view");
  const statsView = document.getElementById("orders-stats-view");

  if (toggle) {
    toggle.addEventListener("change", () => {
      const isStats = toggle.checked;
      label.textContent = isStats ? "切換至訂單管理" : "切換至統計小幫手";
      listView.classList.toggle("hidden", isStats);
      statsView.classList.toggle("hidden", !isStats);
      if (isStats && !statsInitialized) {
        statsInitialized = true;
        renderStatsPanel();
      }
    });
  }
}
