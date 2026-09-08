// 匯款回報元件 — success.html（下單完成頁）與 order-history.html（歷史訂單）共用。
// 自行讀 /api/remittance-info：店家沒開啟匯款收款時整個區塊不渲染。

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function api(path, options) {
  if (typeof window.apiFetch === "function") return window.apiFetch(path, options);
  return fetch((window.__API_BASE || "") + path, options);
}

// 與後端 src/shared/remittance-logic.js 的 UNREPORTABLE_STATUSES 保持一致。
// 前端先擋是為了不要顯示一個送出必定失敗的表單；後端仍會自己再驗一次。
const UNREPORTABLE_STATUSES = new Set(["shipped", "completed", "cancelled", "merged"]);

let infoPromise = null;

// 同一頁可能掛多張訂單的回報表單，收款帳戶只需取一次
export function loadRemittanceInfo() {
  if (!infoPromise) {
    infoPromise = api("/api/remittance-info")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && data.ok && data.enabled ? data : null))
      .catch(() => null);
  }
  return infoPromise;
}

function accountsHtml(info) {
  const rows = (info.accounts || []).map((acc) => {
    const bank = escapeHtml(acc.bankName) + (acc.bankCode ? `（${escapeHtml(acc.bankCode)}）` : "");
    const name = acc.accountName ? `<div class="spec">戶名：${escapeHtml(acc.accountName)}</div>` : "";
    return `<div class="order-item">
      <div class="name">${bank}
        <div class="spec remittance-account-no">${escapeHtml(acc.accountNo)}</div>
        ${name}
      </div>
      <div class="price"><button type="button" class="btn-pill secondary js-copy-account" data-account="${escapeHtml(acc.accountNo)}" style="padding:6px 12px;font-size:13px;">複製</button></div>
    </div>`;
  }).join("");
  const instruction = info.instruction
    ? `<p class="meta" style="margin:8px 0 0;">${escapeHtml(info.instruction).replace(/\n/g, "<br />")}</p>`
    : "";
  return rows + instruction;
}

function todayIso() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

function statusLabel(order) {
  if (order.remittanceStatus === "verified") return "匯款已核對完成";
  if (order.remittanceStatus === "reported") {
    return `已回報後五碼 ${escapeHtml(order.remittanceLast5 || "")}，賣家核對中`;
  }
  if (order.remittanceStatus === "rejected") return "賣家未能核對到這筆匯款，請確認後重新回報";
  return "";
}

// mountRemittanceSection(container, { order, phone })
//   order 需要 orderCode / remittanceStatus / remittanceLast5 / grandTotalTwd
export async function mountRemittanceSection(container, options) {
  if (!container) return;
  const order = (options && options.order) || {};
  const phone = (options && options.phone) || "";
  const orderCode = order.orderCode || "";
  if (!orderCode || !phone) return;

  const info = await loadRemittanceInfo();
  if (!info) return;

  // 訂單已進到出貨後的階段且從未回報過匯款，這張單走的不是匯款流程，整區不顯示
  if (!order.remittanceStatus && UNREPORTABLE_STATUSES.has(String(order.status || ""))) return;

  const locked = order.remittanceStatus === "verified" || UNREPORTABLE_STATUSES.has(String(order.status || ""));
  const current = statusLabel(order);
  const statusHtml = current
    ? `<p class="meta remittance-status" style="margin:0 0 8px;">${current}</p>`
    : "";

  container.innerHTML = `
    <div class="order-summary remittance-box">
      <div class="order-summary-title">匯款資訊</div>
      ${accountsHtml(info)}
      ${statusHtml}
      ${locked ? "" : `
      <form class="remittance-form" novalidate>
        <label class="meta" for="remit-last5-${escapeHtml(orderCode)}"><strong>匯款帳號後五碼</strong></label>
        <input id="remit-last5-${escapeHtml(orderCode)}" class="input-cute js-remit-last5" type="text" inputmode="numeric" maxlength="5" placeholder="12345" autocomplete="off" />
        <label class="meta" for="remit-amount-${escapeHtml(orderCode)}" style="margin-top:8px;display:block;"><strong>匯款金額</strong></label>
        <input id="remit-amount-${escapeHtml(orderCode)}" class="input-cute js-remit-amount" type="number" min="1" step="1" placeholder="1000" value="${Number(order.grandTotalTwd) > 0 ? Number(order.grandTotalTwd) : ""}" />
        <label class="meta" for="remit-date-${escapeHtml(orderCode)}" style="margin-top:8px;display:block;"><strong>匯款日期</strong></label>
        <input id="remit-date-${escapeHtml(orderCode)}" class="input-cute js-remit-date" type="date" max="${todayIso()}" value="${todayIso()}" />
        <label class="meta" for="remit-note-${escapeHtml(orderCode)}" style="margin-top:8px;display:block;"><strong>備註（選填）</strong></label>
        <input id="remit-note-${escapeHtml(orderCode)}" class="input-cute js-remit-note" type="text" maxlength="200" placeholder="例如：與 0908xxxx 訂單一起匯款" />
        <button type="submit" class="btn-pill js-remit-submit" style="width:100%;margin-top:12px;">送出匯款回報</button>
        <p class="notice hidden js-remit-msg" style="margin-top:8px;"></p>
      </form>`}
    </div>`;

  container.querySelectorAll(".js-copy-account").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.getAttribute("data-account") || "").then(() => {
        const original = btn.textContent;
        btn.textContent = "已複製";
        setTimeout(() => { btn.textContent = original; }, 2000);
      }).catch(() => {});
    });
  });

  const form = container.querySelector(".remittance-form");
  if (!form) return;

  const msg = container.querySelector(".js-remit-msg");
  const submit = container.querySelector(".js-remit-submit");
  const setMsg = (text) => {
    if (!msg) return;
    msg.textContent = text || "";
    msg.classList.toggle("hidden", !text);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMsg("");
    const last5 = container.querySelector(".js-remit-last5").value.trim();
    const amount = container.querySelector(".js-remit-amount").value.trim();
    const paidDate = container.querySelector(".js-remit-date").value.trim();
    const note = container.querySelector(".js-remit-note").value.trim();

    if (!/^\d{5}$/.test(last5)) {
      setMsg("請輸入匯款帳號的後五碼（5 位數字）");
      return;
    }

    submit.disabled = true;
    submit.textContent = "送出中...";
    try {
      const res = await api("/api/remittance-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderCode, phone, last5, amount, paidDate, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setMsg((data && data.error) || "回報失敗，請稍後再試");
        return;
      }
      order.remittanceStatus = "reported";
      order.remittanceLast5 = last5;
      await mountRemittanceSection(container, { order, phone });
    } catch {
      setMsg("回報失敗，請稍後再試");
    } finally {
      if (submit.isConnected) {
        submit.disabled = false;
        submit.textContent = "送出匯款回報";
      }
    }
  });
}
