import { addItem, getDraft } from "./draft-store.js";
import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";
import { buildListQueryParams } from "./list-query.js";
import { getNormalizedQuickSort, nextSingleBrandSelection } from "./list-state.js";

const PAGE_SIZE = 30;
const _cc = window.__COUNTRY_CONFIG || {};
const DEFAULT_PRICING = { markupJpy: 1000, markupMode: "flat", markupPercent: 15, jpyToTwd: _cc.defaultRate || 0.21, promoTagMaxTwd: 500 };
const PROMO_STORAGE_KEY = "ccwep-promo-shown-v1";
const LIST_RETURN_STATE_KEY = "japan-buy-list-return-v1";
const VIEW_MODE_STORAGE_KEY = "product-view-mode-v1";
const VIEW_MODES = ["list", "card", "2card"];
const DEFAULT_QUICK_SORT = "latest";
const DETAIL_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M4.038 4.038a5.25 5.25 0 0 0 0 7.424a.75.75 0 0 1-1.06 1.061A6.75 6.75 0 1 1 14.5 7.75a.75.75 0 1 1-1.5 0a5.25 5.25 0 0 0-8.962-3.712"/><path d="M7.712 7.136a.75.75 0 0 1 .814.302l2.984 4.377a.75.75 0 0 1-.726 1.164l-.76-.109l.289 1.075a.75.75 0 0 1-1.45.388l-.287-1.075l-.602.474a.75.75 0 0 1-1.212-.645l.396-5.283a.75.75 0 0 1 .554-.668"/><path d="M5.805 9.695A2.75 2.75 0 1 1 10.5 7.75a.75.75 0 0 0 1.5 0a4.25 4.25 0 1 0-7.255 3.005a.75.75 0 1 0 1.06-1.06"/></svg>';
const CART_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M1.75 1.002a.75.75 0 1 0 0 1.5h1.835l1.24 5.113A3.75 3.75 0 0 0 2 11.25c0 .414.336.75.75.75h10.5a.75.75 0 0 0 0-1.5H3.628A2.25 2.25 0 0 1 5.75 9h6.5a.75.75 0 0 0 .73-.578l.846-3.595a.75.75 0 0 0-.578-.906a44 44 0 0 0-7.996-.91l-.348-1.436a.75.75 0 0 0-.73-.573zM5 14a1 1 0 1 1-2 0a1 1 0 0 1 2 0m8 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0"/></svg>';

// Tag labels from display settings or defaults
const TAG_DEFAULTS = { hot: "熱門商品", limited: "限時發售", popular: "人氣特賣", instock: "現貨", preorder: "預購" };
function getTagLabel(key) {
  const ds = window.__DISPLAY_SETTINGS || {};
  const names = ds.tagNames || {};
  return names[key] || TAG_DEFAULTS[key] || key;
}
const CATEGORY_TOKEN_MAP = {
  "all item": "全部商品",
  "tops": "上衣",
  "bottoms": "下身",
  "outer": "外套",
  "onepiece": "洋裝",
  "set item": "套裝",
  "goods": "雜貨",
  "baby": "嬰幼兒",
  "kids": "童裝",
  "boys": "男童",
  "girls": "女童",
  "unisex": "中性",
  "tシャツ": "T 恤",
  "シャツ": "襯衫",
  "パンツ": "褲子",
  "ショートパンツ": "短褲",
  "スカート": "裙子",
  "ワンピース": "洋裝",
  "アウター": "外套",
  "ジャケット": "夾克",
  "パーカー": "連帽上衣",
  "トレーナー": "大學T",
  "スウェット": "衛衣",
  "ニット": "針織",
  "カーディガン": "針織外套",
  "バッグ": "包包",
  "シューズ": "鞋子",
  "サンダル": "涼鞋",
  "ソックス": "襪子",
  "帽子": "帽子",
  "アクセサリー": "配件",
  "ベビー": "嬰幼兒",
  "キッズ": "童裝",
};

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toDisplayImageUrl(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    return "";
  }
  return imageUrl.trim().replace(/_ss(\.\w+)$/i, "_pm$1");
}

