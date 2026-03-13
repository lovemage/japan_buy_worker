import { clearDraft, getDraft, setDraft } from "./draft-store.js";
import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";
const DEFAULT_PRICING = {
  markupJpy: 1000,
  jpyToTwd: 0.21,
  internationalShippingTwd: 350,
  domesticShippingTwd: 60,
  limitedProxyShippingTwd: 80,
  shippingOptionsEnabled: true,
};
const TAIWAN_CITIES = [
  "台北市",
  "新北市",
  "桃園市",
  "台中市",
  "台南市",
  "高雄市",
  "基隆市",
  "新竹市",
  "嘉義市",
  "新竹縣",
  "苗栗縣",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義縣",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

let pricingConfig = DEFAULT_PRICING;
let currentCaptchaCode = "";

function showError(message) {
  const node = document.getElementById("request-error");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove("hidden");
}

function calcAdjustedPrices(baseJpy, pricing) {
  const base = Number(baseJpy);
  if (!Number.isFinite(base)) {
    return { jpy: 0, twd: 0 };
  }
  const markup = Number(pricing?.markupJpy ?? DEFAULT_PRICING.markupJpy);
  const rate = Number(pricing?.jpyToTwd ?? DEFAULT_PRICING.jpyToTwd);
  const jpy = Math.round(base + (Number.isFinite(markup) ? markup : DEFAULT_PRICING.markupJpy));
  const twd = Math.round(jpy * (Number.isFinite(rate) ? rate : DEFAULT_PRICING.jpyToTwd));
  return { jpy, twd };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSelectOptions(options, selected, placeholder) {
  const list = Array.isArray(options) ? options.filter(Boolean) : [];
  if (list.length === 0) {
    return "";
  }
  const head = `<option value="">${escapeHtml(placeholder)}</option>`;
  const body = list
    .map((option) => {
      const selectedAttr = option === selected ? " selected" : "";
      return `<option value="${escapeHtml(option)}"${selectedAttr}>${escapeHtml(option)}</option>`;
    })
    .join("");
  return head + body;
}

function renderDraftItems() {
  const wrapper = document.getElementById("request-items");
  if (!wrapper) {
    return [];
  }

  const draft = getDraft();
  if (draft.items.length === 0) {
    wrapper.innerHTML = '<p class="notice">目前沒有商品，請先從列表加入。</p>';
    return [];
  }

  wrapper.innerHTML = draft.items
    .map(
      (item, idx) => `
      <article class="request-item" data-idx="${idx}">
        <a href="${item.code ? `/product?code=${encodeURIComponent(item.code)}` : "#"}" target="_blank" rel="noopener noreferrer">
          <img src="${withProductImageFallback(item.selectedImageUrl || item.imageUrl || "")}" alt="${item.productNameSnapshot}" data-fallback="product" />
        </a>
        <div>
          <h2 class="product-card__title">
            <a href="${item.code ? `/product?code=${encodeURIComponent(item.code)}` : "#"}" target="_blank" rel="noopener noreferrer">
              ${item.productNameSnapshot}
            </a>
          </h2>
          <p class="meta">JPY ${Number(item.priceJpyTaxIn || 0).toLocaleString("en-US")}</p>
          <p class="meta">TWD ${Number(item.unitPriceTwd || 0).toLocaleString("en-US")}</p>
          <div class="request-item__controls">
            <label>數量<input type="number" min="1" data-field="quantity" value="${item.quantity || 1}" /></label>
            <label>尺寸${
              Array.isArray(item.sizeOptions) && item.sizeOptions.length > 0
                ? `<select data-field="desiredSize">${renderSelectOptions(
                    item.sizeOptions,
                    item.desiredSize || "",
                    "請選擇尺寸"
                  )}</select>`
                : `<input type="text" data-field="desiredSize" value="${item.desiredSize || ""}" placeholder="未抓到尺寸，可手動填寫" />`
            }</label>
            <label>顏色
              <input type="text" value="${item.desiredColor || "依商品圖片選擇"}" disabled />
            </label>
            <label>備註<input type="text" data-field="note" value="${item.note || ""}" /></label>
            <button type="button" class="button secondary js-remove-item" data-remove-idx="${idx}">刪除此商品</button>
          </div>
        </div>
      </article>
    `
    )
    .join("");

  wrapper.querySelectorAll(".request-item").forEach((article) => {
    const idx = Number(article.getAttribute("data-idx"));
    article.querySelectorAll("input, select").forEach((input) => {
      const eventName = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventName, () => {
        const d = getDraft();
        if (!d.items[idx]) {
          return;
        }
        const field = input.getAttribute("data-field");
        if (!field) {
          return;
        }
        d.items[idx][field] = field === "quantity" ? Number(input.value || 1) : input.value;
        setDraft(d);
        renderTotals();
      });
    });
  });

  wrapper.querySelectorAll(".js-remove-item").forEach((button) => {
    button.addEventListener("click", () => {
      const idx = Number(button.getAttribute("data-remove-idx"));
      const d = getDraft();
      if (!Number.isInteger(idx) || idx < 0 || idx >= d.items.length) {
        return;
      }
      d.items.splice(idx, 1);
      setDraft(d);
      renderDraftItems();
      renderTotals();
    });
  });

  applyProductImageFallback(wrapper);

  return draft.items;
}

function renderTotals() {
  const draft = getDraft();
  const itemsTotalJpy = draft.items.reduce(
    (sum, item) => sum + Number(item.priceJpyTaxIn || 0) * Number(item.quantity || 1),
    0
  );
  const itemsTotalTwd = draft.items.reduce(
    (sum, item) => sum + Number(item.unitPriceTwd || 0) * Number(item.quantity || 1),
    0
  );
  const shippingOptionsEnabled = pricingConfig?.shippingOptionsEnabled !== false;
  const shippingMethod = shippingOptionsEnabled
    ? document.querySelector('input[name="shippingMethod"]:checked')?.value || "consolidated_tw"
    : "shipping_hidden";
  const intlShippingTwd = Number(pricingConfig?.internationalShippingTwd || 0);
  const domesticShippingTwd = Number(pricingConfig?.domesticShippingTwd || 0);
  const limitedProxyShippingTwd = Number(pricingConfig?.limitedProxyShippingTwd || 0);
  const shippingTwd =
    shippingMethod === "jp_direct"
      ? intlShippingTwd
      : shippingMethod === "limited_proxy"
        ? Math.round(limitedProxyShippingTwd)
        : shippingMethod === "consolidated_tw"
          ? intlShippingTwd + Math.round(domesticShippingTwd)
          : 0;
  const totalJpy = itemsTotalJpy;
  const totalTwd = itemsTotalTwd + shippingTwd;
  const totalJpyNode = document.getElementById("total-jpy");
  const totalTwdNode = document.getElementById("total-twd");
  const shippingTwdNode = document.getElementById("shipping-twd");
  const shippingNote = document.getElementById("shipping-note");
  if (shippingTwdNode) {
    shippingTwdNode.textContent = `運費 TWD：${shippingTwd.toLocaleString("en-US")}`;
  }
  if (totalJpyNode) {
    totalJpyNode.textContent = `合計 JPY：${totalJpy.toLocaleString("en-US")}`;
  }
  if (totalTwdNode) {
    totalTwdNode.textContent = `合計 TWD：${totalTwd.toLocaleString("en-US")}`;
  }
  if (shippingNote) {
    shippingNote.textContent = shippingOptionsEnabled
      ? shippingMethod === "jp_direct"
        ? "提醒：日本直送需完成 EZWAY 實名驗證。"
        : shippingMethod === "limited_proxy"
          ? "限時連線代購：使用固定運費。"
          : "使用集運回台灣：含國際運費與國內 7-11 店到店。"
      : "運費選項目前由 Admin 隱藏，將由客服後續確認。";
  }

  return {
    shippingMethod,
    shippingInternationalTwd:
      shippingMethod === "consolidated_tw" || shippingMethod === "jp_direct" ? intlShippingTwd : 0,
    shippingDomesticTwd: shippingMethod === "consolidated_tw" ? Math.round(domesticShippingTwd) : 0,
    shippingTotalTwd: shippingTwd,
    requiresEzway: shippingMethod === "jp_direct",
    totalJpy,
    totalTwd,
  };
}

function applyShippingOptionsVisibility() {
  const box = document.getElementById("shipping-options-box");
  const radios = document.querySelectorAll('input[name="shippingMethod"]');
  const enabled = pricingConfig?.shippingOptionsEnabled !== false;
  if (box) {
    box.classList.toggle("hidden", !enabled);
  }
  radios.forEach((node) => {
    if (enabled) {
      node.removeAttribute("disabled");
    } else {
      node.setAttribute("disabled", "true");
    }
  });
}

async function hydrateDraftWithOptions() {
  const draft = getDraft();
  let changed = false;
  for (let i = 0; i < draft.items.length; i += 1) {
    const item = draft.items[i];
    if (!item?.code) {
      continue;
    }
    const hasSize = Array.isArray(item.sizeOptions) && item.sizeOptions.length > 0;
    const hasColor = Array.isArray(item.colorOptions) && item.colorOptions.length > 0;
    if (hasSize && hasColor) {
      continue;
    }
    const res = await fetch(`/api/product?code=${encodeURIComponent(item.code)}`);
    if (!res.ok) {
      continue;
    }
    const body = await res.json();
    const product = body?.product;
    if (!product) {
      continue;
    }
    const sizeOptions = Array.isArray(product.sizeOptions) ? product.sizeOptions.filter(Boolean) : [];
    const colorOptions = Array.isArray(product.colorOptions) ? product.colorOptions.filter(Boolean) : [];
    if (!item.priceJpyTaxIn || !item.unitPriceTwd) {
      const adjusted = calcAdjustedPrices(product.priceJpyTaxIn, pricingConfig);
      item.priceJpyTaxIn = adjusted.jpy;
      item.unitPriceTwd = adjusted.twd;
      changed = true;
    }
    if (sizeOptions.length > 0) {
      item.sizeOptions = sizeOptions;
      changed = true;
    }
    if (colorOptions.length > 0) {
      item.colorOptions = colorOptions;
      changed = true;
    }
  }

  if (changed) {
    setDraft(draft);
  }
}

function renderCityOptions() {
  const node = document.getElementById("recipientCity");
  if (!node) {
    return;
  }
  node.innerHTML = [`<option value="">請選擇縣市</option>`, ...TAIWAN_CITIES.map((x) => `<option value="${x}">${x}</option>`)].join(
    ""
  );
}

function randomCaptchaCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 })
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join("");
}

