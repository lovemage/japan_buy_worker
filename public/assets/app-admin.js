import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";
import { calculateAdminFormTotals } from "./admin-totals.js";

function showError(message) {
  const node = document.getElementById("admin-error");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove("hidden");
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toLocaleString("en-US");
}

function hideError() {
  const node = document.getElementById("admin-error");
  if (!node) {
    return;
  }
  node.classList.add("hidden");
}

function setCrawlStatus(text) {
  const node = document.getElementById("admin-crawl-status");
  if (!node) {
    return;
  }
  node.textContent = `抓取狀態：${text}`;
}

function shippingMethodText(method) {
  if (method === "jp_direct") {
    return "日本直送（需完成EZWAY）";
  }
  if (method === "limited_proxy") {
    return "限時連線代購（固定運費）";
  }
  if (method === "shipping_hidden") {
    return "運費選項隱藏（由客服後續確認）";
  }
  return "集運回台灣（國際+國內）";
}

const STATUS_OPTIONS = [
  { value: "pending", label: "待處理" },
  { value: "ordered", label: "已下單" },
  { value: "shipped", label: "已出貨" },
  { value: "cancelled", label: "取消訂單" },
];

function statusLabel(value) {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label || value;
}

function statusSelectHtml(formId, current) {
  const options = STATUS_OPTIONS.map(
    (o) => `<option value="${o.value}"${o.value === current ? " selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="js-status-select" data-form-id="${formId}">${options}</select>`;
}

function renderForms(forms) {
  const wrapper = document.getElementById("admin-forms");
  if (!wrapper) {
    return;
  }
  if (!Array.isArray(forms) || forms.length === 0) {
    wrapper.innerHTML = '<p class="notice">目前沒有需求單。</p>';
    return;
  }

  wrapper.innerHTML = forms
    .map((form) => {
      const totals = calculateAdminFormTotals(form);
      const itemsHtml = Array.isArray(form.items)
        ? form.items
            .map((item) => {
              const size = item.desiredSize || "未選";
              const color = item.desiredColor || "未選";
              const note = item.note ? `<p class="meta">備註：${item.note}</p>` : "";
              const sourceLink = item.productUrl
                ? `<a href="${item.productUrl}" target="_blank" rel="noopener noreferrer" class="meta">原商品頁</a>`
                : "";
              const imageUrl = withProductImageFallback(item.selectedImageUrl || item.imageUrl || "");
              return `<li class="admin-item-row">
                <img class="admin-item-image" src="${imageUrl}" alt="${item.productNameSnapshot}" data-fallback="product" />
                <div class="admin-item-info">
                  <p><strong>${item.productNameSnapshot}</strong>（${item.code || "無代碼"}）x ${item.quantity}</p>
                  <p class="meta">尺寸：${size}，顏色：${color}</p>
                  <p class="meta">單價 &yen;${formatCurrency(item.unitPriceJpy)} / NT$${formatCurrency(item.unitPriceTwd)}，小計 &yen;${formatCurrency(item.subtotalJpy)} / NT$${formatCurrency(item.subtotalTwd)}</p>
                  ${note}${sourceLink}
                </div>
              </li>`;
            })
            .join("")
        : "";
      const displayCode = form.orderCode || String(form.id);
      return `
      <article class="admin-form-card" data-status="${form.status}">
        <div class="admin-form-header">
          <h2 class="product-card__title">需求單 #${displayCode}</h2>
          <div class="admin-form-status">
            ${statusSelectHtml(form.id, form.status)}
          </div>
        </div>
        <p class="meta">建立時間：${new Date(form.createdAt).toLocaleString("zh-TW")}</p>
        <p class="meta">客戶：${form.customerName}</p>
        <p class="meta">電話：${form.memberPhone || form.contact || "無"}</p>
        <p class="meta">Line ID：${form.lineId || "無"}</p>
        <p class="meta">收件：${form.recipientCity || ""} ${form.recipientAddress || ""}</p>
        <p class="meta">配送：${shippingMethodText(form.shippingMethod)}</p>
        <p class="meta">EZWAY：${form.requiresEzway ? "需要" : "不需要"}</p>
        <p class="meta">運費：國際 NT$${formatCurrency(form.shippingInternationalTwd)} / 國內 NT$${formatCurrency(form.shippingDomesticTwd)} / 合計運費 NT$${formatCurrency(form.shippingTotalTwd)}</p>
        <p class="meta">商品合計：&yen;${formatCurrency(totals.itemsTotalJpy)} / NT$${formatCurrency(totals.itemsTotalTwd)}；總金額：NT$${formatCurrency(totals.grandTotalTwd)}</p>
        <p class="meta">整單備註：${form.notes || "無"}</p>
        <button class="button secondary js-delete-form" type="button" data-form-id="${form.id}">刪除此需求單</button>
        <ul class="admin-form-items">${itemsHtml}</ul>
      </article>
      `;
    })
    .join("");
  applyProductImageFallback(wrapper);

  wrapper.querySelectorAll(".js-status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const formId = Number(select.getAttribute("data-form-id"));
      const newStatus = select.value;
      hideError();
      const res = await fetch("/api/admin/requirements", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: formId, status: newStatus }),
      });
      if (res.status === 401) {
        location.href = "/admin-login.html";
        return;
      }
      if (!res.ok) {
        showError(`狀態更新失敗：${res.status}`);
        return;
      }
      const card = select.closest(".admin-form-card");
      if (card) {
        card.setAttribute("data-status", newStatus);
      }
    });
  });

  wrapper.querySelectorAll(".js-delete-form").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-form-id") || "");
      if (!Number.isInteger(id) || id <= 0) {
        return;
      }
      const yes = confirm(`確定刪除需求單 #${id}？此操作無法復原。`);
      if (!yes) {
        return;
      }
      hideError();
      const res = await fetch(`/api/admin/requirements?id=${id}`, { method: "DELETE" });
      if (res.status === 401) {
        location.href = "/admin-login.html";
        return;
      }
      if (!res.ok) {
        showError(`刪除需求單失敗：${res.status}`);
        return;
      }
      await loadForms();
    });
  });
}

