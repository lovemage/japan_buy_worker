import { showError } from "./app-admin.js";

async function loadPricing() {
  const res = await fetch("/api/admin/pricing");
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) return;
  const body = await res.json();
  const p = body?.pricing || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val ?? ""); };
  set("markup-jpy", p.markupJpy ?? 1000);
  set("jpy-to-twd", p.jpyToTwd ?? 0.21);
  set("international-shipping-twd", p.internationalShippingTwd ?? 350);
  set("domestic-shipping-twd", p.domesticShippingTwd ?? 60);
  set("promo-tag-max-twd", p.promoTagMaxTwd ?? 500);
  set("limited-proxy-shipping-twd", p.limitedProxyShippingTwd ?? 80);
  const opt = document.getElementById("shipping-options-enabled");
  if (opt) opt.checked = p.shippingOptionsEnabled !== false;
}

async function savePricing() {
  const get = (id) => Number(document.getElementById(id)?.value || 0);
  const res = await fetch("/api/admin/pricing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      markupJpy: get("markup-jpy"),
      jpyToTwd: get("jpy-to-twd"),
      internationalShippingTwd: get("international-shipping-twd"),
      domesticShippingTwd: get("domestic-shipping-twd"),
      promoTagMaxTwd: get("promo-tag-max-twd"),
      limitedProxyShippingTwd: get("limited-proxy-shipping-twd"),
      shippingOptionsEnabled: Boolean(document.getElementById("shipping-options-enabled")?.checked),
    }),
  });
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) { showError("儲存失敗"); return; }
}

async function loadGeminiSettings() {
  const res = await fetch("/api/admin/settings/gemini");
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) return;
  const body = await res.json();
  const status = document.getElementById("gemini-key-status");
  if (status) status.textContent = body.hasKey ? `已設定（${body.maskedKey}）` : "尚未設定";
}

async function saveGeminiKey() {
  const input = document.getElementById("gemini-api-key");
  const key = input?.value?.trim();
  if (!key) { showError("請填入 Gemini API Key"); return; }
  const res = await fetch("/api/admin/settings/gemini", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ geminiApiKey: key }),
  });
  if (res.status === 401) { location.href = "/admin-login.html"; return; }
  if (!res.ok) { showError("儲存失敗"); return; }
  input.value = "";
  await loadGeminiSettings();
}

async function changePassword() {
  const oldPw = document.getElementById("old-password")?.value?.trim();
  const newPw = document.getElementById("new-password")?.value?.trim();
  const confirmPw = document.getElementById("confirm-password")?.value?.trim();
  const status = document.getElementById("password-status");

  if (!oldPw || !newPw || !confirmPw) { if (status) status.textContent = "所有欄位為必填"; return; }
  if (newPw !== confirmPw) { if (status) status.textContent = "新密碼與確認密碼不一致"; return; }
  if (newPw.length < 4) { if (status) status.textContent = "新密碼至少 4 個字元"; return; }

  const res = await fetch("/api/admin/change-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
  });
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (status) status.textContent = data.error || "舊密碼錯誤";
    return;
  }
  if (!res.ok) { if (status) status.textContent = "更改失敗"; return; }
  if (status) status.textContent = "密碼已更改！";
  document.getElementById("old-password").value = "";
  document.getElementById("new-password").value = "";
  document.getElementById("confirm-password").value = "";
}

async function logout() {
  await fetch("/api/admin/logout", { method: "POST" });
  location.href = "/admin-login.html";
}

async function clearProducts(type) {
  const label = type === "sync" ? "同步商品" : "拍照商品";
  const endpoint = type === "sync" ? "/api/admin/clear-sync-products" : "/api/admin/clear-manual-products";
  const status = document.getElementById("danger-status");

  if (!confirm(`確定要清空所有${label}？此操作不可復原！`)) return;

  const password = prompt("請輸入管理員密碼以確認操作：");
  if (!password) return;

  if (status) status.textContent = "執行中...";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (status) status.textContent = `操作失敗：${data.error}`;
      return;
    }
    if (status) status.textContent = `已清空${label}，共刪除 ${data.deleted} 筆`;
  } catch (err) {
    if (status) status.textContent = `操作失敗：${String(err)}`;
  }
}

export function initSettings() {
  document.getElementById("admin-save-pricing")?.addEventListener("click", savePricing);
  document.getElementById("admin-save-gemini-key")?.addEventListener("click", saveGeminiKey);
  document.getElementById("admin-change-password")?.addEventListener("click", changePassword);
  document.getElementById("admin-logout")?.addEventListener("click", logout);
  document.getElementById("btn-clear-sync")?.addEventListener("click", () => clearProducts("sync"));
  document.getElementById("btn-clear-manual")?.addEventListener("click", () => clearProducts("manual"));
  loadPricing();
  loadGeminiSettings();
}
