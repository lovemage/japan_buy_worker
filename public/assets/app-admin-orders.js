import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";
import { calculateAdminFormTotals } from "./admin-totals.js";
import { showError, hideError } from "./app-admin.js";

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

let allForms = [];
let activeFilter = "pending";

function statusSelectHtml(formId, current) {
  const options = STATUS_OPTIONS.map(
    (o) => `<option value="${o.value}"${o.value === current ? " selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="js-status-select" data-form-id="${formId}">${options}</select>`;
}

function renderFilterTabs() {
  const tabsEl = document.getElementById("order-filter-tabs");
  if (!tabsEl) return;
  const counts = {};
  let total = allForms.length;
  for (const f of allForms) {
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

  const filtered = activeFilter === "all" ? forms : forms.filter((f) => f.status === activeFilter);

  if (!Array.isArray(filtered) || filtered.length === 0) {
    wrapper.innerHTML = `<p class="notice notice--info">目前沒有${activeFilter === "all" ? "" : FILTER_TABS.find((t) => t.value === activeFilter)?.label || ""}訂單。</p>`;
    return;
  }

  wrapper.innerHTML = filtered.map((form) => {
    const totals = calculateAdminFormTotals(form);
    const itemsHtml = Array.isArray(form.items)
      ? form.items.map((item) => {
          const imageUrl = withProductImageFallback(item.selectedImageUrl || item.imageUrl || "");
          const variantText = item.variantName || item.desiredSize || item.desiredColor || "";
          return `<li class="admin-item-row">
            <img class="admin-item-image" src="${imageUrl}" alt="${item.productNameSnapshot}" data-fallback="product" />
            <div class="admin-item-info">
              <p><strong>${item.productNameSnapshot}</strong>（${item.code || "無代碼"}）x ${item.quantity}</p>
              <p class="meta">規格：${variantText || "未選"}</p>
              <p class="meta">單價 &yen;${formatCurrency(item.unitPriceJpy)} / NT$${formatCurrency(item.unitPriceTwd)}，小計 &yen;${formatCurrency(item.subtotalJpy)} / NT$${formatCurrency(item.subtotalTwd)}</p>
              ${item.note ? `<p class="meta">備註：${item.note}</p>` : ""}
              ${item.productUrl ? `<a href="${item.productUrl}" target="_blank" rel="noopener noreferrer" class="meta">原商品頁</a>` : ""}
            </div>
          </li>`;
        }).join("")
      : "";
    const displayCode = form.orderCode || String(form.id);
    return `
    <article class="admin-form-card" data-status="${form.status}">
      <div class="admin-form-header">
        <h2 class="product-card__title">訂單 #${displayCode}</h2>
        <div class="admin-form-status">${statusSelectHtml(form.id, form.status)}</div>
      </div>
      <p class="meta">建立時間：${new Date(form.createdAt).toLocaleString("zh-TW")}</p>
      <p class="meta">客戶：${form.customerName}｜電話：${form.memberPhone || "無"}</p>
      <p class="meta">Line ID：${form.lineId || "無"}</p>
      <p class="meta">收件：${form.recipientCity || ""} ${form.recipientAddress || ""}</p>
      <p class="meta">配送：${shippingMethodText(form.shippingMethod)}</p>
      <p class="meta">商品合計：&yen;${formatCurrency(totals.itemsTotalJpy)} / NT$${formatCurrency(totals.itemsTotalTwd)}；總金額：NT$${formatCurrency(totals.grandTotalTwd)}</p>
      <p class="meta">整單備註：${form.notes || "無"}</p>
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
      if (res.status === 401) { location.href = "/admin-login.html"; return; }
      if (!res.ok) { showError(`狀態更新失敗：${res.status}`); return; }
      const target = allForms.find((f) => f.id === formId);
      if (target) target.status = select.value;
      renderFilterTabs();
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
      if (res.status === 401) { location.href = "/admin-login.html"; return; }
      if (!res.ok) { showError(`刪除失敗：${res.status}`); return; }
      await loadForms();
    });
  });
}

async function loadForms() {
  hideError();
  const res = await apiFetch("/api/admin/requirements");
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
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
  const counts = {};
  for (const form of forms) {
    if (!Array.isArray(form.items)) continue;
    for (const item of form.items) {
      const name = item.productNameSnapshot || "未知商品";
      const qty = Number(item.quantity) || 1;
      counts[name] = (counts[name] || 0) + qty;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function formatStatsText(stats) {
  return stats.map(([name, qty]) => `${name} x ${qty}`).join("\n");
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

  document.getElementById("btn-run-stats").addEventListener("click", () => {
    const filter = document.getElementById("stats-status-filter").value;
    const stats = computeStats(filter);
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify({ filter, data: stats }));
    document.getElementById("stats-result").innerHTML = buildStatsHtml(stats);
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
  const totalItems = stats.reduce((sum, [, qty]) => sum + qty, 0);
  const rows = stats.map(([name, qty], i) =>
    `<tr><td class="stats-rank">${i + 1}</td><td>${name}</td><td class="stats-qty">x ${qty}</td></tr>`
  ).join("");
  return `
    <p class="stats-summary">共 <strong>${stats.length}</strong> 種商品，合計 <strong>${totalItems}</strong> 件</p>
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