async function loadForms() {
  hideError();
  const res = await fetch("/api/admin/requirements");
  if (res.status === 401) {
    location.href = "/admin-login.html";
    return;
  }
  if (!res.ok) {
    showError(`需求單讀取失敗：${res.status}`);
    return;
  }
  const body = await res.json();
  renderForms(body.forms || []);
}

async function runCrawl() {
  hideError();
  setCrawlStatus("抓取中（100 頁），請稍候...");
  const button = document.getElementById("admin-crawl");
  if (button) {
    button.setAttribute("disabled", "true");
  }

  try {
    const res = await fetch("/admin/crawl", { method: "POST" });
    if (res.status === 401) {
      location.href = "/admin-login.html";
      return;
    }
    if (!res.ok) {
      setCrawlStatus(`抓取失敗（HTTP ${res.status}）`);
      showError(`抓取失敗：${res.status}`);
      return;
    }
    const body = await res.json();
    if (body?.ok) {
      setCrawlStatus(
        `完成：來源 ${body.source || "-"}，抓到 ${body.crawledCount || 0} 筆，寫入 ${body.upserted || 0} 筆`
      );
    } else {
      setCrawlStatus("抓取失敗（回應格式錯誤）");
    }
    await loadForms();
  } finally {
    if (button) {
      button.removeAttribute("disabled");
    }
  }
}

async function loadPricing() {
  const res = await fetch("/api/admin/pricing");
  if (res.status === 401) {
    location.href = "/admin-login.html";
    return;
  }
  if (!res.ok) {
    showError(`價格設定讀取失敗：${res.status}`);
    return;
  }
  const body = await res.json();
  const markupNode = document.getElementById("markup-jpy");
  const rateNode = document.getElementById("jpy-to-twd");
  const intlNode = document.getElementById("international-shipping-twd");
  const domesticNode = document.getElementById("domestic-shipping-twd");
  const promoNode = document.getElementById("promo-tag-max-twd");
  const limitedProxyNode = document.getElementById("limited-proxy-shipping-twd");
  const optionsEnabledNode = document.getElementById("shipping-options-enabled");
  if (markupNode) {
    markupNode.value = String(body?.pricing?.markupJpy ?? 1000);
  }
  if (rateNode) {
    rateNode.value = String(body?.pricing?.jpyToTwd ?? 0.21);
  }
  if (intlNode) {
    intlNode.value = String(body?.pricing?.internationalShippingTwd ?? 350);
  }
  if (domesticNode) {
    domesticNode.value = String(body?.pricing?.domesticShippingTwd ?? 60);
  }
  if (promoNode) {
    promoNode.value = String(body?.pricing?.promoTagMaxTwd ?? 500);
  }
  if (limitedProxyNode) {
    limitedProxyNode.value = String(body?.pricing?.limitedProxyShippingTwd ?? 80);
  }
  if (optionsEnabledNode) {
    optionsEnabledNode.checked = body?.pricing?.shippingOptionsEnabled !== false;
  }
}

async function savePricing() {
  const markupNode = document.getElementById("markup-jpy");
  const rateNode = document.getElementById("jpy-to-twd");
  const intlNode = document.getElementById("international-shipping-twd");
  const domesticNode = document.getElementById("domestic-shipping-twd");
  const promoNode = document.getElementById("promo-tag-max-twd");
  const limitedProxyNode = document.getElementById("limited-proxy-shipping-twd");
  const optionsEnabledNode = document.getElementById("shipping-options-enabled");
  const markupJpy = Number(markupNode?.value || 0);
  const jpyToTwd = Number(rateNode?.value || 0);
  const internationalShippingTwd = Number(intlNode?.value || 0);
  const domesticShippingTwd = Number(domesticNode?.value || 0);
  const promoTagMaxTwd = Number(promoNode?.value || 0);
  const limitedProxyShippingTwd = Number(limitedProxyNode?.value || 0);
  const shippingOptionsEnabled = Boolean(optionsEnabledNode?.checked);
  const res = await fetch("/api/admin/pricing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      markupJpy,
      jpyToTwd,
      internationalShippingTwd,
      domesticShippingTwd,
      promoTagMaxTwd,
      limitedProxyShippingTwd,
      shippingOptionsEnabled,
    }),
  });
  if (res.status === 401) {
    location.href = "/admin-login.html";
    return;
  }
  if (!res.ok) {
    showError(`價格設定儲存失敗：${res.status}`);
    return;
  }
}

async function logout() {
  await fetch("/api/admin/logout", { method: "POST" });
  location.href = "/admin-login.html";
}

function bootstrap() {
  const crawl = document.getElementById("admin-crawl");
  if (crawl) {
    crawl.addEventListener("click", runCrawl);
  }
  const refresh = document.getElementById("admin-refresh");
  if (refresh) {
    refresh.addEventListener("click", loadForms);
  }
  const save = document.getElementById("admin-save-pricing");
  if (save) {
    save.addEventListener("click", savePricing);
  }
  const logoutBtn = document.getElementById("admin-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
  loadPricing();
  loadForms();
}

bootstrap();
