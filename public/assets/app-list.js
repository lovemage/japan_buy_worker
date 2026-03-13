import { getDraft } from "./draft-store.js";

const PAGE_SIZE = 20;
const DEFAULT_PRICING = { markupJpy: 1000, jpyToTwd: 0.21 };

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

function getPage() {
  const url = new URL(location.href);
  const pageRaw = Number(url.searchParams.get("page") || "1");
  return Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
}

function goPage(page) {
  const target = Math.max(1, page);
  const url = new URL(location.href);
  url.searchParams.set("page", String(target));
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

async function bootstrap() {
  renderDraftCount();
  try {
    const pricingRes = await fetch("/api/pricing");
    const pricingBody = pricingRes.ok ? await pricingRes.json() : null;
    const pricing = pricingBody?.pricing || DEFAULT_PRICING;
    const page = getPage();
    const offset = (page - 1) * PAGE_SIZE;
    const res = await fetch(`/api/products?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) {
      throw new Error(`Load failed: ${res.status}`);
    }
    const body = await res.json();
    const products = Array.isArray(body.products) ? body.products : [];
    const last = products.find((p) => p.lastCrawledAt)?.lastCrawledAt;
    const lastNode = document.getElementById("last-updated-text");
    if (lastNode) {
      lastNode.textContent = last
        ? `最後更新：${new Date(last).toLocaleString("zh-TW")}`
        : "最後更新：未知";
    }
    renderProducts(products, pricing);
    renderPagination(body.paging || null);
  } catch (error) {
    setError(error instanceof Error ? error.message : "資料載入失敗");
  }
}

bootstrap();