function buildProductGallery(item) {
  const seen = new Set();
  const images = [];
  const pushImage = (value) => {
    const normalized = toDisplayImageUrl(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    images.push(normalized);
  };

  pushImage(item.displayImageUrl);
  pushImage(item.imageUrl);
  if (Array.isArray(item.gallery)) {
    item.gallery.forEach(pushImage);
  }
  return images;
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

function isTwdSource() {
  const cc = window.__COUNTRY_CONFIG || _cc || {};
  return String(cc.currency || "").toUpperCase() === "TWD";
}

function setError(message) {
  const node = document.getElementById("list-error");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove("hidden");
}

function renderDraftCount() {
  const count = String(getDraft().items.length);
  const countNode = document.getElementById("draft-count");
  const floatingCountNode = document.getElementById("floating-draft-count");
  if (countNode) {
    countNode.textContent = count;
  }
  if (floatingCountNode) {
    floatingCountNode.textContent = count;
    floatingCountNode.style.display = parseInt(count) > 0 ? "" : "none";
  }
}

function getCurrentListUrl() {
  return `${location.pathname}${location.search}`;
}

function saveListScrollState() {
  sessionStorage.setItem(
    LIST_RETURN_STATE_KEY,
    JSON.stringify({
      url: getCurrentListUrl(),
      scrollY: window.scrollY,
      at: Date.now(),
    })
  );
}

function consumeListScrollState() {
  const raw = sessionStorage.getItem(LIST_RETURN_STATE_KEY);
  if (!raw) {
    return null;
  }
  sessionStorage.removeItem(LIST_RETURN_STATE_KEY);
  try {
    const parsed = JSON.parse(raw);
    const sameUrl = parsed?.url === getCurrentListUrl();
    const y = Number(parsed?.scrollY);
    if (sameUrl && Number.isFinite(y) && y >= 0) {
      return y;
    }
  } catch {}
  return null;
}

function bindProductNavigationState() {
  document.querySelectorAll('a[data-product-detail-link="1"]').forEach((link) => {
    link.addEventListener("click", () => {
      saveListScrollState();
    });
  });
}

function bumpFloatingCartButton() {
  const btn = document.querySelector(".floating-request-btn");
  if (!btn) return;
  btn.classList.remove("is-bumped");
  void btn.offsetWidth;
  btn.classList.add("is-bumped");
  btn.addEventListener("animationend", () => {
    btn.classList.remove("is-bumped");
  }, { once: true });
}

function bindListCartButtons() {
  document.querySelectorAll("[data-card-cart]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const raw = button.getAttribute("data-cart-payload") || "";
      let payload = null;
      try {
        payload = JSON.parse(decodeURIComponent(raw));
      } catch {
        payload = null;
      }
      if (!payload) return;
      addItem(payload);
      renderDraftCount();
      bumpFloatingCartButton();
      button.classList.add("is-added");
      button.setAttribute("aria-label", "已加入購物車");
      window.setTimeout(() => {
        button.classList.remove("is-added");
        button.setAttribute("aria-label", "加入購物車");
      }, 900);
    });
  });
}

function initOverlayToggle() {
  document.querySelectorAll("[data-card-overlay]").forEach((overlay) => {
    const media = overlay.closest(".product-card__media");
    if (!media) return;
    const detailLink = overlay.querySelector("[data-product-detail-link]");
    if (detailLink) {
      detailLink.tabIndex = -1;
    }
    const setVisible = (visible) => {
      overlay.classList.toggle("is-visible", visible);
      overlay.setAttribute("aria-hidden", visible ? "false" : "true");
      if (detailLink) {
        detailLink.tabIndex = visible ? 0 : -1;
      }
    };
    overlay.setAttribute("aria-hidden", "true");
    media.addEventListener("click", (e) => {
      if (e.target.closest(".product-card__nav")) return;
      if (e.target.closest("[data-product-detail-link]")) return;
      setVisible(!overlay.classList.contains("is-visible"));
    });
  });
}

