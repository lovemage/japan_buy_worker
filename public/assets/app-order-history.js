function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function statusText(status) {
  const map = {
    pending: "待確認",
    paid: "已付款",
    preparing: "備貨中",
    ordered: "已下單",
    shipped: "已出貨",
    completed: "已完成",
    cancelled: "已取消",
  };
  return map[status] || status || "待確認";
}

function setError(message) {
  const node = document.getElementById("history-error");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("hidden", !message);
}

function renderOrders(orders) {
  const results = document.getElementById("history-results");
  if (!results) return;

  if (!orders.length) {
    results.innerHTML = '<div class="order-summary"><div class="order-summary-title">查無訂單</div><div class="order-item"><div class="name">沒有找到這支電話的歷史訂單。</div></div></div>';
    return;
  }

  results.innerHTML = orders.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = items.map((item) => {
      const spec = item.variantName || [item.desiredSize, item.desiredColor].filter(Boolean).join(" / ");
      return `<div class="order-item">
        <div class="name">${escapeHtml(item.productNameSnapshot || "商品")}
          <div class="spec">${escapeHtml(spec || "未選規格")} × ${Number(item.quantity || 1)}</div>
        </div>
        <div class="price">NT$${formatMoney(item.subtotalTwd)}</div>
      </div>`;
    }).join("");
    const created = order.createdAt ? new Date(order.createdAt.replace(" ", "T")).toLocaleString("zh-TW") : "";
    const adjustedBadge = order.amountAdjusted ? '<span class="order-adjusted-badge">已調整金額</span>' : "";
    return `<article class="order-summary">
      <div class="order-summary-title">訂單 #${escapeHtml(order.orderCode)}｜${escapeHtml(statusText(order.status))} ${adjustedBadge}</div>
      <div class="order-item">
        <div class="name">${escapeHtml(order.memberName || "會員")}
          <div class="spec">${escapeHtml(created)}</div>
        </div>
        <div class="price">NT$${formatMoney(order.grandTotalTwd)}</div>
      </div>
      ${itemsHtml}
      <div class="order-totals">
        <div class="row"><span>商品小計</span><span>NT$${formatMoney(order.itemsTotalTwd)}</span></div>
        <div class="row"><span>運費</span><span>NT$${formatMoney(order.shippingTotalTwd)}</span></div>
        <div class="row total"><span>合計</span><span>NT$${formatMoney(order.grandTotalTwd)}</span></div>
      </div>
    </article>`;
  }).join("");
}

async function loadHistory(phone) {
  const res = await apiFetch(`/api/requirement-history?phone=${encodeURIComponent(phone)}`);
  if (!res.ok) {
    throw new Error(`查詢失敗：${res.status}`);
  }
  const body = await res.json();
  if (!body.ok || !Array.isArray(body.orders)) {
    throw new Error("查詢失敗：回應格式錯誤");
  }
  return body.orders;
}

function bootstrap() {
  const base = window.__API_BASE || "";
  const backLink = document.getElementById("back-to-store");
  if (backLink && base) backLink.href = base + "/";

  const form = document.getElementById("history-form");
  const phoneInput = document.getElementById("history-phone");
  const submit = document.getElementById("history-submit");
  if (!form || !phoneInput) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = phoneInput.value.trim();
    if (!phone) {
      setError("請輸入會員電話");
      return;
    }

    setError("");
    if (submit) {
      submit.disabled = true;
      submit.textContent = "查詢中...";
    }
    try {
      renderOrders(await loadHistory(phone));
    } catch (error) {
      setError(error instanceof Error ? error.message : "查詢失敗");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "查詢歷史訂單";
      }
    }
  });
}

bootstrap();
