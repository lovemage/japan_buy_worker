import { addItem, getDraft } from "./draft-store.js";
import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";
const _cc = window.__COUNTRY_CONFIG || {};
const DEFAULT_PRICING = { markupJpy: 1000, markupMode: "flat", markupPercent: 15, jpyToTwd: _cc.defaultRate || 0.21 };

function setError(message) {
  const node = document.getElementById("detail-error");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove("hidden");
}

function calcAdjustedPrices(basePrice, pricing) {
  const base = Number(basePrice);
  if (!Number.isFinite(base)) {
    return { src: null, twd: null };
  }

  if (pricing?.pricingMode === "manual") {
    const rate = Number(pricing?.jpyToTwd ?? DEFAULT_PRICING.jpyToTwd);
    const src = (Number.isFinite(rate) && rate > 0) ? Math.round(base / rate) : null;
    return { src, twd: Math.round(base) };
  }

  const mode = pricing?.markupMode || DEFAULT_PRICING.markupMode;
  const rate = Number(pricing?.jpyToTwd ?? DEFAULT_PRICING.jpyToTwd);

  if (mode === "percent") {
    const pct = Number(pricing?.markupPercent ?? DEFAULT_PRICING.markupPercent);
    const twd = Math.round(base * (Number.isFinite(rate) ? rate : DEFAULT_PRICING.jpyToTwd) * (1 + (Number.isFinite(pct) ? pct : DEFAULT_PRICING.markupPercent) / 100));
    return { src: base, twd };
  }

  const markup = Number(pricing?.markupJpy ?? DEFAULT_PRICING.markupJpy);
  const src = Math.round(base + (Number.isFinite(markup) ? markup : DEFAULT_PRICING.markupJpy));
  const twd = Math.round(src * (Number.isFinite(rate) ? rate : DEFAULT_PRICING.jpyToTwd));
  return { src, twd };
}

function fmtSrcPrice(val) {
  if (val === null) return "";
  const sym = (window.__COUNTRY_CONFIG || _cc).currencySymbol || "¥";
  return `${sym}${val.toLocaleString("en-US")}`;
}

function normalizeVariants(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      const stock = Number(item.stock);
      const price = item.price === null || item.price === undefined || item.price === ""
        ? null
        : Number(item.price);
      if (!name) return null;
      return {
        name,
        stock: Number.isFinite(stock) && stock >= 0 ? Math.round(stock) : 0,
        price: Number.isFinite(price) && price >= 0 ? Math.round(price) : null,
      };
    })
    .filter(Boolean);
}

