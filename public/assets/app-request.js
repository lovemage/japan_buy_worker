import { clearDraft, getDraft, setDraft } from "./draft-store.js";
import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";
const _cc = window.__COUNTRY_CONFIG || {};
const DEFAULT_PRICING = {
  markupJpy: _cc.defaultMarkup || 1000,
  markupMode: "flat",
  markupPercent: 15,
  jpyToTwd: _cc.defaultRate || 0.21,
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
  node.scrollIntoView({ behavior: "smooth", block: "center" });
}

function calcAdjustedPrices(baseJpy, pricing) {
  const base = Number(baseJpy);
  if (!Number.isFinite(base)) {
    return { jpy: 0, twd: 0 };
  }

  if (pricing?.pricingMode === "manual") {
    const rate = Number(pricing?.jpyToTwd ?? DEFAULT_PRICING.jpyToTwd);
    const jpy = (Number.isFinite(rate) && rate > 0) ? Math.round(base / rate) : 0;
    return { jpy, twd: Math.round(base) };
  }

  const mode = pricing?.markupMode || DEFAULT_PRICING.markupMode;
  const rate = Number(pricing?.jpyToTwd ?? DEFAULT_PRICING.jpyToTwd);

  if (mode === "percent") {
    const pct = Number(pricing?.markupPercent ?? DEFAULT_PRICING.markupPercent);
    const twd = Math.round(base * (Number.isFinite(rate) ? rate : DEFAULT_PRICING.jpyToTwd) * (1 + (Number.isFinite(pct) ? pct : DEFAULT_PRICING.markupPercent) / 100));
    return { jpy: base, twd };
  }

  const markup = Number(pricing?.markupJpy ?? DEFAULT_PRICING.markupJpy);
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

function normalizeVariantOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const name = String(option.name || "").trim();
      const stock = Number(option.stock);
      const price = option.price === null || option.price === undefined || option.price === ""
        ? null
        : Number(option.price);
      if (!name) return null;
      return {
        name,
        stock: Number.isFinite(stock) && stock >= 0 ? Math.round(stock) : 0,
        price: Number.isFinite(price) && price >= 0 ? Math.round(price) : null,
      };
    })
    .filter(Boolean);
}

function applyVariantPricing(item) {
  const variants = normalizeVariantOptions(item.variantOptions);
  if (variants.length === 0) return;
  const selected = variants.find((variant) => variant.name === item.variantName) || variants[0];
  const adjusted = calcAdjustedPrices(selected.price, pricingConfig);
  item.variantOptions = variants;
  item.variantName = selected.name;
  item.variantPriceJpyTaxIn = adjusted.jpy;
  item.variantUnitPriceTwd = adjusted.twd;
  item.priceJpyTaxIn = adjusted.jpy;
  item.unitPriceTwd = adjusted.twd;
}

