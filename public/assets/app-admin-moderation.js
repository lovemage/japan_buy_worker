// 會員後台：商品合規提醒。
// 平台每週用 AI 檢查商品，可能需要販售資格的商品會出現在這裡，
// 會員可以留言說明資格、自行下架，或對平台下架的商品提出申訴。

const ACTIVE = new Set(["open", "responded", "removed", "appealed"]);
let expanded = false;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function api(path, options) {
  if (typeof window.apiFetch === "function") return window.apiFetch(path, options);
  return fetch(`${window.__API_BASE || ""}${path}`, { credentials: "include", ...options });
}

function badgeClass(item) {
  if (item.status === "removed") return "moderation-badge moderation-badge--removed";
  if (item.status === "open" || item.status === "appealed") return "moderation-badge moderation-badge--urgent";
  if (!ACTIVE.has(item.status)) return "moderation-badge moderation-badge--done";
  return "moderation-badge";
}

function renderItem(item) {
  const deadline = item.status === "open" && item.deadlineText
    ? `<br>請在 <strong>${esc(item.deadlineText)}</strong> 前確認${item.overdue ? "（已逾期，平台將進行審查）" : ""}`
    : "";
  const reply = item.sellerResponse
    ? `<div class="moderation-item__reply">你的說明：${esc(item.sellerResponse)}</div>`
    : "";
  const placeholder = item.status === "removed" || item.status === "appealed"
    ? "請說明你的販售資格，例如輸入許可、產品登錄字號、進貨來源或發票"
    : "若有合法販售資格，請說明，例如輸入許可、產品登錄字號或進貨來源";
  const form = item.canRespond || item.canSelfRemove
    ? `<div class="moderation-item__form">
        ${item.canRespond ? `<textarea class="input-cute" rows="3" maxlength="1000" data-role="message" placeholder="${esc(placeholder)}"></textarea>` : ""}
        <div class="moderation-item__actions">
          ${item.canRespond ? `<button type="button" class="button" data-action="respond">${item.status === "removed" || item.status === "appealed" ? "提出申訴" : "送出說明"}</button>` : ""}
          ${item.canSelfRemove ? `<button type="button" class="button secondary" data-action="self-remove">自行下架這件商品</button>` : ""}
        </div>
        <div class="moderation-item__msg" data-role="msg"></div>
      </div>`
    : "";
  return `<li class="moderation-item" data-case-id="${esc(item.id)}">
    <div class="moderation-item__top">
      <div class="moderation-item__title">${esc(item.title)}</div>
      <span class="${badgeClass(item)}">${esc(item.statusLabel)}</span>
    </div>
    <div class="moderation-item__meta">
      類別：${esc(item.rule)}<br>
      ${esc(item.reason || "")}<br>
      ${esc(item.guidance || "")}${deadline}
    </div>
    ${reply}
    ${form}
  </li>`;
}

function render(root, cases) {
  const active = cases.filter((c) => ACTIVE.has(c.status));
  if (cases.length === 0) {
    root.classList.add("hidden");
    root.innerHTML = "";
    return;
  }
  const needAction = active.filter((c) => c.canRespond && (c.status === "open" || c.status === "removed")).length;
  const title = needAction > 0 ? `商品合規提醒：${needAction} 件需要你確認` : "商品合規提醒";
  root.classList.remove("hidden");
  root.innerHTML = `
    <button type="button" class="moderation-notice__head" aria-expanded="${expanded}" aria-controls="moderation-notice-body">
      <span class="moderation-notice__title">${esc(title)}</span>
      <span class="moderation-notice__toggle">${expanded ? "收合" : "展開"}</span>
    </button>
    <div id="moderation-notice-body" ${expanded ? "" : "hidden"}>
      <p class="moderation-notice__intro">
        平台每週會檢查商品是否符合台灣法規。以下商品可能屬於需要販售資格的類別，這是提醒，並不代表你違規。有合法販售資格請留言說明；沒有或不確定，可以先自行下架或修改內容。
      </p>
      <ul class="moderation-list">${cases.map(renderItem).join("")}</ul>
    </div>`;

  root.querySelector(".moderation-notice__head")?.addEventListener("click", () => {
    expanded = !expanded;
    render(root, cases);
  });
  root.querySelectorAll(".moderation-item").forEach((li) => bindItem(root, li));
}

function bindItem(root, li) {
  const caseId = Number(li.getAttribute("data-case-id"));
  const msg = li.querySelector('[data-role="msg"]');
  const setMsg = (text) => { if (msg) msg.textContent = text; };

  li.querySelector('[data-action="respond"]')?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const message = li.querySelector('[data-role="message"]')?.value.trim() || "";
    if (message.length < 5) {
      setMsg("請簡單說明販售資格或商品來源（至少 5 個字）。");
      return;
    }
    button.disabled = true;
    setMsg("送出中…");
    const res = await api("/api/admin/moderation/respond", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      button.disabled = false;
      setMsg(data.error || "送出失敗，請稍後再試。");
      return;
    }
    await loadModeration(root);
  });

  li.querySelector('[data-action="self-remove"]')?.addEventListener("click", async (event) => {
    if (!window.confirm("確定要下架這件商品嗎？下架後商品資料會保留，之後可以修改再上架。")) return;
    const button = event.currentTarget;
    button.disabled = true;
    setMsg("處理中…");
    const res = await api("/api/admin/moderation/self-remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      button.disabled = false;
      setMsg(data.error || "下架失敗，請稍後再試。");
      return;
    }
    await loadModeration(root);
  });
}

async function loadModeration(root) {
  try {
    const res = await api("/api/admin/moderation");
    if (!res.ok) return;
    const data = await res.json();
    if (data.ok) render(root, Array.isArray(data.cases) ? data.cases : []);
  } catch {
    /* 提醒區塊載入失敗不影響後台其他功能 */
  }
}

export function initModeration() {
  const root = document.getElementById("moderation-notice");
  if (!root) return;
  loadModeration(root);
}
