import { addItem, getDraft } from "./draft-store.js";
import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";
const _cc = window.__COUNTRY_CONFIG || {};
const DEFAULT_PRICING = { markupJpy: 1000, jpyToTwd: _cc.defaultRate || 0.21 };

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
  const markup = Number(pricing?.markupJpy ?? DEFAULT_PRICING.markupJpy);
  const rate = Number(pricing?.jpyToTwd ?? DEFAULT_PRICING.jpyToTwd);
  const src = Math.round(base + (Number.isFinite(markup) ? markup : DEFAULT_PRICING.markupJpy));
  const twd = Math.round(src * (Number.isFinite(rate) ? rate : DEFAULT_PRICING.jpyToTwd));
  return { src, twd };
}

function fmtSrcPrice(val) {
  if (val === null) return "";
  const sym = (_cc.currencySymbol || "¥");
  return `${sym}${val.toLocaleString("en-US")}`;
}

function renderProduct(item, pricing) {
  const title = item.nameZhTw || item.nameJa || "未命名商品";
  const mainImage = withProductImageFallback(item.mainImageUrl || item.displayImageUrl || item.imageUrl || "");
  const images = Array.isArray(item.gallery) && item.gallery.length > 0 ? item.gallery : [mainImage];

  const main = document.getElementById("detail-main-image");
  if (main && images[0]) {
    main.src = images[0];
    main.alt = title;
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
      priceBlock.innerHTML =
        `<p class="detail-price-twd">NT$${adjusted.twd.toLocaleString("en-US")}</p>` +
        `<p class="detail-price-jpy">${fmtSrcPrice(adjusted.src)}（含代購費）</p>`;
    } else {
      priceBlock.innerHTML = `<p class="detail-price-twd">價格未提供</p>`;
    }
  }

  bindText("detail-category", `分類：${item.category || "未分類"}`);
  bindText("detail-color-count", `顏色數：${item.colorCount ?? "-"}`);
  bindText(
    "detail-size-options",
    `尺寸：${
      Array.isArray(item.sizeOptions) && item.sizeOptions.length > 0
        ? item.sizeOptions.join(" / ")
        : "未提供"
    }`
  );
  bindText(
    "detail-color-options",
    `顏色：${
      Array.isArray(item.colorOptions) && item.colorOptions.length > 0
        ? item.colorOptions.join(" / ")
        : "未提供"
    }`
  );
  bindText("detail-description", item.description || "");

  const specList = document.getElementById("detail-spec-list");
  if (specList) {
    const specs = item.specifications || {};
    const specRows = [
      ["商品編號", specs.code || item.code || "-"],
      ["品牌", specs.brand || item.brand || "-"],
      ["分類", specs.category || item.category || "-"],
      ["色數", specs.colorCount ?? item.colorCount ?? "-"],
    ];
    specList.innerHTML = specRows.map(([k, v]) => `<li>${k}：${v}</li>`).join("");
  }

  // Quantity stepper
  initQuantityStepper();

  // Add to cart with delight
  const addButton = document.getElementById("detail-add");
  const qtyInput = document.getElementById("detail-quantity");
  if (addButton) {
    addButton.addEventListener("click", () => {
      const quantity = Math.max(1, Number(qtyInput?.value || 1));
      const selectedImageUrl = main?.src || images[0] || mainImage;
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
  countNode.textContent = String(getDraft().items.length);
}

function initBackLink() {
  const link = document.getElementById("detail-back-link");
  if (!(link instanceof HTMLAnchorElement)) {
    return;
  }
  const returnTo = (new URL(location.href).searchParams.get("returnTo") || "").trim();
  if (!returnTo.startsWith("/")) {
    return;
  }
  link.href = returnTo;
}

async function bootstrap() {
  renderDraftCount();
  initBackLink();
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
