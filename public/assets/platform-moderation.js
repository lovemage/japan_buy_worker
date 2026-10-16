// 平台後台：商品合規審核頁。
// 與 platform-admin.html 的主程式共用全域的 adminToken（classic script）。

var moderationFilter = "active";
var moderationCurrentCase = null;

function modEsc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function modDate(value) {
  if (!value) return "";
  var iso = String(value).indexOf("T") === -1 ? String(value).replace(" ", "T") + "Z" : String(value);
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function modApi(path, options) {
  var opts = options || {};
  var headers = Object.assign({ authorization: "Bearer " + adminToken }, opts.headers || {});
  var res = await fetch(path, Object.assign({}, opts, { headers: headers }));
  var data = await res.json().catch(function () { return {}; });
  if (res.status === 401) {
    alert("登入已過期，請重新登入");
    logout();
  }
  return { ok: res.ok && data.ok, data: data };
}

async function loadModerationPage() {
  await Promise.all([loadModerationSummary(), loadModerationCases()]);
}

async function loadModerationSummary() {
  var r = await modApi("/api/platform-admin/moderation/summary");
  if (!r.ok) return;
  var c = r.data.counts || {};
  document.getElementById("mod-count-open").textContent = c.open || 0;
  document.getElementById("mod-count-overdue").textContent = r.data.overdue || 0;
  document.getElementById("mod-count-review").textContent = (c.responded || 0) + (c.appealed || 0);
  document.getElementById("mod-count-removed").textContent = c.removed || 0;
  document.getElementById("mod-scan-enabled").checked = r.data.scanEnabled !== false;
  var s = r.data.lastScan;
  var el = document.getElementById("mod-last-scan");
  if (s) {
    el.textContent = "上次掃描：" + modDate(s.at) + "（" + (s.trigger === "manual" ? "手動" : "排程") + "）・檢查 " + s.scanned + " 件・新增提醒 " + s.flagged + " 件・通知 " + s.notifiedStores + " 間商店"
      + (s.remaining ? "・尚有 " + s.remaining + " 件待下次掃描" : "")
      + (s.aiUsed ? "" : "・未使用 AI（改用關鍵字判斷）")
      + (s.errors && s.errors.length ? "・錯誤：" + s.errors.join("；") : "");
  } else {
    el.textContent = "尚未執行掃描";
  }
}

async function loadModerationCases() {
  var list = document.getElementById("mod-list");
  list.innerHTML = '<p class="desc">載入中…</p>';
  var r = await modApi("/api/platform-admin/moderation/cases?filter=" + encodeURIComponent(moderationFilter));
  if (!r.ok) {
    list.innerHTML = '<p class="desc">' + modEsc(r.data.error || "載入失敗") + "</p>";
    return;
  }
  var cases = r.data.cases || [];
  if (cases.length === 0) {
    list.innerHTML = '<p class="desc">目前沒有案件。</p>';
    return;
  }
  list.innerHTML = cases.map(function (c) {
    var img = c.product_image ? '<img src="' + modEsc(storeImageUrl(c)) + '" alt="" loading="lazy">' : '<div class="mod-thumb-empty"></div>';
    var tags = '<span class="mod-tag mod-tag--' + modEsc(c.risk_level) + '">' + modEsc(c.risk_label) + "</span>"
      + '<span class="mod-tag">' + modEsc(c.rule_label) + "</span>"
      + '<span class="mod-tag">' + modEsc(c.status_label) + "</span>"
      + (c.overdue ? '<span class="mod-tag mod-tag--overdue">已逾期</span>' : "")
      + (c.suggest_suspension ? '<span class="mod-tag mod-tag--strike">90 天內 ' + modEsc(c.store_strikes) + " 次下架，建議暫停店舖</span>" : "");
    var deadline = c.status === "open" && c.seller_deadline_at ? "・回覆期限 " + modDate(c.seller_deadline_at) : "";
    return '<div class="mod-row">' + img
      + "<div><div class=\"mod-row__title\">" + modEsc(c.product_title || "（商品已刪除）") + "</div>"
      + '<div class="mod-row__meta">' + modEsc(c.store_name || "") + "（/s/" + modEsc(c.store_slug || "") + "）" + deadline + "<br>" + modEsc(c.reason || "") + "</div>"
      + '<div class="mod-tags">' + tags + "</div></div>"
      + '<button class="btn btn-dark" type="button" onclick="openModerationCase(' + Number(c.id) + ')">檢視處理</button>'
      + "</div>";
  }).join("");
}

function storeImageUrl(c) {
  var url = String(c.product_image || c.image || "");
  if (url.indexOf("/api/images/") === 0 && c.store_slug) return "/s/" + c.store_slug + url;
  return url;
}

function setModerationFilter(filter, btn) {
  moderationFilter = filter;
  document.querySelectorAll("#mod-filters .pill-btn").forEach(function (b) { b.classList.remove("active"); });
  if (btn) btn.classList.add("active");
  loadModerationCases();
}

async function runModerationScanNow() {
  var btn = document.getElementById("mod-scan-btn");
  btn.disabled = true;
  btn.textContent = "掃描中…";
  var r = await modApi("/api/platform-admin/moderation/scan", { method: "POST" });
  btn.disabled = false;
  btn.textContent = "立即掃描（最多 200 件）";
  if (!r.ok) {
    alert(r.data.error || "掃描失敗");
    return;
  }
  var s = r.data.summary;
  alert("掃描完成：檢查 " + s.scanned + " 件，新增提醒 " + s.flagged + " 件" + (s.remaining ? "，尚有 " + s.remaining + " 件可再按一次掃描" : ""));
  loadModerationPage();
}

async function toggleModerationScan(enabled) {
  var r = await modApi("/api/platform-admin/moderation/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scanEnabled: enabled }),
  });
  if (!r.ok) alert(r.data.error || "設定失敗");
}

