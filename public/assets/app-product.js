import { addItem } from "./draft-store.js";
const DEFAULT_PRICING = { markupJpy: 1000, jpyToTwd: 0.21 };

function setError(message) {
  const node = document.getElementById("detail-error");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove("hidden");
}

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

function renderProduct(item, pricing) {
  const title = item.nameZhTw || item.nameJa || "未命名商品";
  const mainImage = item.mainImageUrl || item.displayImageUrl || item.imageUrl || "";
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
            <img src="${img}" alt="${title}" class="detail-thumb" />
          </button>`
      )
      .join("");
    gallery.querySelectorAll(".detail-thumb-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const image = button.getAttribute("data-image");
        if (!main || !image) {
          return;
        }
        main.src = image;
        gallery.querySelectorAll(".detail-thumb-btn").forEach((node) => {
          node.classList.remove("is-active");
        });
        button.classList.add("is-active");
      });
    });
  }

  const bindText = (id, text) => {
    const node = document.getElementById(id);
    if (node) {
      node.textContent = text;
    }
  };

  bindText("detail-title", title);
  bindText("detail-brand", `品牌：${item.brand || "未提供"}`);
  const adjusted = calcAdjustedPrices(item.priceJpyTaxIn, pricing);
  bindText(
    "detail-price",
    `代購價：${
      adjusted.jpy !== null ? `JPY ${adjusted.jpy.toLocaleString("en-US")} / TWD ${adjusted.twd.toLocaleString("en-US")}` : formatPrice(item.priceJpyTaxIn)
    }`
  );
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

  const schemaList = document.getElementById("detail-schema-list");
  if (schemaList) {
    const schema = item.schema || {};
    const variantCount = Array.isArray(schema.hasVariant)
      ? schema.hasVariant.length
      : 0;
    const schemaRows = [
      ["類型", schema["@type"] || "-"],
      ["群組 ID", schema.productGroupID || item.code || "-"],
      ["Variant 數", variantCount],
    ];
    schemaList.innerHTML = schemaRows.map(([k, v]) => `<li>${k}：${v}</li>`).join("");
  }

  const addButton = document.getElementById("detail-add");
  if (addButton) {
    addButton.addEventListener("click", () => {
      addItem({
        productId: item.id,
        code: item.code || "",
        productNameSnapshot: title,
        imageUrl: mainImage,
        priceJpyTaxIn: adjusted.jpy,
        unitPriceTwd: adjusted.twd,
        sizeOptions: Array.isArray(item.sizeOptions) ? item.sizeOptions : [],
        colorOptions: Array.isArray(item.colorOptions) ? item.colorOptions : [],
      });
      location.href = "/request.html";
    });
  }
}

async function bootstrap() {
  const pricingRes = await fetch("/api/pricing");
  const pricingBody = pricingRes.ok ? await pricingRes.json() : null;
  const pricing = pricingBody?.pricing || DEFAULT_PRICING;

  const url = new URL(location.href);
  const code = (url.searchParams.get("code") || "").trim();
  if (!code) {
    setError("缺少商品代碼");
    return;
  }

  const res = await fetch(`/api/product?code=${encodeURIComponent(code)}`);
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
