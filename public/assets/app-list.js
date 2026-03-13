import { getDraft } from "./draft-store.js";

const PAGE_SIZE = 20;
const DEFAULT_PRICING = { markupJpy: 1000, jpyToTwd: 0.21 };
const PROMO_STORAGE_KEY = "ccwep-promo-shown-v1";
const VIEW_MODE_STORAGE_KEY = "product-view-mode-v1";
const VIEW_MODES = ["list", "card", "2card"];
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

function formatPrice(price) {
  if (typeof price !== "number") {
    return "價格未提供";
  }
  return `JPY ${price.toLocaleString("en-US")}`;
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

function renderProducts(products, pricing) {
  const grid = document.getElementById("product-grid");
  if (!grid) {
    return;
  }
  grid.innerHTML = products
    .map((item) => {
      const title = item.nameZhTw || item.nameJa || "未命名商品";
      const adjusted = calcAdjustedPrices(item.priceJpyTaxIn, pricing);
      return `
      <article class="product-card" data-product-card>
        <a href="/product?code=${encodeURIComponent(item.code)}">
          <img src="${item.displayImageUrl || item.imageUrl || ""}" alt="${title}" loading="lazy" />
        </a>
        <div class="product-card__body">
          <h2 class="product-card__title">
            <a href="/product?code=${encodeURIComponent(item.code)}">${title}</a>
          </h2>
          <p class="meta">${item.brand || "品牌未提供"}</p>
          <p class="meta">價格：${adjusted.jpy !== null ? `JPY ${adjusted.jpy.toLocaleString("en-US")}` : "價格未提供"}</p>
          <p class="meta">台幣估算：${adjusted.twd !== null ? `TWD ${adjusted.twd.toLocaleString("en-US")}` : "價格未提供"}</p>
          <p class="meta">分類：${item.category || "未分類"}</p>
          <p class="meta">顏色數：${item.colorCount ?? "-"}</p>
          <a class="button" href="/product?code=${encodeURIComponent(item.code)}">check this out!</a>
        </div>
      </article>
      `;
    })
    .join("");
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

function goPage(page, category = getCategory()) {
  const target = Math.max(1, page);
  const url = new URL(location.href);
  url.searchParams.set("page", String(target));
  if (category) {
    url.searchParams.set("category", category);
  } else {
    url.searchParams.delete("category");
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
  const heroImage = document.getElementById("hero-image");
  if (heroImage) {
    heroImage.addEventListener("error", () => {
      const heroSection = heroImage.closest(".hero-banner");
      if (heroSection) {
        heroSection.classList.add("hidden");
      }
    });
  }
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
    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
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
    renderProducts(products, pricing);
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
