let selectedTone = "professional";
let selectedPlatform = "line";

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
    const el = document.getElementById("marketing-usage");
    if (!el) return;
    if (data.limit === -1) {
      el.textContent = "本月已用 " + data.used + " 次（無限制）";
    } else {
      el.textContent = "本月 " + data.used + " / " + data.limit + " 次";
    }
  } catch {}
}

async function generateMarketing() {
  const btn = document.getElementById("btn-generate-marketing");
  const loading = document.getElementById("marketing-loading");
  const output = document.getElementById("marketing-output");
  const result = document.getElementById("marketing-result");
  const status = document.getElementById("marketing-status");

  if (btn) btn.disabled = true;
  if (loading) loading.classList.remove("hidden");
  if (output) output.classList.add("hidden");
  if (status) status.textContent = "";

  try {
    const res = await apiFetch("/api/admin/ai-marketing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tone: selectedTone, platform: selectedPlatform }),
    });

    if (res.status === 401) { location.href = "/admin-login.html"; return; }
    const data = await res.json();

    if (!data.ok) {
      if (status) status.textContent = data.error || "產生失敗";
      return;
    }

    if (result) result.textContent = data.content || "";
    if (output) output.classList.remove("hidden");
    loadMarketingUsage();
  } catch (err) {
    if (status) status.textContent = "產生失敗：" + String(err);
  } finally {
    if (btn) btn.disabled = false;
    if (loading) loading.classList.add("hidden");
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
  initToneSelector();
  initPlatformSelector();

  document.getElementById("btn-generate-marketing")?.addEventListener("click", generateMarketing);
  document.getElementById("btn-copy-marketing")?.addEventListener("click", copyMarketingResult);

  loadMarketingUsage();
}
