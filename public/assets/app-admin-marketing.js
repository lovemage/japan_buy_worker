import { handleUnauthorized } from "./session-guard.js";

let selectedTone = "professional";
let selectedPlatform = "line";

function ensureMarketingLoadingUi() {
  const loading = document.getElementById("marketing-loading");
  if (!loading) return;

  if (!loading.querySelector(".sync-loading-bar")) {
    const bar = document.createElement("div");
    bar.className = "sync-loading-bar";
    bar.style.marginTop = "8px";

    const fill = document.createElement("div");
    fill.className = "sync-loading-bar__fill";
    fill.id = "marketing-bar-fill";

    bar.appendChild(fill);
    loading.appendChild(bar);
  }

  if (!document.getElementById("marketing-loading-text")) {
    const text = document.createElement("p");
    text.className = "sync-loading-text";
    text.id = "marketing-loading-text";
    text.textContent = "vovoci AI 處理中";
    loading.appendChild(text);
  }
}

function showMarketingLoading(show) {
  const loading = document.getElementById("marketing-loading");
  const barFill = document.getElementById("marketing-bar-fill");
  const loadingText = document.getElementById("marketing-loading-text");

  if (!loading) return;

  if (show) {
    loading.classList.remove("hidden");
    if (barFill) {
      barFill.className = "sync-loading-bar__fill";
      void barFill.offsetWidth;
      barFill.classList.add("phase-1");
    }
    if (loadingText) loadingText.textContent = "vovoci AI 處理中";
    setTimeout(() => {
      if (barFill) barFill.classList.replace("phase-1", "phase-2");
      if (loadingText) loadingText.textContent = "vovoci AI 撰寫中";
    }, 600);
  } else {
    if (barFill) barFill.classList.replace("phase-2", "phase-3");
    if (loadingText) loadingText.textContent = "vovoci AI 編輯中";
    setTimeout(() => {
      loading.classList.add("hidden");
      if (barFill) barFill.className = "sync-loading-bar__fill";
    }, 400);
  }
}

function initToneSelector() {
  document.querySelectorAll("#tone-selector .country-toggle-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      selectedTone = btn.getAttribute("data-tone");
      document.querySelectorAll("#tone-selector .country-toggle-btn").forEach(function(b) {
        b.classList.toggle("selected", b === btn);
      });
    });
  });
}

function initPlatformSelector() {
  var allBtns = document.querySelectorAll("#platform-selector .country-toggle-btn, #platform-selector-2 .country-toggle-btn");
  allBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      selectedPlatform = btn.getAttribute("data-platform");
      allBtns.forEach(function(b) {
        b.classList.toggle("selected", b === btn);
      });
    });
  });
}

async function loadMarketingUsage() {
  try {
    const res = await apiFetch("/api/admin/ai-marketing/usage");
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;
    const textEl = document.getElementById("marketing-usage-text");
    const barEl = document.getElementById("marketing-usage-bar");
    if (!textEl) return;
    var used = data.used || 0;
    var limit = data.limit || 0;
    textEl.textContent = "本月已使用 " + used + " / " + limit + " 次";
    if (barEl && limit > 0) {
      var pct = Math.min(100, Math.round((used / limit) * 100));
      barEl.style.width = pct + "%";
      if (pct >= 100) barEl.style.background = "var(--admin-danger, #ef4444)";
      else if (pct >= 80) barEl.style.background = "var(--admin-warning, #f59e0b)";
      else barEl.style.background = "#222";
    }
  } catch {}
}

async function generateMarketing() {
  const btn = document.getElementById("btn-generate-marketing");
  const output = document.getElementById("marketing-output");
  const result = document.getElementById("marketing-result");
  const status = document.getElementById("marketing-status");

  if (btn) btn.disabled = true;
  showMarketingLoading(true);
  if (output) output.classList.add("hidden");
  if (status) status.textContent = "";

  try {
    const res = await apiFetch("/api/admin/ai-marketing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tone: selectedTone, platform: selectedPlatform }),
    });

    if (handleUnauthorized(res)) return;
    const data = await res.json();

    if (!data.ok) {
      if (status) status.textContent = data.error || "產生失敗";
      return;
    }

    if (result) result.textContent = data.content || "";
    if (output) output.classList.remove("hidden");
    if (status) status.textContent = "文案產生完成！";
    loadMarketingUsage();
  } catch (err) {
    if (status) status.textContent = "產生失敗：" + String(err);
  } finally {
    if (btn) btn.disabled = false;
    showMarketingLoading(false);
  }
}

function copyMarketingResult() {
  const result = document.getElementById("marketing-result");
  if (!result) return;
  const text = result.textContent || "";
  if (!text) return;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      showCopyFeedback();
    });
  } else {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showCopyFeedback();
  }
}

function showCopyFeedback() {
  var btn = document.getElementById("btn-copy-marketing");
  if (!btn) return;
  var orig = btn.innerHTML;
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 已複製';
  btn.style.color = "#22c55e";
  setTimeout(function() { btn.innerHTML = orig; btn.style.color = ""; }, 2000);
}

export function initMarketing() {
  ensureMarketingLoadingUi();
  initToneSelector();
  initPlatformSelector();

  document.getElementById("btn-generate-marketing")?.addEventListener("click", generateMarketing);
  document.getElementById("btn-copy-marketing")?.addEventListener("click", copyMarketingResult);

  loadMarketingUsage();
}
