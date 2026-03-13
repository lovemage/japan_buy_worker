import { getDraft } from "./draft-store.js";
import { applyProductImageFallback, withProductImageFallback } from "./image-fallback.js";

const PAGE_SIZE = 20;
const DEFAULT_PRICING = { markupJpy: 1000, jpyToTwd: 0.21, promoTagMaxTwd: 500 };
const PROMO_STORAGE_KEY = "ccwep-promo-shown-v1";
const VIEW_MODE_STORAGE_KEY = "product-view-mode-v1";
const VIEW_MODES = ["list", "card", "2card"];
const PROMO_FILTER_VALUES = [350, 450, 550];
const DEFAULT_PROMO_FILTER = 550;
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

function calcAdjustedPrices(baseJpy, pricing) {
  const base = Number(baseJpy);
  if (!Number.isFinite(base)) {
    return { jpy: null, twd: null };
  }
  const markup = Number(pricing?.markupJpy ?? DEFAULT_PRICING.markupJpy);
  const rate = Number(pricing?.jpyToTwd ?? DEFAULT_PRICING.jpyToTwd);
  const jpy = Math.round(base + (Number.isFinite(markup) ? markup : DEFAULT_PRICING.markupJpy));
  const twd = Math.round(jpy * (Number.isFinite(rate) ? rate : DEFAULT_PRICING.jpyToTwd));
  return { jpy, twd };
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
  }
}

function renderProducts(products, pricing, promoMaxTwd) {
  const grid = document.getElementById("product-grid");
  if (!grid) {
    return;
  }
  const promoThreshold = Number.isFinite(promoMaxTwd)
    ? promoMaxTwd
    : Number(pricing?.promoTagMaxTwd ?? DEFAULT_PRICING.promoTagMaxTwd);
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
      return `
      <article class="product-card ${gallery.length > 1 ? "has-gallery" : ""}" data-product-card data-gallery="${galleryPayload}">
        <div class="product-card__media image-loading" data-image-loading-wrap>
          ${isPromo ? '<span class="promo-badge">優惠</span>' : ""}
          <img src="${firstImage}" alt="${escapeHtml(title)}" loading="lazy" data-card-image data-fallback="product" data-image-loading="1" />
          <button type="button" class="product-card__nav product-card__nav--prev" data-card-prev aria-label="上一張">‹</button>
          <button type="button" class="product-card__nav product-card__nav--next" data-card-next aria-label="下一張">›</button>
        </div>
        <div class="product-card__body">
          <h2 class="product-card__title">${escapeHtml(title)}</h2>
          <p class="meta">${escapeHtml(item.brand || "品牌未提供")}</p>
          <p class="meta">價格：${adjusted.jpy !== null ? `JPY ${adjusted.jpy.toLocaleString("en-US")}` : "價格未提供"}</p>
          <p class="meta">台幣估算：${adjusted.twd !== null ? `TWD ${adjusted.twd.toLocaleString("en-US")}` : "價格未提供"}</p>
          <p class="meta">分類：${escapeHtml(item.category || "未分類")}</p>
          <p class="meta">顏色數：${item.colorCount ?? "-"}</p>
          <a class="button" href="/product?code=${encodeURIComponent(item.code)}">check this out!</a>
        </div>
      </article>
      `;
    })
    .join("");
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

function getPromoMaxTwd() {
  const url = new URL(location.href);
  const raw = Number(url.searchParams.get("promoMaxTwd") || String(DEFAULT_PROMO_FILTER));
  return PROMO_FILTER_VALUES.includes(raw) ? raw : DEFAULT_PROMO_FILTER;
}

function initPromoSwitch() {
  const selected = getPromoMaxTwd();
  document.querySelectorAll(".view-switch__btn[data-promo-max]").forEach((btn) => {
    const value = Number(btn.getAttribute("data-promo-max") || "");
    btn.classList.toggle("is-active", value === selected);
    btn.addEventListener("click", () => {
      if (!PROMO_FILTER_VALUES.includes(value)) {
        return;
      }
      const url = new URL(location.href);
      url.searchParams.set("promoMaxTwd", String(value));
      url.searchParams.set("page", "1");
      location.href = url.toString();
    });
  });
}

function getViewMode() {
  const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY) || "card";
  return VIEW_MODES.includes(saved) ? saved : "card";
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

function goPage(page, category = getCategory(), promoMaxTwd = getPromoMaxTwd()) {
  const target = Math.max(1, page);
  const url = new URL(location.href);
  url.searchParams.set("page", String(target));
  if (category) {
    url.searchParams.set("category", category);
  } else {
    url.searchParams.delete("category");
  }
  if (PROMO_FILTER_VALUES.includes(Number(promoMaxTwd))) {
    url.searchParams.set("promoMaxTwd", String(promoMaxTwd));
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
  indicator.textContent = `第 ${paging.page} / ${paging.totalPages} 頁，共 ${paging.total} 筆`;
  prev.disabled = paging.page <= 1;
  next.disabled = paging.page >= paging.totalPages;
  prev.onclick = () => goPage(paging.page - 1);
  next.onclick = () => goPage(paging.page + 1);
}

function renderFloatingPagination(paging) {
  const prev = document.getElementById("float-page-prev");
  const next = document.getElementById("float-page-next");
  if (!prev || !next || !paging) {
    return;
  }
  prev.disabled = paging.page <= 1;
  next.disabled = paging.page >= paging.totalPages;
  prev.onclick = () => goPage(paging.page - 1);
  next.onclick = () => goPage(paging.page + 1);
}

function renderCategoryFilters(categories) {
  const wrapper = document.getElementById("category-filters");
  if (!wrapper) {
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
  wrapper.innerHTML = buttons.join("");
  wrapper.querySelectorAll("button[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = (button.getAttribute("data-category") || "").trim();
      goPage(1, category);
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
  initPromoModal();
  initViewSwitch();
  initPromoSwitch();
  try {
    const categoryRes = await fetch("/api/product-categories");
    const categoryBody = categoryRes.ok ? await categoryRes.json() : null;
    const categories = Array.isArray(categoryBody?.categories) ? categoryBody.categories : [];
    renderCategoryFilters(categories);

    const pricingRes = await fetch("/api/pricing");
    const pricingBody = pricingRes.ok ? await pricingRes.json() : null;
    const pricing = pricingBody?.pricing || DEFAULT_PRICING;
    const page = getPage();
    const category = getCategory();
    const promoMaxTwd = getPromoMaxTwd();
    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      promoMaxTwd: String(promoMaxTwd),
    });
    if (category) {
      params.set("category", category);
    }
    const res = await fetch(`/api/products?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Load failed: ${res.status}`);
    }
    const body = await res.json();
    const products = Array.isArray(body.products) ? body.products : [];
    const last = products.find((p) => p.lastCrawledAt)?.lastCrawledAt;
    const totalSku = Number(body?.paging?.totalSku || body?.paging?.total || 0);
    const lastNode = document.getElementById("last-updated-text");
    if (lastNode) {
      const dateText = last ? formatDateOnly(last) : "未知";
      lastNode.textContent = `最後更新：${dateText}｜總SKU數：${totalSku.toLocaleString("en-US")}`;
    }
    renderProducts(products, pricing, promoMaxTwd);
    initProductCardGalleries();
    renderPagination(body.paging || null);
    renderFloatingPagination(body.paging || null);
    if (getCategory()) {
      scrollToFirstProductCard();
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : "資料載入失敗");
  }
}

bootstrap();