function renderProduct(item, pricing) {
  const title = item.nameZhTw || item.nameJa || "未命名商品";
  const mainImage = withProductImageFallback(item.mainImageUrl || item.displayImageUrl || item.imageUrl || "");
  const images = Array.isArray(item.gallery) && item.gallery.length > 0 ? item.gallery : [mainImage];
  const variants = normalizeVariants(item.variants);

  const main = document.getElementById("detail-main-image");
  const mainWrap = document.getElementById("detail-main-wrap");
  if (main && images[0]) {
    main.src = images[0];
    main.alt = title;
    main.addEventListener("load", () => { if (mainWrap) mainWrap.classList.add("is-loaded"); }, { once: true });
    main.addEventListener("error", () => { if (mainWrap) mainWrap.classList.add("is-loaded"); }, { once: true });
  }

  const gallery = document.getElementById("detail-gallery");
  if (gallery) {
    gallery.innerHTML = images
      .filter(Boolean)
      .map(
        (img, idx) =>
          `<button class="detail-thumb-btn ${idx === 0 ? "is-active" : ""}" type="button" data-image="${img}">
            <img src="${withProductImageFallback(img)}" alt="${title}" class="detail-thumb" data-fallback="product" />
          </button>`
      )
      .join("");
    gallery.querySelectorAll(".detail-thumb-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const image = button.getAttribute("data-image");
        if (!main || !image) {
          return;
        }
        // Crossfade animation on image switch
        main.classList.add("is-switching");
        main.src = image;
        main.addEventListener("animationend", () => {
          main.classList.remove("is-switching");
        }, { once: true });
        gallery.querySelectorAll(".detail-thumb-btn").forEach((node) => {
          node.classList.remove("is-active");
        });
        button.classList.add("is-active");
      });
    });
  }
  if (main) {
    main.setAttribute("data-fallback", "product");
  }
  applyProductImageFallback();

  const bindText = (id, text) => {
    const node = document.getElementById(id);
    if (node) {
      node.textContent = text;
    }
  };

  bindText("detail-title", title);
  bindText("detail-brand", item.brand || "未提供");

  // Price block with prominent TWD
  const adjusted = calcAdjustedPrices(item.priceJpyTaxIn, pricing);
  const priceBlock = document.getElementById("detail-price");
  if (priceBlock) {
    if (adjusted.twd !== null) {
      let subLine = "";
      if (adjusted.src !== null) {
        subLine = pricing?.pricingMode === "manual"
          ? `<p class="detail-price-jpy">${fmtSrcPrice(adjusted.src)}</p>`
          : `<p class="detail-price-jpy">${fmtSrcPrice(adjusted.src)}（含代購費）</p>`;
      }
      priceBlock.innerHTML =
        `<p class="detail-price-twd">NT$${adjusted.twd.toLocaleString("en-US")}</p>` + subLine;
    } else {
      priceBlock.innerHTML = `<p class="detail-price-twd">價格未提供</p>`;
    }
  }

  bindText("detail-category", `分類：${item.category || "未分類"}`);
  bindText("detail-color-count", `顏色數：${item.colorCount ?? "-"}`);
  bindText("detail-description", item.description || "");

  const specList = document.getElementById("detail-spec-list");
  if (specList) {
    const specifications = item.specifications || {};
    const baseRows = [
      ["商品編號", specifications.code || item.code || ""],
      ["品牌", specifications.brand || item.brand || ""],
      ["分類", specifications.category || item.category || ""],
      ["色數", specifications.colorCount ?? item.colorCount ?? ""],
    ].filter(([, v]) => v && v !== "");
    const extraSpecs = item.specs && typeof item.specs === "object" ? item.specs : {};
    const extraRows = Object.entries(extraSpecs)
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k, v]) => [k, v]);
    const allRows = [...baseRows, ...extraRows];
    specList.innerHTML = allRows.length > 0
      ? allRows.map(([k, v]) => `<li>${k}：${v}</li>`).join("")
      : "<li>暫無規格資訊</li>";
  }

  // Quantity stepper
  initQuantityStepper();

  const variantBox = document.getElementById("detail-variant-box");
  const variantSelect = document.getElementById("detail-variant-select");
  const variantStock = document.getElementById("detail-variant-stock");
  let selectedVariant = variants[0] || null;

  const renderPriceBlock = () => {
    const effectiveBase = selectedVariant?.price ?? item.priceJpyTaxIn;
    const adjusted = calcAdjustedPrices(effectiveBase, pricing);
    if (priceBlock) {
      if (adjusted.twd !== null) {
        let subLine = "";
        if (adjusted.src !== null) {
          subLine = pricing?.pricingMode === "manual"
            ? `<p class="detail-price-jpy">${fmtSrcPrice(adjusted.src)}</p>`
            : `<p class="detail-price-jpy">${fmtSrcPrice(adjusted.src)}（含代購費）</p>`;
        }
        priceBlock.innerHTML =
          `<p class="detail-price-twd">NT$${adjusted.twd.toLocaleString("en-US")}</p>` + subLine;
      } else {
        priceBlock.innerHTML = `<p class="detail-price-twd">價格未提供</p>`;
      }
    }
    return adjusted;
  };

  if (variantBox && variantSelect) {
    if (variants.length > 0) {
      variantBox.classList.remove("hidden");
      variantSelect.innerHTML = variants
        .map((variant, idx) => {
          const base = variant.price ?? item.priceJpyTaxIn;
          const adjusted = calcAdjustedPrices(base, pricing);
          const twdText = adjusted.twd !== null ? `NT$${adjusted.twd.toLocaleString("en-US")}` : "價格未提供";
          return `<option value="${variant.name}" ${idx === 0 ? "selected" : ""}>${variant.name}｜${twdText}</option>`;
        })
        .join("");
      const syncVariantMeta = () => {
        selectedVariant = variants.find((variant) => variant.name === variantSelect.value) || variants[0] || null;
        if (variantStock) {
          variantStock.textContent = selectedVariant ? `剩餘數量：${selectedVariant.stock}` : "";
        }
        renderPriceBlock();
      };
      variantSelect.addEventListener("change", syncVariantMeta);
      syncVariantMeta();
    } else {
      variantBox.classList.add("hidden");
    }
  }

  // Add to cart with delight
  const addButton = document.getElementById("detail-add");
  const qtyInput = document.getElementById("detail-quantity");
  if (addButton) {
    addButton.addEventListener("click", () => {
      const quantity = Math.max(1, Number(qtyInput?.value || 1));
      const selectedImageUrl = main?.src || images[0] || mainImage;
      const adjusted = renderPriceBlock();
      addItem({
        productId: item.id,
        code: item.code || "",
        productNameSnapshot: title,
        imageUrl: mainImage,
        selectedImageUrl,
        quantity,
        priceJpyTaxIn: adjusted.src,
        unitPriceTwd: adjusted.twd,
        sizeOptions: Array.isArray(item.sizeOptions) ? item.sizeOptions : [],
        colorOptions: Array.isArray(item.colorOptions) ? item.colorOptions : [],
        variantName: selectedVariant?.name || "",
        variantPriceJpyTaxIn: adjusted.src,
        variantUnitPriceTwd: adjusted.twd,
        variantOptions: variants,
      });
      renderDraftCount();
      bumpFloatingButton();

      // Animated check feedback
      addButton.classList.add("is-added");
      addButton.setAttribute("disabled", "true");
      setTimeout(() => {
        addButton.classList.remove("is-added");
        addButton.removeAttribute("disabled");
      }, 1400);
    });
  }

  // Trigger entrance animation
  const article = document.getElementById("product-detail");
  if (article) {
    requestAnimationFrame(() => {
      article.classList.add("is-loaded");
    });
  }
}

