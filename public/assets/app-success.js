const OFFICIAL_LINE_URL = "https://lin.ee/CnwC6Nt";
const _srcCurrency = (window.__COUNTRY_CONFIG || {}).currency || "JPY";

function showError(message) {
  const node = document.getElementById("success-error");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove("hidden");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function shippingMethodText(method) {
  if (method === "jp_direct") {
    return "日本直送（需完成 EZWAY）";
  }
  if (method === "limited_proxy") {
    return "限時連線代購（固定運費）";
  }
  if (method === "shipping_hidden") {
    return "運費選項隱藏（由客服後續確認）";
  }
  return "集運回台灣（國際+國內）";
}

function buildCopyText(requirement) {
  const shippingText = shippingMethodText(requirement.shippingMethod);
  const itemLines = requirement.items
    .map((item, idx) => {
      return `${idx + 1}. ${item.productNameSnapshot} (${item.code || "無代碼"}) x${item.quantity}
   規格: 尺寸=${item.desiredSize || "未選"}, 顏色=${item.desiredColor || "未選"}
   選擇圖片: ${item.selectedImageUrl || "-"}
   金額: ${_srcCurrency} ${formatNumber(item.subtotalJpy)} / TWD ${formatNumber(item.subtotalTwd)}
   商品頁: ${item.productUrl || "-"}`;
    })
    .join("\n");

  const displayCode = requirement.orderCode || requirement.id;
  return `您好，我要確認代購訂單
訂單編號: #${displayCode}
官方Line: ${OFFICIAL_LINE_URL}
會員姓名: ${requirement.memberName}
會員電話: ${requirement.memberPhone}
Line ID: ${requirement.lineId}
收件地址: ${requirement.recipientCity} ${requirement.recipientAddress}
配送方式: ${shippingText}
運費: 國際 TWD ${formatNumber(requirement.shippingInternationalTwd)} / 國內 TWD ${formatNumber(requirement.shippingDomesticTwd)} / 合計運費 TWD ${formatNumber(requirement.shippingTotalTwd)}
商品合計: ${_srcCurrency} ${formatNumber(requirement.itemsTotalJpy)} / TWD ${formatNumber(requirement.itemsTotalTwd)}
總計: TWD ${formatNumber(requirement.grandTotalTwd)}
備註: ${requirement.notes || "無"}
---
${itemLines}`;
}

function renderDetail(requirement) {
  const node = document.getElementById("success-detail");
  if (!node) {
    return "";
  }
  const shippingText = shippingMethodText(requirement.shippingMethod);
  const itemsHtml = requirement.items
    .map((item) => {
      return `<li>${item.productNameSnapshot}（${item.code || "無代碼"}）x ${item.quantity}，
      尺寸：${item.desiredSize || "未選"}，顏色：${item.desiredColor || "未選"}，
      選圖：${item.selectedImageUrl ? `<a href="${item.selectedImageUrl}" target="_blank" rel="noopener noreferrer">查看</a>` : "無"}，
      小計 ${_srcCurrency} ${formatNumber(item.subtotalJpy)} / TWD ${formatNumber(item.subtotalTwd)}</li>`;
    })
    .join("");
  node.innerHTML = `
    <p class="meta">訂單編號：#${requirement.orderCode || requirement.id}</p>
    <p class="meta">姓名：${requirement.memberName}</p>
    <p class="meta">電話：${requirement.memberPhone}</p>
    <p class="meta">收件：${requirement.recipientCity} ${requirement.recipientAddress}</p>
    <p class="meta">配送：${shippingText}</p>
    <p class="meta">運費：國際 TWD ${formatNumber(requirement.shippingInternationalTwd)} / 國內 TWD ${formatNumber(requirement.shippingDomesticTwd)} / 合計運費 TWD ${formatNumber(requirement.shippingTotalTwd)}</p>
    <p class="meta">商品合計：${_srcCurrency} ${formatNumber(requirement.itemsTotalJpy)} / TWD ${formatNumber(requirement.itemsTotalTwd)}</p>
    <p class="meta">總計：TWD ${formatNumber(requirement.grandTotalTwd)}</p>
    <p class="meta">備註：${requirement.notes || "無"}</p>
    <ul>${itemsHtml}</ul>
  `;

  return buildCopyText(requirement);
}

async function bootstrap() {
  const params = new URL(location.href).searchParams;
  const id = params.get("id");
  const code = params.get("code");
  const titleNode = document.getElementById("success-id");
  if (titleNode) {
    const display = code || id || "未知";
    titleNode.textContent = `訂單編號：#${display}`;
  }
  if (!id) {
    showError("缺少訂單編號");
    return;
  }

  const res = await apiFetch(`/api/requirement?id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    showError(`讀取訂單失敗：${res.status}`);
    return;
  }
  const body = await res.json();
  if (!body.ok || !body.requirement) {
    showError("讀取訂單失敗");
    return;
  }

  const copyText = renderDetail(body.requirement);
  const copyBtn = document.getElementById("copy-order-text");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyText);
        copyBtn.textContent = "已複製，請貼到官方 Line";
      } catch {
        showError("複製失敗，請手動複製內容");
      }
    });
  }
}

bootstrap();
