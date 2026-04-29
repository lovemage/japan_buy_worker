import { addItem, getDraft } from "./draft-store.js";
import { applyProductImageFallback, withProductImageFallback, PRODUCT_PLACEHOLDER } from "./image-fallback.js";
const _cc = window.__COUNTRY_CONFIG || {};
const DEFAULT_PRICING = { markupJpy: 1000, markupMode: "flat", markupPercent: 15, jpyToTwd: _cc.defaultRate || 0.21 };

function preloadImages(urls) {
  return Promise.all(
    urls.map((url) => new Promise((resolve) => {
      if (!url) { resolve({ url, ok: false }); return; }
      const img = new Image();
      let settled = false;
      const finish = (ok) => { if (settled) return; settled = true; resolve({ url, ok }); };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = url;
      // Safety timeout — don't block UI on stuck images
      setTimeout(() => finish(false), 5000);
    }))
  );
}

function isTwdSource() {
  const cc = window.__COUNTRY_CONFIG || _cc || {};
  return String(cc.currency || "").toUpperCase() === "TWD";
}

function renderPriceHtml(adjusted, pricing) {
  if (adjusted.twd === null) {
    return `<p class="detail-price-twd"><span class="detail-price-amount">價格未提供</span></p>`;
  }
  const mainLine =
    `<p class="detail-price-twd">` +
      `<span class="detail-price-symbol">NT$</span>` +
      `<span class="detail-price-amount">${adjusted.twd.toLocaleString("en-US")}</span>` +
    `</p>`;
  // Hide secondary src-currency line when source = TWD (avoid two NT$ prices)
  if (isTwdSource() || adjusted.src === null) return mainLine;
  const isManual = pricing?.pricingMode === "manual";
  const note = isManual ? "" : `<span class="detail-price-note">含代購費</span>`;
  return mainLine + `<p class="detail-price-jpy">${fmtSrcPrice(adjusted.src)}${note}</p>`;
}

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