function renderProducts(products, pricing) {
  const grid = document.getElementById("product-grid");
  if (!grid) {
    return;
  }
  const promoThreshold = Number(pricing?.promoTagMaxTwd ?? DEFAULT_PRICING.promoTagMaxTwd);
  grid.innerHTML = products
    .map((item) => {
      const title = item.nameZhTw || item.nameJa || "未命名商品";
      const adjusted = calcAdjustedPrices(item.priceJpyTaxIn, pricing);
      const isPromo =
        adjusted.twd !== null &&
        Number.isFinite(promoThreshold) &&
        promoThreshold >= 0 &&
        adjusted.twd <= promoThreshold;
      const gallery = buildProductGallery(item);
      const firstImage = withProductImageFallback(gallery[0] || "");
      const galleryPayload = encodeURIComponent(JSON.stringify(gallery));
      const detailHref = `${window.__API_BASE || ""}/product?code=${encodeURIComponent(item.code)}&returnTo=${encodeURIComponent(getCurrentListUrl())}`;
      const cartPayload = encodeURIComponent(JSON.stringify({
        productId: item.id,
        code: item.code || "",
        productNameSnapshot: title,
        quantity: 1,
        imageUrl: firstImage,
        selectedImageUrl: firstImage,
        priceJpyTaxIn: adjusted.src,
        unitPriceTwd: adjusted.twd,
        sizeOptions: Array.isArray(item.sizeOptions) ? item.sizeOptions : [],
        colorOptions: Array.isArray(item.colorOptions) ? item.colorOptions : [],
        variantOptions: Array.isArray(item.variants) ? item.variants : [],
      }));
      return `
      <article class="product-card ${gallery.length > 1 ? "has-gallery" : ""}" data-product-card data-gallery="${galleryPayload}">
        <div class="product-card__media image-loading" data-image-loading-wrap>
          ${isPromo ? '<span class="promo-badge">優惠</span>' : ""}
          ${(item.tags || []).map(t => `<span class="product-tag product-tag--${escapeHtml(t)}">${getTagLabel(t)}</span>`).join("")}
          <img src="${firstImage}" alt="${escapeHtml(title)}" loading="lazy" data-card-image data-fallback="product" data-image-loading="1" />
          <button type="button" class="product-card__nav product-card__nav--prev" data-card-prev aria-label="上一張">‹</button>
          <button type="button" class="product-card__nav product-card__nav--next" data-card-next aria-label="下一張">›</button>
          <div class="product-card__overlay" data-card-overlay>
            <a class="product-card__detail-link" data-product-detail-link="1" href="${detailHref}" aria-label="查看商品詳情">${DETAIL_ICON_SVG}</a>
            <h2 class="product-card__title">${escapeHtml(title)}</h2>
          </div>
        </div>
        <div class="product-card__body">
          <div class="product-card__brand-row">
            <p class="meta">${escapeHtml(item.brand || "品牌未提供")}</p>
            <button type="button" class="product-card__cart-btn" data-card-cart data-cart-payload="${cartPayload}" aria-label="加入購物車">${CART_ICON_SVG}</button>
          </div>
          <p class="product-card__price">${adjusted.twd !== null ? `NT$${adjusted.twd.toLocaleString("en-US")}` : "價格未提供"}${(adjusted.src !== null && !isTwdSource()) ? ` <span class="meta" style="font-weight:400">(${fmtSrcPrice(adjusted.src)})</span>` : ""}</p>
          <p class="product-card__category">${escapeHtml(translateCategoryLabel(item.category))}${item.colorCount ? ` · ${item.colorCount} 色` : ""}</p>
        </div>
      </article>
      `;
    })
    .join("");
  bindProductNavigationState();
  bindListCartButtons();
}