function refreshCaptcha() {
  currentCaptchaCode = randomCaptchaCode();
  const svg = document.getElementById("captcha-svg");
  if (!svg) {
    return;
  }
  const lines = Array.from({ length: 5 })
    .map(() => {
      const x1 = Math.floor(Math.random() * 160);
      const x2 = Math.floor(Math.random() * 160);
      const y1 = Math.floor(Math.random() * 50);
      const y2 = Math.floor(Math.random() * 50);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9ca8b8" stroke-width="1" />`;
    })
    .join("");
  svg.innerHTML = `
    <rect x="0" y="0" width="160" height="50" fill="#f3f6fb" />
    ${lines}
    <text x="16" y="34" font-size="28" font-family="monospace" fill="#1a355a">${currentCaptchaCode}</text>
  `;
}

function validateForm(payload) {
  if (!payload.memberName?.trim()) {
    return "會員姓名為必填";
  }
  if (!payload.memberPhone?.trim()) {
    return "會員電話為必填";
  }
  if (!payload.recipientCity?.trim()) {
    return "收件縣市為必填";
  }
  if (!payload.recipientAddress?.trim()) {
    return "收件地址為必填";
  }
  if (!payload.lineId?.trim()) {
    return "Line ID 為必填";
  }
  if (
    !payload.shippingMethod ||
    !["consolidated_tw", "jp_direct", "limited_proxy", "shipping_hidden"].includes(
      payload.shippingMethod
    )
  ) {
    return "配送方式為必填";
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return "請先加入至少一個商品";
  }
  const invalidQty = payload.items.some((item) => Number(item.quantity) < 1);
  if (invalidQty) {
    return "商品數量至少要 1";
  }
  return null;
}