async function renderProduct(item, pricing) {
  const title = item.nameZhTw || item.nameJa || "未命名商品";
  const mainImage = withProductImageFallback(item.mainImageUrl || item.displayImageUrl || item.imageUrl || "");
  const gallerySource = Array.isArray(item.gallery) && item.gallery.length > 0
    ? item.gallery.filter(Boolean)
    : [mainImage];
  // Normalize gallery URLs (apply API base prefix + fallback) once, upfront
  let galleryUrls = gallerySource.map(withProductImageFallback);
  if (galleryUrls.length === 0) galleryUrls = [PRODUCT_PLACEHOLDER];
  const variants = normalizeVariants(item.variants);

  const main = document.getElementById("detail-main-image");
  const mainWrap = document.getElementById("detail-main-wrap");
  const gallery = document.getElementById("detail-gallery");
  // Track first thumbnail URL for cart fallback (resolved after preload)
  let firstResolvedUrl = mainImage;

  const bindText = (id, text) => {
    const node = document.getElementById(id);
    if (node) {
      node.textContent = text;
    }
  };

  bindText("detail-title", title);
  bindText("detail-brand", item.brand || "未提供");
  initShareButton(item, title);

  // Price block with prominent TWD
  const adjusted = calcAdjustedPrices(item.priceJpyTaxIn, pricing);
  const priceBlock = document.getElementById("detail-price");
  if (priceBlock) priceBlock.innerHTML = renderPriceHtml(adjusted, pricing);

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
  let selectedVariant = null;

  const clearVariantError = () => {
    variantBox?.classList.remove("detail-variant-box--error");
    variantSelect?.classList.remove("detail-variant-select--error");
  };

  const showVariantError = () => {
    variantBox?.classList.add("detail-variant-box--error");
    variantSelect?.classList.add("detail-variant-select--error");
    if (variantStock) {
      variantStock.textContent = "請先選擇規格";
    }
  };

  const renderPriceBlock = () => {
    const effectiveBase = selectedVariant?.price ?? item.priceJpyTaxIn;
    const adjusted = calcAdjustedPrices(effectiveBase, pricing);
    if (priceBlock) priceBlock.innerHTML = renderPriceHtml(adjusted, pricing);
    return adjusted;
  };

  if (variantBox && variantSelect) {
    if (variants.length > 0) {
      variantBox.classList.remove("hidden");
      variantSelect.innerHTML = [`<option value="" selected>(無選擇)</option>`, ...variants
        .map((variant) => {
          const base = variant.price ?? item.priceJpyTaxIn;
          const adjusted = calcAdjustedPrices(base, pricing);
          const twdText = adjusted.twd !== null ? `NT$${adjusted.twd.toLocaleString("en-US")}` : "價格未提供";
          return `<option value="${variant.name}">${variant.name}｜${twdText}</option>`;
        })].join("");
      const syncVariantMeta = () => {
        selectedVariant = variants.find((variant) => variant.name === variantSelect.value) || null;
        if (variantStock) {
          variantStock.textContent = selectedVariant ? `剩餘數量：${selectedVariant.stock}` : "請先選擇規格";
        }
        if (selectedVariant) clearVariantError();
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
      if (variants.length > 0 && !selectedVariant) {
        showVariantError();
        return;
      }
      const quantity = Math.max(1, Number(qtyInput?.value || 1));
      const selectedImageUrl = main?.src || firstResolvedUrl || mainImage;
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

  // Trigger entrance animation immediately so text/title slides in
  // (image area shows loading bar until preload completes below)
  const article = document.getElementById("product-detail");
  if (article) {
    requestAnimationFrame(() => {
      article.classList.add("is-loaded");
    });
  }

  // Preload all gallery images so the actual <img> elements appear instantly
  // from cache — prevents the flash of 4 broken/404 icons before bytes arrive.
  const preloadResults = await preloadImages(galleryUrls);
  const finalUrls = preloadResults.map((r) => (r.ok ? r.url : PRODUCT_PLACEHOLDER));
  firstResolvedUrl = finalUrls[0] || mainImage;

  if (main && finalUrls[0]) {
    main.src = finalUrls[0];
    main.alt = title;
    main.setAttribute("data-fallback", "product");
    if (mainWrap) mainWrap.classList.add("is-loaded");
  }

  if (gallery) {
    gallery.innerHTML = finalUrls
      .map(
        (img, idx) =>
          `<button class="detail-thumb-btn ${idx === 0 ? "is-active" : ""}" type="button" data-image="${img}">
            <img src="${img}" alt="${title}" class="detail-thumb" data-fallback="product" />
          </button>`
      )
      .join("");
    gallery.querySelectorAll(".detail-thumb-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const image = button.getAttribute("data-image");
        if (!main || !image) return;
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
  applyProductImageFallback();
}

function initShareButton(item, title) {
  const btn = document.getElementById("detail-share-btn");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  const shareData = () => ({
    title,
    text: item.brand ? `${item.brand}｜${title}` : title,
    url: location.href,
  });

  const showCopiedFeedback = () => {
    btn.classList.add("is-copied");
    btn.setAttribute("aria-label", "已複製連結");
    setTimeout(() => {
      btn.classList.remove("is-copied");
      btn.setAttribute("aria-label", "分享商品");
    }, 1800);
  };

  btn.addEventListener("click", async () => {
    const data = shareData();
    // Prefer native Web Share API on mobile / supported browsers
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; // user cancelled the share sheet
        // any other error: fall through to clipboard fallback
      }
    }
    // Fallback: copy URL to clipboard
    try {
      await navigator.clipboard.writeText(data.url);
      showCopiedFeedback();
    } catch {
      // last-ditch fallback for very old browsers
      try { window.prompt("複製此商品網址：", data.url); } catch {}
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch] || ch));
}

async function loadRecommendations(currentItem, pricing) {
  const section = document.getElementById("recommendations-section");
  const list = document.getElementById("recommendations-list");
  if (!section || !list) return;

  const params = new URLSearchParams({ excludeCode: currentItem.code || "", limit: "10" });
  if (currentItem.category) params.set("category", currentItem.category);

  let products = [];
  try {
    const res = await apiFetch(`/api/product-recommendations?${params.toString()}`);
    if (!res.ok) return;
    const body = await res.json();
    if (!body.ok) return;
    products = Array.isArray(body.products) ? body.products : [];
  } catch {
    return;
  }
  if (products.length === 0) return;

  const baseHref = window.__API_BASE || "";
  list.innerHTML = products
    .map((p) => {
      const title = p.nameZhTw || p.nameJa || "未命名";
      const adjusted = calcAdjustedPrices(p.priceJpyTaxIn, pricing);
      const priceStr = adjusted.twd !== null ? `NT$${adjusted.twd.toLocaleString("en-US")}` : "-";
      const firstImg = (Array.isArray(p.gallery) && p.gallery[0]) || p.displayImageUrl || p.imageUrl || "";
      const imgUrl = withProductImageFallback(firstImg);
      const safeTitle = escapeHtml(title);
      return `<a class="rec-card" href="${baseHref}/product?code=${encodeURIComponent(p.code)}" role="listitem">
        <div class="rec-card__media"><img src="${imgUrl}" alt="${safeTitle}" loading="lazy" data-fallback="product" /></div>
        <div class="rec-card__body">
          <p class="rec-card__title">${safeTitle}</p>
          <p class="rec-card__price">${priceStr}</p>
        </div>
      </a>`;
    })
    .join("");

  applyProductImageFallback(list);
  section.hidden = false;
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
  // Cart button now lives in the header on product detail; fall back to the
  // legacy floating button for any other page that still mounts this script.
  const btn =
    document.querySelector(".header-cart-btn") ||
    document.querySelector(".floating-request-btn");
  if (!btn) return;
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
  await renderProduct(body.product, pricing);
  // Fire-and-forget: recommendations are optional, don't block main rendering
  loadRecommendations(body.product, pricing).catch(() => {});
}

bootstrap();