var MOD_ACTION_LABELS = {
  dismiss: "確認無違規",
  remove: "下架商品並通知會員",
  restore: "申訴通過，恢復可上架",
  uphold: "申訴不通過，維持下架",
  note: "只新增備註",
};

var MOD_ACTOR_LABELS = { system: "系統", platform_admin: "管理員", seller: "會員" };

var MOD_LOG_LABELS = {
  flagged: "標記為可能違規",
  notified: "已寄出通知",
  notify_failed: "通知未寄出",
  seller_response: "會員說明",
  appeal: "會員申訴",
  seller_removed: "會員自行下架",
  dismissed: "確認無違規",
  removed: "平台下架",
  restored: "申訴通過",
  appeal_rejected: "申訴不通過",
  note: "備註",
};

var MOD_ALLOWED = {
  open: ["remove", "dismiss", "note"],
  responded: ["dismiss", "remove", "note"],
  removed: ["restore", "note"],
  appealed: ["restore", "uphold", "note"],
};

function modProductBox(title, p) {
  if (!p) return '<div class="mod-box"><h4>' + modEsc(title) + "</h4>商品已刪除</div>";
  return '<div class="mod-box"><h4>' + modEsc(title) + "</h4>"
    + (p.image ? '<img src="' + modEsc(p.image) + '" alt="">' : "")
    + "<strong>" + modEsc(p.title || "") + "</strong><br>"
    + "品牌：" + modEsc(p.brand || "—") + "<br>分類：" + modEsc(p.category || "—") + "<br>"
    + modEsc(String(p.description || "").slice(0, 600)) + "</div>";
}