function initProductCardGalleries() {
  const supportsHover =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  document.querySelectorAll("[data-product-card]").forEach((card) => {
    const raw = card.getAttribute("data-gallery") || "";
    let images = [];
    try {
      images = JSON.parse(decodeURIComponent(raw));
    } catch {
      images = [];
    }
    const imageNode = card.querySelector("[data-card-image]");
    if (!(imageNode instanceof HTMLImageElement)) {
      return;
    }
    const mediaWrap = card.querySelector("[data-image-loading-wrap]");
    const setLoading = (loading) => {
      if (!mediaWrap) {
        return;
      }
      mediaWrap.classList.toggle("image-loading", loading);
    };
    imageNode.addEventListener("load", () => setLoading(false));
    imageNode.addEventListener("error", () => setLoading(false));
    if (imageNode.complete) {
      setLoading(false);
    }
    if (!Array.isArray(images) || images.length <= 1) {
      return;
    }

    let index = 0;
    let timer = null;
    const setIndex = (next) => {
      index = (next + images.length) % images.length;
      setLoading(true);
      imageNode.src = images[index];
    };
    const stopAuto = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const startAuto = () => {
      if (timer !== null || !supportsHover) {
        return;
      }
      timer = setInterval(() => setIndex(index + 1), 1200);
    };

    const prev = card.querySelector("[data-card-prev]");
    const next = card.querySelector("[data-card-next]");
    if (prev instanceof HTMLButtonElement) {
      prev.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        stopAuto();
        setIndex(index - 1);
      });
    }
    if (next instanceof HTMLButtonElement) {
      next.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        stopAuto();
        setIndex(index + 1);
      });
    }

    card.addEventListener("mouseenter", startAuto);
    card.addEventListener("mouseleave", () => {
      stopAuto();
      setIndex(0);
    });
  });
  applyProductImageFallback();
}

function getQuickSort() {
  const url = new URL(location.href);
  return getNormalizedQuickSort(url.searchParams.get("sort") || DEFAULT_QUICK_SORT);
}

function initPromoSwitch() {
  const selected = getQuickSort();
  document.querySelectorAll(".view-switch__btn[data-quick-sort]").forEach((btn) => {
    const value = getNormalizedQuickSort(btn.getAttribute("data-quick-sort") || DEFAULT_QUICK_SORT);
    btn.classList.toggle("is-active", value === selected);
    btn.addEventListener("click", () => {
      const url = new URL(location.href);
      if (value === DEFAULT_QUICK_SORT) {
        url.searchParams.delete("sort");
      } else {
        url.searchParams.set("sort", value);
      }
      url.searchParams.set("page", "1");
      location.href = url.toString();
    });
  });
}

function getViewMode() {
  const adminDefault = (window.__DISPLAY_SETTINGS || {}).viewMode || "2card";
  const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY) || adminDefault;
  return VIEW_MODES.includes(saved) ? saved : adminDefault;
}

function applyViewMode(mode) {
  const grid = document.getElementById("product-grid");
  if (!grid) {
    return;
  }
  grid.classList.remove("product-grid--list", "product-grid--card", "product-grid--2card");
  if (mode === "list") {
    grid.classList.add("product-grid--list");
  } else if (mode === "2card") {
    grid.classList.add("product-grid--2card");
  } else {
    grid.classList.add("product-grid--card");
  }

  document.querySelectorAll(".view-switch__btn[data-view-mode]").forEach((btn) => {
    const isActive = btn.getAttribute("data-view-mode") === mode;
    btn.classList.toggle("is-active", isActive);
  });
}

