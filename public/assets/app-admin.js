function showError(message) {
  const node = document.getElementById("admin-error");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove("hidden");
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toLocaleString("en-US");
}

function hideError() {
  const node = document.getElementById("admin-error");
  if (!node) {
    return;
  }
  node.classList.add("hidden");
}

function renderForms(forms) {
  const wrapper = document.getElementById("admin-forms");
  if (!wrapper) {
    return;
  }
  if (!Array.isArray(forms) || forms.length === 0) {
    wrapper.innerHTML = '<p class="notice">目前沒有需求單。</p>';
    return;
  }

  wrapper.innerHTML = forms
    .map((form) => {
      const itemsHtml = Array.isArray(form.items)
        ? form.items
            .map((item) => {
              const size = item.desiredSize || "未選";
              const color = item.desiredColor || "未選";
              const note = item.note ? `，備註：${item.note}` : "";
              const sourceLink = item.productUrl
                ? `，<a href="${item.productUrl}" target="_blank" rel="noopener noreferrer">原商品頁</a>`
                : "";
              return `<li>${item.productNameSnapshot}（${item.code || "無代碼"}）x ${item.quantity}，尺寸：${size}，顏色：${color}，單價 JPY ${formatCurrency(item.unitPriceJpy)} / TWD ${formatCurrency(item.unitPriceTwd)}，小計 JPY ${formatCurrency(item.subtotalJpy)} / TWD ${formatCurrency(item.subtotalTwd)}${sourceLink}${note}</li>`;
            })
            .join("")
        : "";
      return `
      <article class="admin-form-card">
        <h2 class="product-card__title">需求單 #${form.id}</h2>
        <p class="meta">建立時間：${new Date(form.createdAt).toLocaleString("zh-TW")}</p>
        <p class="meta">狀態：${form.status}</p>
        <p class="meta">客戶：${form.customerName}</p>
        <p class="meta">電話：${form.memberPhone || form.contact || "無"}</p>
        <p class="meta">Line ID：${form.lineId || "無"}</p>
        <p class="meta">收件：${form.recipientCity || ""} ${form.recipientAddress || ""}</p>
        <p class="meta">配送：${form.shippingMethod === "jp_direct" ? "日本直送（需完成EZWAY）" : "集運回台灣（國際+國內）"}</p>
        <p class="meta">EZWAY：${form.requiresEzway ? "需要" : "不需要"}</p>
        <p class="meta">運費：國際 TWD ${formatCurrency(form.shippingInternationalTwd)} / 國內 TWD ${formatCurrency(form.shippingDomesticTwd)} / 合計運費TWD ${formatCurrency(form.shippingTotalTwd)}</p>
        <p class="meta">整單備註：${form.notes || "無"}</p>
        <ul class="admin-form-items">${itemsHtml}</ul>
      </article>
      `;
    })
    .join("");
}

async function loadForms() {
  hideError();
  const res = await fetch("/api/admin/requirements");
  if (res.status === 401) {
    location.href = "/admin-login.html";
    return;
  }
  if (!res.ok) {
    showError(`需求單讀取失敗：${res.status}`);
    return;
  }
  const body = await res.json();
  renderForms(body.forms || []);
}

async function runCrawl() {
  hideError();
  const button = document.getElementById("admin-crawl");
  if (button) {
    button.setAttribute("disabled", "true");
  }

  try {
    const res = await fetch("/admin/crawl", { method: "POST" });
    if (res.status === 401) {
      location.href = "/admin-login.html";
      return;
    }
    if (!res.ok) {
      showError(`抓取失敗：${res.status}`);
      return;
    }
    await loadForms();
  } finally {
    if (button) {
      button.removeAttribute("disabled");
    }
  }
}

async function loadPricing() {
  const res = await fetch("/api/admin/pricing");
  if (res.status === 401) {
    location.href = "/admin-login.html";
    return;
  }
  if (!res.ok) {
    showError(`價格設定讀取失敗：${res.status}`);
    return;
  }
  const body = await res.json();
  const markupNode = document.getElementById("markup-jpy");
  const rateNode = document.getElementById("jpy-to-twd");
  const intlNode = document.getElementById("international-shipping-twd");
  const domesticNode = document.getElementById("domestic-shipping-twd");
  if (markupNode) {
    markupNode.value = String(body?.pricing?.markupJpy ?? 1000);
  }
  if (rateNode) {
    rateNode.value = String(body?.pricing?.jpyToTwd ?? 0.21);
  }
  if (intlNode) {
    intlNode.value = String(body?.pricing?.internationalShippingTwd ?? 350);
  }
  if (domesticNode) {
    domesticNode.value = String(body?.pricing?.domesticShippingTwd ?? 60);
  }
}

async function savePricing() {
  const markupNode = document.getElementById("markup-jpy");
  const rateNode = document.getElementById("jpy-to-twd");
  const intlNode = document.getElementById("international-shipping-twd");
  const domesticNode = document.getElementById("domestic-shipping-twd");
  const markupJpy = Number(markupNode?.value || 0);
  const jpyToTwd = Number(rateNode?.value || 0);
  const internationalShippingTwd = Number(intlNode?.value || 0);
  const domesticShippingTwd = Number(domesticNode?.value || 0);
  const res = await fetch("/api/admin/pricing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ markupJpy, jpyToTwd, internationalShippingTwd, domesticShippingTwd }),
  });
  if (res.status === 401) {
    location.href = "/admin-login.html";
    return;
  }
  if (!res.ok) {
    showError(`價格設定儲存失敗：${res.status}`);
    return;
  }
}

async function logout() {
  await fetch("/api/admin/logout", { method: "POST" });
  location.href = "/admin-login.html";
}

function bootstrap() {
  const crawl = document.getElementById("admin-crawl");
  if (crawl) {
    crawl.addEventListener("click", runCrawl);
  }
  const refresh = document.getElementById("admin-refresh");
  if (refresh) {
    refresh.addEventListener("click", loadForms);
  }
  const save = document.getElementById("admin-save-pricing");
  if (save) {
    save.addEventListener("click", savePricing);
  }
  const logoutBtn = document.getElementById("admin-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
  loadPricing();
  loadForms();
}

bootstrap();