async function openModerationCase(caseId) {
  var r = await modApi("/api/platform-admin/moderation/cases/" + caseId);
  if (!r.ok) {
    alert(r.data.error || "載入失敗");
    return;
  }
  var c = r.data.case;
  moderationCurrentCase = c;
  var slug = c.store ? c.store.slug : "";
  var snap = c.snapshot || {};
  var snapView = { title: snap.title, brand: snap.brand, category: snap.category, description: snap.description, image: snap.image ? storeImageUrl({ product_image: snap.image, store_slug: slug }) : "" };
  var cur = c.currentProduct ? Object.assign({}, c.currentProduct, { image: c.currentProduct.image ? storeImageUrl({ product_image: c.currentProduct.image, store_slug: slug }) : "" }) : null;
  var productLink = cur && cur.code && slug ? '<a href="/s/' + modEsc(slug) + "/product?code=" + encodeURIComponent(cur.code) + '" target="_blank" rel="noopener">開啟商品頁</a>' : "";
  var actions = (MOD_ALLOWED[c.status] || ["note"]).map(function (a) {
    var cls = a === "remove" || a === "uphold" ? "btn btn-danger" : a === "note" ? "btn" : "btn btn-dark";
    return '<button class="' + cls + '" type="button" onclick="submitModerationAction(\'' + a + '\')">' + modEsc(MOD_ACTION_LABELS[a]) + "</button>";
  }).join("");
  var log = (c.actions || []).map(function (a) {
    return "<li>" + modEsc(modDate(a.created_at)) + "｜" + modEsc(MOD_ACTOR_LABELS[a.actor] || a.actor) + "｜" + modEsc(MOD_LOG_LABELS[a.action] || a.action) + (a.detail ? "｜" + modEsc(a.detail) : "") + "</li>";
  }).join("");

  document.getElementById("mod-modal-body").innerHTML =
    "<h3>" + modEsc(snap.title || "商品") + "</h3>"
    + '<p class="meta">' + modEsc(c.store ? c.store.name : "") + "（/s/" + modEsc(slug) + "）・" + modEsc(c.status_label)
    + (c.overdue ? "・<strong>已逾期</strong>" : "") + "・" + productLink + "</p>"
    + '<div class="mod-tags"><span class="mod-tag mod-tag--' + modEsc(c.risk_level) + '">' + modEsc(c.risk_label) + '</span><span class="mod-tag">' + modEsc(c.rule_label) + "</span>"
    + '<span class="mod-tag">' + (c.source === "ai_scan" ? "AI 判斷" : "關鍵字判斷") + "</span></div>"
    + '<p class="desc" style="margin-top:8px;">判斷理由：' + modEsc(c.reason || "") + "<br>法規說明：" + modEsc(c.rule_guidance || "") + "</p>"
    + (c.seller_response ? '<div class="mod-box"><h4>會員說明（' + modEsc(modDate(c.seller_responded_at)) + "）</h4>" + modEsc(c.seller_response) + "</div>" : '<p class="desc">會員尚未回覆。</p>')
    + '<div class="mod-compare">' + modProductBox("標記時的內容（證據）", snapView) + modProductBox("目前的商品內容", cur) + "</div>"
    + (c.admin_note ? '<div class="mod-box"><h4>管理員備註</h4>' + modEsc(c.admin_note).replace(/\n/g, "<br>") + "</div>" : "")
    + '<label for="mod-note" style="display:block;font-size:12px;font-weight:600;margin-top:10px;">給會員的說明／內部備註（下架、恢復時會一併寄給會員）</label>'
    + '<textarea id="mod-note" maxlength="1000" placeholder="例如：此商品為日本藥品，非藥商不得販售。"></textarea>'
    + '<div class="mod-actions">' + actions + '<button class="btn" type="button" onclick="closeModerationCase()">關閉</button></div>'
    + '<h4 style="margin-top:14px;font-size:13px;">處理紀錄</h4><ul class="mod-log">' + (log || "<li>尚無紀錄</li>") + "</ul>";
  document.getElementById("mod-modal").classList.add("open");
}

function closeModerationCase() {
  document.getElementById("mod-modal").classList.remove("open");
  moderationCurrentCase = null;
}

async function submitModerationAction(action) {
  if (!moderationCurrentCase) return;
  var note = (document.getElementById("mod-note").value || "").trim();
  if (action === "note" && !note) {
    alert("請先輸入備註內容");
    return;
  }
  if ((action === "remove" || action === "uphold") && !confirm("確定要下架這件商品嗎？系統會寄信通知會員，會員可以提出申訴。")) return;
  var r = await modApi("/api/platform-admin/moderation/cases/" + moderationCurrentCase.id + "/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: action, note: note }),
  });
  if (!r.ok) {
    alert(r.data.error || "操作失敗");
    return;
  }
  if (action !== "note" && !r.data.emailed) alert("已完成，但通知信沒有寄出（會員可能沒有有效 Email），請另外聯繫會員。");
  var id = moderationCurrentCase.id;
  await loadModerationPage();
  if (action === "note") openModerationCase(id);
  else closeModerationCase();
}