function initViewSwitch() {
  const mode = getViewMode();
  applyViewMode(mode);
  document.querySelectorAll(".view-switch__btn[data-view-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-view-mode") || "card";
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
      applyViewMode(next);
    });
  });
}

function formatDateOnly(input) {
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) {
    return "未知";
  }
  return value.toLocaleDateString("zh-TW");
}

function translateCategoryLabel(raw) {
  const input = String(raw || "").trim();
  if (!input) {
    return "未分類";
  }
  const exact = CATEGORY_TOKEN_MAP[input.toLowerCase()];
  if (exact) {
    return exact;
  }

  let translated = input;
  const pairs = Object.entries(CATEGORY_TOKEN_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [token, zh] of pairs) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    translated = translated.replace(re, zh);
  }

  // Normalize separators for mixed tags like "BOYS_パンツ"
  translated = translated.replace(/[_/]+/g, " / ").replace(/\s{2,}/g, " ").trim();
  return translated;
}

function getPage() {
  const url = new URL(location.href);
  const pageRaw = Number(url.searchParams.get("page") || "1");
  return Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
}

function getCategory() {
  const url = new URL(location.href);
  return (url.searchParams.get("category") || "").trim();
}

function getSelectedBrands() {
  const url = new URL(location.href);
  return Array.from(
    new Set(
      (url.searchParams.get("brands") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function goPage(
  page,
  category = getCategory(),
  sort = getQuickSort(),
  brands = getSelectedBrands()
) {
  const target = Math.max(1, page);
  const url = new URL(location.href);
  url.searchParams.set("page", String(target));
  if (category) {
    url.searchParams.set("category", category);
  } else {
    url.searchParams.delete("category");
  }
  if (sort === DEFAULT_QUICK_SORT) {
    url.searchParams.delete("sort");
  } else {
    url.searchParams.set("sort", getNormalizedQuickSort(sort));
  }
  if (brands.length > 0) {
    url.searchParams.set("brands", brands.join(","));
  } else {
    url.searchParams.delete("brands");
  }
  location.href = url.toString();
}

function renderPagination(paging) {
  const wrapper = document.getElementById("pagination");
  const prev = document.getElementById("page-prev");
  const next = document.getElementById("page-next");
  const indicator = document.getElementById("page-indicator");
  if (!wrapper || !prev || !next || !indicator || !paging) {
    return;
  }

  wrapper.classList.remove("hidden");
  wrapper.style.display = "flex";

  const totalPages = Math.max(1, paging.totalPages || 1);
  const current = Math.min(Math.max(1, paging.page || 1), totalPages);

  // Sliding window of at most 5 page numbers, centered on current when possible.
  // Always append the last page (with optional ellipsis) when it falls outside the window.
  const max = 5;
  let start = Math.max(1, current - Math.floor(max / 2));
  let end = Math.min(totalPages, start + max - 1);
  start = Math.max(1, end - max + 1);

  const numBtn = (p) => {
    const isActive = p === current;
    return `<button type="button" class="page-num-btn${isActive ? " is-active" : ""}" data-page="${p}" aria-label="第 ${p} 頁"${isActive ? ' aria-current="page"' : ""}>${p}</button>`;
  };

  const buttons = [];
  for (let p = start; p <= end; p++) buttons.push(numBtn(p));
  if (end < totalPages) {
    if (end < totalPages - 1) buttons.push('<span class="page-ellipsis" aria-hidden="true">…</span>');
    buttons.push(numBtn(totalPages));
  }
  indicator.innerHTML = buttons.join("");
  indicator.querySelectorAll(".page-num-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = Number(btn.getAttribute("data-page"));
      if (target && target !== current) goPage(target);
    });
  });

  prev.disabled = current <= 1;
  next.disabled = current >= totalPages;
  prev.onclick = () => goPage(current - 1);
  next.onclick = () => goPage(current + 1);
}

function renderFloatingPagination(paging) {
  const prev = document.getElementById("float-page-prev");
  if (!prev || !paging) {
    return;
  }
  prev.disabled = paging.page <= 1;
  prev.onclick = () => goPage(paging.page - 1);
}

function closeDrawer() {
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (drawer) drawer.classList.remove("open");
  if (overlay) overlay.classList.remove("open");
  document.body.style.overflow = "";
}

function initDrawerSections() {
  document.querySelectorAll("[data-drawer-section]").forEach((section) => {
    const toggle = section.querySelector("[data-drawer-toggle]");
    const panel = section.querySelector("[data-drawer-panel]");
    if (!(toggle instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) {
      return;
    }
    const sync = (expanded) => {
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      panel.hidden = !expanded;
      section.classList.toggle("is-collapsed", !expanded);
    };
    sync(toggle.getAttribute("aria-expanded") === "true");
    toggle.addEventListener("click", () => {
      sync(toggle.getAttribute("aria-expanded") !== "true");
    });
  });
}

function getUniqueElements(selectors) {
  const seen = new Set();
  return selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter((element) => {
      if (seen.has(element)) {
        return false;
      }
      seen.add(element);
      return true;
    });
}

function renderCategoryFilters(categories) {
  const wrappers = getUniqueElements(["#category-filters", "[data-category-filters]"]);
  if (wrappers.length === 0) {
    return;
  }
  const selectedCategory = getCategory();
  const buttons = [
    `<button type="button" class="btn-pill secondary ${selectedCategory ? "" : "is-active"}" data-category="">全部</button>`,
    ...categories.map(
      (item) =>
        `<button type="button" class="btn-pill secondary ${selectedCategory === item.name ? "is-active" : ""}" data-category="${item.name}">
          ${translateCategoryLabel(item.name)}（${item.total}）
        </button>`
    ),
  ];
  const html = buttons.join("");
  wrappers.forEach((wrapper) => {
    wrapper.innerHTML = html;
    wrapper.querySelectorAll("button[data-category]").forEach((button) => {
      button.addEventListener("click", () => {
        const category = (button.getAttribute("data-category") || "").trim();
        closeDrawer();
        goPage(1, category);
      });
    });
  });
}

function renderBrandFilters(brands) {
  const wrappers = getUniqueElements(["#brand-filters", "[data-brand-filters]"]);
  if (wrappers.length === 0) {
    return;
  }

  const selectedBrands = getSelectedBrands();
  const selectedSet = new Set(selectedBrands);
  const buttons = [
    `<button type="button" class="btn-pill secondary ${selectedBrands.length === 0 ? "is-active" : ""}" data-brand="">全部品牌</button>`,
    ...brands.map(
      (item) =>
        `<button type="button" class="btn-pill secondary ${selectedSet.has(item.name) ? "is-active" : ""}" data-brand="${escapeHtml(item.name)}">
          ${escapeHtml(item.name)}（${item.total}）
        </button>`
    ),
  ];
  const html = buttons.join("");
  wrappers.forEach((wrapper) => {
    wrapper.innerHTML = html;
    wrapper.querySelectorAll("button[data-brand]").forEach((button) => {
      button.addEventListener("click", () => {
        const brand = (button.getAttribute("data-brand") || "").trim();
        closeDrawer();
        if (!brand) {
          goPage(1, getCategory(), getQuickSort(), []);
          return;
        }
        goPage(1, getCategory(), getQuickSort(), nextSingleBrandSelection(getSelectedBrands(), brand));
      });
    });
  });
}

function scrollToFirstProductCard() {
  const firstCard = document.querySelector(".product-card");
  if (!firstCard) {
    return;
  }
  firstCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initPromoModal() {
  const modal = document.getElementById("promo-modal");
  const promoImage = document.getElementById("promo-image");
  if (promoImage) {
    promoImage.addEventListener("error", () => {
      if (modal) {
        modal.classList.add("hidden");
      }
      localStorage.setItem(PROMO_STORAGE_KEY, "1");
    });
  }
  if (!modal) {
    return;
  }

  const shown = localStorage.getItem(PROMO_STORAGE_KEY) === "1";
  if (shown) {
    modal.classList.add("hidden");
    return;
  }
  modal.classList.remove("hidden");
  modal.addEventListener("click", () => {
    modal.classList.add("hidden");
    localStorage.setItem(PROMO_STORAGE_KEY, "1");
  });
}

async function bootstrap() {
  renderDraftCount();
  initDrawerSections();
  initPromoModal();
  initViewSwitch();
  initPromoSwitch();
  try {
    const category = getCategory();
    const quickSort = getQuickSort();
    const brandParams = buildListQueryParams({
      category,
    });
    const [categoryRes, brandRes] = await Promise.all([
      apiFetch("/api/product-categories"),
      apiFetch(`/api/product-brands?${brandParams.toString()}`),
    ]);
    const categoryBody = categoryRes.ok ? await categoryRes.json() : null;
    const brandBody = brandRes.ok ? await brandRes.json() : null;
    const categories = Array.isArray(categoryBody?.categories) ? categoryBody.categories : [];
    const brands = Array.isArray(brandBody?.brands) ? brandBody.brands : [];
    renderBrandFilters(brands);
    renderCategoryFilters(categories);

    const pricingRes = await apiFetch("/api/pricing");
    const pricingBody = pricingRes.ok ? await pricingRes.json() : null;
    const pricing = pricingBody?.pricing || DEFAULT_PRICING;
    const page = getPage();
    const selectedBrands = getSelectedBrands();
    const offset = (page - 1) * PAGE_SIZE;
    const params = buildListQueryParams({
      limit: PAGE_SIZE,
      offset,
      sort: quickSort,
      category,
      brands: selectedBrands,
    });
    const res = await apiFetch(`/api/products?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Load failed: ${res.status}`);
    }
    const body = await res.json();
    const products = Array.isArray(body.products) ? body.products : [];
    const last = products.find((p) => p.lastCrawledAt)?.lastCrawledAt;
    const totalProducts = Number(body?.paging?.total || 0);
    const lastNode = document.getElementById("last-updated-text");
    if (lastNode) {
      const dateText = last ? formatDateOnly(last) : "未知";
      lastNode.textContent = `最後更新：${dateText}｜商品數量：${totalProducts.toLocaleString("en-US")}`;
    }
    renderProducts(products, pricing);
    initProductCardGalleries();
    initOverlayToggle();
    renderPagination(body.paging || null);
    renderFloatingPagination(body.paging || null);
    const restoreY = consumeListScrollState();
    if (restoreY !== null) {
      requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: "auto" }));
    } else if (getCategory() || getSelectedBrands().length > 0) {
      scrollToFirstProductCard();
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : "資料載入失敗");
  } finally {
    dismissLoading();
  }
}

function dismissLoading() {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) {
    return;
  }
  overlay.classList.add("is-hiding");
  overlay.addEventListener("transitionend", () => {
    overlay.classList.add("hidden");
  }, { once: true });
}

// Hide floating nav / cart buttons when the pagination row is in view, so
// they don't overlap the page-number buttons at the bottom of the storefront.
function initFloatingButtonsAutoHide() {
  const pagination = document.getElementById("pagination");
  const floatNav = document.querySelector(".floating-nav-buttons");
  const floatCart = document.querySelector(".floating-request-btn");
  if (!pagination || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (floatNav) floatNav.classList.toggle("is-hidden", visible);
      if (floatCart) floatCart.classList.toggle("is-hidden", visible);
    },
    // trigger as soon as the pagination row peeks into the viewport bottom
    { rootMargin: "0px 0px -40px 0px", threshold: 0.01 }
  );
  observer.observe(pagination);
}

bootstrap();
initFloatingButtonsAutoHide();