function renderDraftItems() {
  const wrapper = document.getElementById("request-items");
  if (!wrapper) {
    return [];
  }

  const draft = getDraft();
  if (draft.items.length === 0) {
    wrapper.innerHTML = '<div class="empty-state"><p>目前沒有商品</p><a class="btn-pill secondary" href="' + (window.__API_BASE || '') + '/">← 前往商店加入</a></div>';
    return [];
  }

  const srcSym = (window.__COUNTRY_CONFIG || _cc).currencySymbol || "¥";
  wrapper.innerHTML = draft.items
    .map(
      (item, idx) => `
      <article class="request-item" data-idx="${idx}" role="listitem" aria-label="${escapeHtml(item.productNameSnapshot)}">
        <img src="${withProductImageFallback(item.selectedImageUrl || item.imageUrl || "")}" alt="${escapeHtml(item.productNameSnapshot)}" data-fallback="product" class="request-item__thumb" />
        <div class="request-item__body">
          <p class="request-item__name">${escapeHtml(item.productNameSnapshot)}</p>
          <p class="request-item__price">${pricingConfig?.pricingMode === "manual" ? `NT$${Number(item.unitPriceTwd || 0).toLocaleString("en-US")} (${srcSym}${Number(item.priceJpyTaxIn || 0).toLocaleString("en-US")})` : `${srcSym}${Number(item.priceJpyTaxIn || 0).toLocaleString("en-US")} → NT$${Number(item.unitPriceTwd || 0).toLocaleString("en-US")}`}</p>
          <div class="request-item__fields">
            <label class="request-item__field-label">數量<input type="number" min="1" data-field="quantity" value="${item.quantity || 1}" class="request-item__field-input request-item__field-input--qty" aria-label="${escapeHtml(item.productNameSnapshot)} 數量" /></label>
            ${
              Array.isArray(item.variantOptions) && item.variantOptions.length > 0
                ? `<label class="request-item__field-label">規格<select data-field="variantName" class="request-item__field-input request-item__field-input--variant" aria-label="${escapeHtml(item.productNameSnapshot)} 規格">${renderSelectOptions(
                    item.variantOptions.map((variant) => variant.name),
                    item.variantName || "",
                    "選擇規格"
                  )}</select></label>`
                : Array.isArray(item.sizeOptions) && item.sizeOptions.length > 0
                  ? `<label class="request-item__field-label">尺寸<select data-field="desiredSize" class="request-item__field-input" aria-label="${escapeHtml(item.productNameSnapshot)} 尺寸">${renderSelectOptions(
                      item.sizeOptions,
                      item.desiredSize || "",
                      "選擇"
                    )}</select></label>`
                  : `<label class="request-item__field-label">尺寸<input type="text" data-field="desiredSize" value="${item.desiredSize || ""}" placeholder="可留空" class="request-item__field-input request-item__field-input--size" aria-label="${escapeHtml(item.productNameSnapshot)} 尺寸" /></label>`
            }
          </div>
          <div class="request-item__note-row">
            <input type="text" data-field="note" value="${item.note || ""}" placeholder="備註" class="request-item__field-input request-item__field-input--note" aria-label="${escapeHtml(item.productNameSnapshot)} 備註" />
            <button type="button" class="js-remove-item request-item__remove" data-remove-idx="${idx}" aria-label="刪除 ${escapeHtml(item.productNameSnapshot)}" title="刪除">
              <svg class="request-item__remove-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
              <span class="request-item__remove-text">刪除</span>
            </button>
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
        if (field === "variantName") {
          applyVariantPricing(d.items[idx]);
        }
        setDraft(d);
        if (field === "variantName") {
          renderDraftItems();
        }
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
  // Keep step-1 summary in sync with the live draft
  updateCartReviewSummary();
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
  const checkedRadio = document.querySelector('input[name="shippingMethod"]:checked');
  const shippingMethod = shippingOptionsEnabled
    ? checkedRadio?.value || "consolidated_tw"
    : "shipping_hidden";
  const legacyId = checkedRadio?.getAttribute("data-legacy") || "";
  const customPriceAttr = checkedRadio?.getAttribute("data-price");
  const isCustomMethod = !legacyId && customPriceAttr !== null && customPriceAttr !== undefined;

  const intlShippingTwd = Number(pricingConfig?.internationalShippingTwd || 0);
  const domesticShippingTwd = Number(pricingConfig?.domesticShippingTwd || 0);
  const limitedProxyShippingTwd = Number(pricingConfig?.limitedProxyShippingTwd || 0);

  let shippingTwd = 0;
  if (!shippingOptionsEnabled) {
    shippingTwd = 0;
  } else if (isCustomMethod) {
    shippingTwd = Math.max(0, Math.round(Number(customPriceAttr) || 0));
  } else if (legacyId === "jp_direct") {
    shippingTwd = intlShippingTwd;
  } else if (legacyId === "limited_proxy") {
    shippingTwd = Math.round(limitedProxyShippingTwd);
  } else if (legacyId === "consolidated_tw") {
    shippingTwd = intlShippingTwd + Math.round(domesticShippingTwd);
  }
  const totalJpy = itemsTotalJpy;
  const totalTwd = itemsTotalTwd + shippingTwd;
  const totalJpyNode = document.getElementById("total-jpy");
  const totalTwdNode = document.getElementById("total-twd");
  const shippingTwdNode = document.getElementById("shipping-twd");
  const shippingNote = document.getElementById("shipping-note");
  if (shippingTwdNode) {
    shippingTwdNode.textContent = `運費：NT$${shippingTwd.toLocaleString("en-US")}`;
  }
  if (totalJpyNode) {
    totalJpyNode.textContent = `商品合計：\u00a5${totalJpy.toLocaleString("en-US")} / NT$${itemsTotalTwd.toLocaleString("en-US")}`;
  }
  if (totalTwdNode) {
    totalTwdNode.textContent = `合計：NT$${totalTwd.toLocaleString("en-US")}`;
  }
  if (shippingNote) {
    if (!shippingOptionsEnabled) {
      shippingNote.textContent = "運費選項目前由 Admin 隱藏，將由客服後續確認。";
    } else if (isCustomMethod) {
      shippingNote.textContent = "";
    } else if (legacyId === "jp_direct") {
      shippingNote.textContent = "提醒：日本直送需完成 EZWAY 實名驗證。";
    } else if (legacyId === "limited_proxy") {
      shippingNote.textContent = "限時連線代購：使用固定運費。";
    } else {
      shippingNote.textContent = "使用集運回台灣：含國際運費與國內 7-11 店到店。";
    }
  }

  return {
    shippingMethod,
    shippingInternationalTwd:
      legacyId === "consolidated_tw" || legacyId === "jp_direct" ? intlShippingTwd : 0,
    shippingDomesticTwd:
      legacyId === "consolidated_tw"
        ? Math.round(domesticShippingTwd)
        : isCustomMethod
          ? shippingTwd
          : 0,
    shippingTotalTwd: shippingTwd,
    requiresEzway: legacyId === "jp_direct",
    totalJpy,
    totalTwd,
  };
}

// Legacy fallback options (used when admin hasn't configured custom shippingMethods)
const LEGACY_SHIPPING_FALLBACK = [
  { id: "consolidated_tw", name: "集運回台灣", desc: "國際運費 + 國內 7-11 店到店｜預估 NT$150–350 依重量", legacy: true },
  { id: "jp_direct", name: "日本直送", desc: "僅國際運費｜預估 NT$300–800 依重量｜需完成 EZWAY 驗證", legacy: true },
  { id: "limited_proxy", name: "限時連線代購", desc: "固定運費 NT$200", legacy: true },
];

function getActiveShippingMethods() {
  const ds = window.__DISPLAY_SETTINGS || {};
  const list = Array.isArray(ds.shippingMethods) ? ds.shippingMethods : [];
  const enabled = list
    .filter((m) => m && m.enabled !== false && String(m.name || "").trim())
    .map((m) => ({
      id: String(m.name).trim(),
      name: String(m.name).trim(),
      desc: String(m.desc || "").trim(),
      price: Number.isFinite(Number(m.price)) ? Number(m.price) : 0,
      type: String(m.type || "").trim(),
    }));
  return enabled.length > 0 ? enabled : LEGACY_SHIPPING_FALLBACK;
}

function renderShippingOptions() {
  const list = document.getElementById("shipping-options-list");
  if (!list) return;
  const methods = getActiveShippingMethods();
  list.innerHTML = methods
    .map((m, idx) => {
      const checked = idx === 0 ? "checked" : "";
      const priceTag = !m.legacy
        ? `<span class="shipping-option__price">NT$${(m.price || 0).toLocaleString("en-US")}</span>`
        : "";
      const dataPrice = !m.legacy ? ` data-price="${m.price || 0}"` : "";
      const dataLegacy = m.legacy ? ` data-legacy="${escapeHtml(m.id)}"` : "";
      const dataType = m.type ? ` data-type="${escapeHtml(m.type)}"` : "";
      const descHtml = m.desc ? `<span class="meta">${escapeHtml(m.desc)}</span>` : "";
      return `<label class="shipping-option">
        <input type="radio" name="shippingMethod" value="${escapeHtml(m.id)}"${dataPrice}${dataLegacy}${dataType} ${checked} />
        <span>
          <strong>${escapeHtml(m.name)}</strong>${priceTag}
          ${descHtml}
        </span>
      </label>`;
    })
    .join("");
  // Re-bind change listener so totals update on selection
  list.querySelectorAll('input[name="shippingMethod"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      renderTotals();
      applyCvsPickerVisibility();
    });
  });
  applyCvsPickerVisibility();
}

// ── CVS store picker (7-11 / FamilyMart) ──
const CVS_DATA_URLS = {
  "cvs-711": "/assets/data/cvs-711.json",
  "cvs-family": "/assets/data/cvs-family.json",
};
const cvsCache = {}; // cache loaded JSON per type
let cvsSelectedStore = null; // { id, name, address, city, area, type }
let cvsSearchTimer = null;

function getSelectedShippingType() {
  const checked = document.querySelector('input[name="shippingMethod"]:checked');
  return checked?.getAttribute("data-type") || "";
}

async function loadCvsData(type) {
  if (cvsCache[type]) return cvsCache[type];
  const url = CVS_DATA_URLS[type];
  if (!url) return [];
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const data = await res.json();
  cvsCache[type] = Array.isArray(data) ? data : [];
  return cvsCache[type];
}

function applyCvsPickerVisibility() {
  const picker = document.getElementById("cvs-picker");
  if (!picker) return;
  const type = getSelectedShippingType();
  const isCvs = type === "cvs-711" || type === "cvs-family";
  picker.hidden = !isCvs;
  // Reset on each switch — selection is per-method
  cvsSelectedStore = null;
  const sel = document.getElementById("cvs-picker-selected");
  if (sel) { sel.hidden = true; sel.innerHTML = ""; }
  const results = document.getElementById("cvs-picker-results");
  if (results) { results.hidden = true; results.innerHTML = ""; }
  const search = document.getElementById("cvs-search");
  if (search) search.value = "";
  const status = document.getElementById("cvs-picker-status");
  if (status) status.textContent = isCvs ? "" : "";

  if (isCvs) {
    // Pre-warm the JSON so the first keystroke is fast
    loadCvsData(type).catch((err) => {
      if (status) status.textContent = "門市資料載入失敗，請稍後再試";
    });
  }
}

function renderCvsResults(matches, type) {
  const results = document.getElementById("cvs-picker-results");
  if (!results) return;
  if (matches.length === 0) {
    results.innerHTML = `<p class="meta cvs-picker__empty">查無門市，請換個關鍵字</p>`;
    results.hidden = false;
    return;
  }
  const limited = matches.slice(0, 30);
  results.innerHTML = limited
    .map(
      (s) =>
        `<button type="button" class="cvs-picker__item" data-id="${escapeHtml(s.id)}">
          <strong>${escapeHtml(s.name)}</strong>
          <span class="meta">#${escapeHtml(s.id)}｜${escapeHtml(s.address)}</span>
        </button>`
    )
    .join("");
  if (matches.length > 30) {
    results.innerHTML += `<p class="meta cvs-picker__more">還有 ${matches.length - 30} 筆，請輸入更精確的關鍵字</p>`;
  }
  results.hidden = false;
  results.querySelectorAll(".cvs-picker__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const store = (cvsCache[type] || []).find((s) => s.id === id);
      if (!store) return;
      cvsSelectedStore = { ...store, type };
      results.hidden = true;
      results.innerHTML = "";
      const sel = document.getElementById("cvs-picker-selected");
      const search = document.getElementById("cvs-search");
      if (sel) {
        const chainLabel = type === "cvs-711" ? "7-11" : "全家";
        sel.innerHTML = `已選擇：<strong>${escapeHtml(chainLabel)}・${escapeHtml(store.name)}</strong>（#${escapeHtml(store.id)}）<br><span class="meta">${escapeHtml(store.address)}</span>
          <button type="button" class="cvs-picker__clear" id="cvs-picker-clear">變更門市</button>`;
        sel.hidden = false;
      }
      if (search) search.value = "";
      const clearBtn = document.getElementById("cvs-picker-clear");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          cvsSelectedStore = null;
          if (sel) { sel.hidden = true; sel.innerHTML = ""; }
        });
      }
    });
  });
}

function bindCvsSearch() {
  const search = document.getElementById("cvs-search");
  if (!search || search.dataset.bound === "1") return;
  search.dataset.bound = "1";
  search.addEventListener("input", () => {
    clearTimeout(cvsSearchTimer);
    cvsSearchTimer = setTimeout(async () => {
      const type = getSelectedShippingType();
      if (type !== "cvs-711" && type !== "cvs-family") return;
      const q = search.value.trim().toLowerCase();
      const status = document.getElementById("cvs-picker-status");
      if (q.length < 1) {
        const results = document.getElementById("cvs-picker-results");
        if (results) { results.hidden = true; results.innerHTML = ""; }
        if (status) status.textContent = "";
        return;
      }
      try {
        const data = await loadCvsData(type);
        const matches = data.filter((s) => {
          const name = (s.name || "").toLowerCase();
          const id = (s.id || "").toLowerCase();
          const addr = (s.address || "").toLowerCase();
          const city = (s.city || "").toLowerCase();
          const area = (s.area || "").toLowerCase();
          return (
            name.includes(q) ||
            id.includes(q) ||
            addr.includes(q) ||
            city.includes(q) ||
            area.includes(q)
          );
        });
        if (status) status.textContent = `共 ${matches.length} 筆符合`;
        renderCvsResults(matches, type);
      } catch {
        if (status) status.textContent = "搜尋失敗，請重新整理頁面";
      }
    }, 220);
  });
}

function applyShippingOptionsVisibility() {
  const box = document.getElementById("shipping-options-box");
  const radios = document.querySelectorAll('input[name="shippingMethod"]');
  // If admin configured any custom shippingMethods, always show — that toggle
  // only governed the legacy 3-option flow.
  const ds = window.__DISPLAY_SETTINGS || {};
  const hasCustom =
    Array.isArray(ds.shippingMethods) &&
    ds.shippingMethods.some(
      (m) => m && m.enabled !== false && String(m?.name || "").trim()
    );
  const enabled = hasCustom || pricingConfig?.shippingOptionsEnabled !== false;
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
    const hasVariants = Array.isArray(item.variantOptions) && item.variantOptions.length > 0;
    if (hasVariants || (hasSize && hasColor)) {
      continue;
    }
    const res = await apiFetch(`/api/product?code=${encodeURIComponent(item.code)}`);
    if (!res.ok) {
      continue;
    }
    const body = await res.json();
    const product = body?.product;
    if (!product) {
      continue;
    }
    const variantOptions = normalizeVariantOptions(product.variants);
    const sizeOptions = Array.isArray(product.sizeOptions) ? product.sizeOptions.filter(Boolean) : [];
    const colorOptions = Array.isArray(product.colorOptions) ? product.colorOptions.filter(Boolean) : [];
    if (variantOptions.length > 0) {
      item.variantOptions = variantOptions;
      item.variantName = item.variantName || variantOptions[0].name;
      applyVariantPricing(item);
      changed = true;
    } else if (!item.priceJpyTaxIn || !item.unitPriceTwd) {
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
      const x1 = Math.floor(Math.random() * 110);
      const x2 = Math.floor(Math.random() * 110);
      const y1 = Math.floor(Math.random() * 50);
      const y2 = Math.floor(Math.random() * 50);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9ca8b8" stroke-width="1" />`;
    })
    .join("");
  svg.innerHTML = `
    <rect x="0" y="0" width="110" height="50" fill="#f3f6fb" />
    ${lines}
    <text x="10" y="34" font-size="22" font-family="monospace" fill="#1a355a" letter-spacing="2">${currentCaptchaCode}</text>
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
  if (!payload.shippingMethod || !String(payload.shippingMethod).trim()) {
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
  const cvsType = getSelectedShippingType();
  const isCvsMethod = cvsType === "cvs-711" || cvsType === "cvs-family";
  if (isCvsMethod && !cvsSelectedStore) {
    showError("請於下方搜尋並選擇取貨門市");
    return;
  }
  let recipientCity = document.getElementById("recipientCity")?.value || "";
  let recipientAddress = document.getElementById("recipientAddress")?.value || "";
  if (isCvsMethod && cvsSelectedStore) {
    const chainLabel = cvsType === "cvs-711" ? "7-11" : "全家";
    recipientCity = cvsSelectedStore.city || recipientCity;
    recipientAddress = `[${chainLabel} ${cvsSelectedStore.name} #${cvsSelectedStore.id}] ${cvsSelectedStore.address}`;
  }
  const payload = {
    memberName: document.getElementById("memberName")?.value || "",
    memberPhone: document.getElementById("memberPhone")?.value || "",
    recipientCity,
    recipientAddress,
    lineId: document.getElementById("lineId")?.value || "",
    cvsStore: isCvsMethod && cvsSelectedStore
      ? {
          chain: cvsType === "cvs-711" ? "7-11" : "family",
          id: cvsSelectedStore.id,
          name: cvsSelectedStore.name,
          address: cvsSelectedStore.address,
        }
      : null,
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
      variantName: item.variantName || "",
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

  const submitBtn = document.getElementById("submit-btn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "送出中...";
  }

  try {
    const res = await apiFetch("/api/requirements", {
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
    const code = body.orderCode || String(body.requirementId);
    location.href = `${window.__API_BASE || ""}/success.html?id=${encodeURIComponent(String(body.requirementId))}&code=${encodeURIComponent(code)}`;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "送出訂單";
    }
  }
}

async function bootstrap() {
  const pricingRes = await apiFetch("/api/pricing");
  const pricingBody = pricingRes.ok ? await pricingRes.json() : null;
  pricingConfig = pricingBody?.pricing || DEFAULT_PRICING;

  renderCityOptions();
  await hydrateDraftWithOptions();
  renderDraftItems();
  renderTotals();
  const refreshBtn = document.getElementById("captcha-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshCaptcha();
      // Restart spin animation by re-toggling the class
      refreshBtn.classList.remove("is-spinning");
      void refreshBtn.offsetWidth;
      refreshBtn.classList.add("is-spinning");
    });
  }
  refreshCaptcha();
  // Render shipping radios from admin-configured shippingMethods (or legacy fallback)
  renderShippingOptions();
  applyShippingOptionsVisibility();
  bindCvsSearch();
  renderTotals();
  const form = document.getElementById("request-form");
  if (form) {
    form.addEventListener("submit", onSubmit);
  }
  initStepFlow();
}

