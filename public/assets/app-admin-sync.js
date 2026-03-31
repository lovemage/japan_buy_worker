import { showError } from "./app-admin.js";

let progressInterval = null;
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch { /* not supported or denied */ }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

function startProgressCounter() {
  let count = 0;
  const el = document.getElementById("sync-progress");
  if (!el) return;
  el.textContent = `已同步 0 筆商品`;
  progressInterval = setInterval(() => {
    count += Math.floor(Math.random() * 3) + 1;
    el.textContent = `已同步 ${count} 筆商品`;
  }, 500);
}

function stopProgressCounter(finalCount) {
  clearInterval(progressInterval);
  progressInterval = null;
  const el = document.getElementById("sync-progress");
  if (el && finalCount !== undefined) {
    el.textContent = `共同步 ${finalCount} 筆商品`;
  }
}

async function runSync() {
  const btn = document.getElementById("sync-crawl-btn");
  const loading = document.getElementById("sync-loading");
  const result = document.getElementById("sync-result");
  const barFill = document.getElementById("sync-bar-fill");
  const loadingText = document.getElementById("sync-loading-text");

  if (btn) btn.disabled = true;
  if (result) result.classList.add("hidden");
  if (loading) loading.classList.remove("hidden");
  await requestWakeLock();

  if (barFill) { barFill.className = "sync-loading-bar__fill"; void barFill.offsetWidth; barFill.classList.add("phase-1"); }
  if (loadingText) loadingText.textContent = "正在連線目標網站...";

  setTimeout(() => {
    if (barFill) barFill.classList.replace("phase-1", "phase-2");
    if (loadingText) loadingText.textContent = "正在同步商品資料...";
    startProgressCounter();
  }, 800);

  try {
    const res = await fetch("/admin/crawl", { method: "POST" });
    if (res.status === 401) { location.href = "/admin-login.html"; return; }

    if (barFill) barFill.classList.replace("phase-2", "phase-3");
    if (loadingText) loadingText.textContent = "同步完成！";

    if (!res.ok) {
      stopProgressCounter();
      showError(`同步失敗：HTTP ${res.status}`);
      setTimeout(() => { if (loading) loading.classList.add("hidden"); }, 1000);
      return;
    }

    const body = await res.json();
    stopProgressCounter(body?.crawledCount || 0);

    setTimeout(() => {
      if (loading) loading.classList.add("hidden");
      if (barFill) barFill.className = "sync-loading-bar__fill";

      if (body?.ok) {
        document.getElementById("sync-crawled").textContent = String(body.crawledCount || 0);
        document.getElementById("sync-upserted").textContent = String(body.upserted || 0);
        document.getElementById("sync-source").textContent = body.source || "-";
        if (result) result.classList.remove("hidden");
      } else {
        showError("同步失敗（回應格式錯誤）");
      }
    }, 500);
  } catch (err) {
    stopProgressCounter();
    showError(`同步失敗：${String(err)}`);
    if (loading) loading.classList.add("hidden");
    if (barFill) barFill.className = "sync-loading-bar__fill";
  } finally {
    if (btn) btn.disabled = false;
    releaseWakeLock();
  }
}

export function initSync() {
  document.getElementById("sync-crawl-btn")?.addEventListener("click", runSync);
}
