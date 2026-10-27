// One-time "what's new" popup for sellers. Bump NOTICE_ID for each new announcement;
// once closed, the same ID is never shown again in that browser.
(function() {
  var NOTICE_ID = "2026-10-26";
  var STORAGE_KEY = "vovosnap_update_notice_seen";

  function getSeen() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function markSeen() {
    try { localStorage.setItem(STORAGE_KEY, NOTICE_ID); } catch (e) {}
  }

  if (getSeen() === NOTICE_ID) return;

  // New sellers get the onboarding tutorial instead; skip this notice for them for good.
  var tut = window.__TUTORIAL_STATE;
  if (!tut || (!tut.completed && !tut.dismissed)) { markSeen(); return; }

  var SECTIONS = [
    {
      title: "商店前台",
      items: [
        "商品列表改為往下滑自動載入更多商品",
        "快速篩選按鈕配合商店主題色，文字篩選按鈕排成一列",
        "商店招牌置中顯示，頁首支援寬版 Logo",
        "新增「頁首商店名稱」開關，可設定只顯示 Logo（設定 → 外觀）",
      ],
    },
    {
      title: "商品合規提醒",
      items: [
        "提醒區塊預設收合",
        "已下架、已刪除或已被平台移除的商品不再列入提醒",
        "農藥、功效宣稱、食品、化妝品類，以及「疑似」等級的項目不再提醒",
      ],
    },
  ];

  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.style.cssText = style;
    if (text) n.textContent = text;
    return n;
  }

  function show() {
    var overlay = el("div", "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "系統更新說明");

    var backdrop = el("div", "position:absolute;inset:0;background:rgba(0,0,0,0.4);");
    var card = el("div", "position:relative;background:#fff;border-radius:12px;max-width:420px;width:100%;max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.18);color:var(--admin-text);");

    var img = el("img", "display:block;width:100%;height:auto;aspect-ratio:800/514;background:#f6f5f1;border-radius:12px 12px 0 0;");
    img.src = "/assets/images/update-2026-10.webp";
    img.alt = "";

    var closeX = el("button", "position:absolute;top:8px;right:8px;width:32px;height:32px;border:none;border-radius:50%;background:rgba(255,255,255,0.9);font-size:16px;line-height:1;cursor:pointer;color:var(--admin-text-secondary);");
    closeX.type = "button";
    closeX.setAttribute("aria-label", "關閉");
    closeX.innerHTML = "&#x2715;";

    var body = el("div", "padding:18px 20px 20px;");
    body.appendChild(el("p", "margin:0 0 2px;font-size:12px;color:var(--admin-text-muted);", "2026/10/26 更新"));
    body.appendChild(el("h3", "margin:0 0 14px;font-size:17px;", "系統更新說明"));

    SECTIONS.forEach(function(sec) {
      body.appendChild(el("p", "margin:0 0 6px;font-size:13px;font-weight:600;", sec.title));
      var ul = el("ul", "margin:0 0 14px;padding-left:18px;font-size:13px;line-height:1.7;color:var(--admin-text-secondary);");
      sec.items.forEach(function(t) { ul.appendChild(el("li", "", t)); });
      body.appendChild(ul);
    });

    var ok = el("button", "display:block;width:100%;margin-top:4px;padding:10px;border:none;border-radius:8px;background:var(--admin-active);color:#fff;font-size:14px;cursor:pointer;", "我知道了");
    ok.type = "button";
    body.appendChild(ok);

    card.appendChild(img);
    card.appendChild(closeX);
    card.appendChild(body);
    overlay.appendChild(backdrop);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function close() {
      markSeen();
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ok.addEventListener("click", close);
    closeX.addEventListener("click", close);
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    ok.focus();
  }

  setTimeout(show, 800);
})();