// ── Two-step UX: cart review → fill info ──
function updateCartReviewSummary() {
  const summary = document.getElementById("cart-review-summary");
  if (!summary) return;
  const draft = getDraft();
  const itemCount = draft.items.reduce((n, it) => n + Number(it.quantity || 1), 0);
  const itemsTotalTwd = draft.items.reduce(
    (sum, it) => sum + Number(it.unitPriceTwd || 0) * Number(it.quantity || 1),
    0
  );
  if (itemCount === 0) {
    summary.innerHTML = `<span>購物車是空的</span>`;
    return;
  }
  summary.innerHTML = `<span>共 ${itemCount} 件商品</span><strong>NT$${itemsTotalTwd.toLocaleString("en-US")}</strong>`;
}

function setStep(step) {
  const cartReview = document.getElementById("cart-review");
  const form = document.getElementById("request-form");
  const items = document.querySelectorAll(".request-steps__item");
  if (step === 1) {
    if (cartReview) cartReview.hidden = false;
    if (form) form.hidden = true;
  } else {
    if (cartReview) cartReview.hidden = true;
    if (form) form.hidden = false;
  }
  items.forEach((node) => {
    const n = Number(node.getAttribute("data-step"));
    node.classList.toggle("is-active", n === step);
    node.classList.toggle("is-done", n < step);
  });
  // Smooth scroll to top so users see step change context
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initStepFlow() {
  updateCartReviewSummary();
  const nextBtn = document.getElementById("next-step-btn");
  const prevBtn = document.getElementById("prev-step-btn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const draft = getDraft();
      if (!draft.items || draft.items.length === 0) {
        showError("購物車是空的，請先加入商品");
        return;
      }
      setStep(2);
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      updateCartReviewSummary();
      setStep(1);
    });
  }
  // When draft updates (item add/remove/quantity change), refresh summary
  const wrapper = document.getElementById("request-items");
  if (wrapper) {
    new MutationObserver(updateCartReviewSummary).observe(wrapper, {
      childList: true,
      subtree: true,
    });
  }
  setStep(1);
}

bootstrap();