function initQuantityStepper() {
  const input = document.getElementById("detail-quantity");
  const minus = document.getElementById("qty-minus");
  const plus = document.getElementById("qty-plus");
  if (!input) {
    return;
  }
  const update = (delta) => {
    const current = Math.max(1, Number(input.value || 1));
    input.value = String(Math.max(1, current + delta));
  };
  if (minus) {
    minus.addEventListener("click", () => update(-1));
  }
  if (plus) {
    plus.addEventListener("click", () => update(1));
  }
}

function bumpFloatingButton() {
  const btn = document.querySelector(".floating-request-btn");
  if (!btn) {
    return;
  }
  btn.classList.remove("is-bumped");
  void btn.offsetWidth;
  btn.classList.add("is-bumped");
  btn.addEventListener("animationend", () => {
    btn.classList.remove("is-bumped");
  }, { once: true });
}

function renderDraftCount() {
  const countNode = document.getElementById("floating-draft-count");
  if (!countNode) {
    return;
  }
  const count = getDraft().items.length;
  countNode.textContent = String(count);
  countNode.style.display = count > 0 ? "" : "none";
}

async function bootstrap() {
  renderDraftCount();
  const pricingRes = await apiFetch("/api/pricing");
  const pricingBody = pricingRes.ok ? await pricingRes.json() : null;
  const pricing = pricingBody?.pricing || DEFAULT_PRICING;

  const url = new URL(location.href);
  const code = (url.searchParams.get("code") || "").trim();
  if (!code) {
    setError("缺少商品代碼");
    return;
  }

  const res = await apiFetch(`/api/product?code=${encodeURIComponent(code)}`);
  if (!res.ok) {
    setError(`商品載入失敗：${res.status}`);
    return;
  }
  const body = await res.json();
  if (!body.ok || !body.product) {
    setError("商品載入失敗");
    return;
  }
  renderProduct(body.product, pricing);
}

bootstrap();
