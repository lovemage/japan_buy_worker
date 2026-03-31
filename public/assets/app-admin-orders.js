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
  { value: "ordered", label: "已下單" },
  { value: "shipped", label: "已出貨" },
  { value: "cancelled", label: "取消訂單" },
];

function statusSelectHtml(formId, current) {
  const options = STATUS_OPTIONS.map(
    (o) => `<option value="${o.value}"${o.value === current ? " selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="js-status-select" data-form-id="${formId}">${options}</select>`;
}

function renderForms(forms) {
  const wrapper = document.getElementById("admin-forms");
  if (!wrapper) return;
  if (!Array.isArray(forms) || forms.length === 0) {
    wrapper.innerHTML = '<p class="notice notice--info">目前沒有需求單。</p>';
    return;
  }

  wrapper.innerHTML = forms.map((form) => {
    const totals = calculateAdminFormTotals(form);
    const itemsHtml = Array.isArray(form.items)
      ? form.items.map((item) => {
          const imageUrl = withProductImageFallback(item.selectedImageUrl || item.imageUrl || "");
          return `<li class="admin-item-row">
            <img class="admin-item-image" src="${imageUrl}" alt="${item.productNameSnapshot}" data-fallback="product" />
            <div class="admin-item-info">
              <p><strong>${item.productNameSnapshot}</strong>（${item.code || "無代碼"}）x ${item.quantity}</p>
              <p class="meta">尺寸：${item.desiredSize || "未選"}，顏色：${item.desiredColor || "未選"}</p>
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
        <h2 class="product-card__title">需求單 #${displayCode}</h2>
        <div class="admin-form-status">${statusSelectHtml(form.id, form.status)}</div>
      </div>
      <p class="meta">建立時間：${new Date(form.createdAt).toLocaleString("zh-TW")}</p>
      <p class="meta">客戶：${form.customerName}｜電話：${form.memberPhone || "無"}</p>
      <p class="meta">Line ID：${form.lineId || "無"}</p>
      <p class="meta">收件：${form.recipientCity || ""} ${form.recipientAddress || ""}</p>
      <p class="meta">配送：${shippingMethodText(form.shippingMethod)}</p>
      <p class="meta">商品合計：&yen;${formatCurrency(totals.itemsTotalJpy)} / NT$${formatCurrency(totals.itemsTotalTwd)}；總金額：NT$${formatCurrency(totals.grandTotalTwd)}</p>
      <p class="meta">整單備註：${form.notes || "無"}</p>
      <button class="button secondary js-delete-form" type="button" data-form-id="${form.id}">刪除此需求單</button>
      <ul class="admin-form-items">${itemsHtml}</ul>
    </article>`;
  }).join("");

  applyProductImageFallback(wrapper);

  wrapper.querySelectorAll(".js-status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const formId = Number(select.getAttribute("data-form-id"));
      hideError();
      const res = await fetch("/api/admin/requirements", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: formId, status: select.value }),
      });
      if (res.status === 401) { location.href = "/admin-login.html"; return; }
      if (!res.ok) { showError(`狀態更新失敗：${res.status}`); return; }
      const card = select.closest(".admin-form-card");
      if (card) card.setAttribute("data-status", select.value);
    });
  });

  wrapper.querySelectorAll(".js-delete-form").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-form-id") || "");
      if (!Number.isInteger(id) || id <= 0) return;
      if (!confirm(`確定刪除需求單 #${id}？此操作無法復原。`)) return;
      hideError();
      const res = await fetch(`/api/admin/requirements?id=${id}`, { method: "DELETE" });
      if (res.status === 401) { location.href = "/admin-login.html"; return; }
      if (!res.ok) { showError(`刪除失敗：${res.status}`); return; }
      await loadForms();
    });
  });
}

async function loadForms() {
  hideError();
  const res = await fetch("/api/admin/requirements");
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) { showError(`讀取失敗：${res.status}`); return; }
  const body = await res.json();
  renderForms(body.forms || []);
}

export function refreshOrders() {
  loadForms();
}

export function initOrders() {
  loadForms();
}