async function onSubmit(event) {
  event.preventDefault();
  const captchaInput = (document.getElementById("captchaInput")?.value || "").trim().toUpperCase();
  if (!captchaInput || captchaInput !== currentCaptchaCode) {
    showError("圖形驗證錯誤，請重新輸入");
    refreshCaptcha();
    return;
  }

  const draft = getDraft();
  const totals = renderTotals();
  const payload = {
    memberName: document.getElementById("memberName")?.value || "",
    memberPhone: document.getElementById("memberPhone")?.value || "",
    recipientCity: document.getElementById("recipientCity")?.value || "",
    recipientAddress: document.getElementById("recipientAddress")?.value || "",
    lineId: document.getElementById("lineId")?.value || "",
    shippingMethod: totals.shippingMethod,
    shippingInternationalTwd: totals.shippingInternationalTwd,
    shippingDomesticTwd: totals.shippingDomesticTwd,
    shippingTotalTwd: totals.shippingTotalTwd,
    requiresEzway: totals.requiresEzway,
    notes: document.getElementById("notes")?.value || "",
    items: draft.items.map((item) => ({
      productId: item.productId,
      productNameSnapshot: item.productNameSnapshot,
      selectedImageUrl: item.selectedImageUrl || item.imageUrl || "",
      quantity: Number(item.quantity || 1),
      unitPriceJpy: Number(item.priceJpyTaxIn || 0),
      unitPriceTwd: Number(item.unitPriceTwd || 0),
      subtotalJpy: Number(item.priceJpyTaxIn || 0) * Number(item.quantity || 1),
      subtotalTwd: Number(item.unitPriceTwd || 0) * Number(item.quantity || 1),
      desiredSize: item.desiredSize || "",
      desiredColor: item.desiredColor || "",
      note: item.note || "",
    })),
  };

  const error = validateForm(payload);
  if (error) {
    showError(error);
    return;
  }

  const res = await fetch("/api/requirements", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    showError(`送出失敗：${res.status}`);
    return;
  }
  const body = await res.json();
  if (!body.ok || !body.requirementId) {
    showError("送出失敗：回應格式錯誤");
    return;
  }

  clearDraft();
  location.href = `/success.html?id=${encodeURIComponent(String(body.requirementId))}`;
}

async function bootstrap() {
  const pricingRes = await fetch("/api/pricing");
  const pricingBody = pricingRes.ok ? await pricingRes.json() : null;
  pricingConfig = pricingBody?.pricing || DEFAULT_PRICING;

  renderCityOptions();
  await hydrateDraftWithOptions();
  renderDraftItems();
  renderTotals();
  const refreshBtn = document.getElementById("captcha-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", refreshCaptcha);
  }
  refreshCaptcha();
  document.querySelectorAll('input[name="shippingMethod"]').forEach((node) => {
    node.addEventListener("change", renderTotals);
  });
  applyShippingOptionsVisibility();
  renderTotals();
  const form = document.getElementById("request-form");
  if (form) {
    form.addEventListener("submit", onSubmit);
  }
}

bootstrap();
