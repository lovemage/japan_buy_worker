/**
 * Blog articles registry — single source of truth for all blog pages.
 * When adding a new article, add it here. Related links, blog index,
 * and tag filters will pick it up automatically.
 */
var BLOG_ARTICLES = [
  {
    href: "/blog/daigou-exchange-rate-auto-pricing",
    tag: "定價策略",
    title: "做日本代購，匯率天天變，能先設定代購費比例再自動定價嗎？",
    desc: "先設定日幣匯率與固定加價或百分比利潤，再由系統換算售價，並逐件處理運費與高風險商品。",
    thumb: "/assets/images/blog/og-daigou-exchange-rate-pricing.webp",
    date: "2026-08-07",
    readMin: 6,
  },
  {
    href: "/blog/secondhand-bag-photo-recognition",
    tag: "二手上架",
    title: "二手包沒有條碼，拍照辨識上架靠譜嗎？",
    desc: "照片能協助建立品類與描述初稿，品牌真偽、精確型號、尺寸與磨損仍要由賣家查證。",
    thumb: "/assets/images/blog/og-secondhand-bag-no-barcode.webp",
    date: "2026-08-07",
    readMin: 5,
  },
  {
    href: "/blog/japan-drugstore-batch-recognition",
    tag: "代購場景",
    title: "在日本藥妝店拍一批商品，能一次辨識並自動生成連結嗎？",
    desc: "目前以單一商品最多三張照片辨識。先分商品拍攝，再逐件確認、定價與發布商品連結。",
    thumb: "/assets/images/blog/og-japan-drugstore-batch-recognition.webp",
    date: "2026-08-07",
    readMin: 5,
  },
  {
    href: "/blog/taobao-auto-listing-duplicate-risk",
    tag: "平台風險",
    title: "代購用自動上架工具，會被淘寶判定成複製商品或鋪貨嗎？",
    desc: "先分清自動建檔、複製他人資料與重複發布，並保留原始照片、來源憑證和人工複核。",
    thumb: "/assets/images/blog/og-taobao-auto-listing-risk.webp",
    date: "2026-08-07",
    readMin: 6,
  },
  {
    href: "/blog/edit-ai-recognition-before-publish",
    tag: "AI 風險",
    title: "AI 辨識錯商品怎麼辦？發布前可以自己改嗎？",
    desc: "辨識結果是初稿。發布前核對品名、規格、價格、分類與瑕疵，照片看不到的資料不要讓 AI 猜。",
    thumb: "/assets/images/blog/og-ai-listing-review-edit.webp",
    date: "2026-08-07",
    readMin: 5,
  },
  {
    href: "/blog/free-or-pay-per-listing-software",
    tag: "工具價格",
    title: "拍照上架工具有免費版嗎？也能按上架數量付費嗎？",
    desc: "比較免費額度、商品上限、辨識量與按量收費，並用每月新增商品數估算適合的方案。",
    thumb: "/assets/images/blog/og-free-usage-based-listing.webp",
    date: "2026-08-07",
    readMin: 5,
  },
  {
    href: "/blog/photo-listing-software-pricing",
    tag: "工具價格",
    title: "拍照上架軟體通常怎麼收費？訂閱、辨識次數與商品上限一次看",
    desc: "月費之外還要看 AI 次數、商品上限、圖片處理和額外用量，整理現行方案與挑選方式。",
    thumb: "/assets/images/blog/og-photo-listing-software-pricing.webp",
    date: "2026-08-07",
    readMin: 6,
  },
  {
    href: "/blog/secondhand-fast-listing-alternatives",
    tag: "二手上架",
    title: "除了拍照自動辨識，還有哪些方法能把二手商品快速掛到網路上？",
    desc: "用批次拍攝、固定欄位、狀況分級與單一商店連結，把二手商品快速掛網又不漏寫瑕疵。",
    thumb: "/assets/images/blog/og-secondhand-fast-listing-alternatives.webp",
    date: "2026-08-07",
    readMin: 6,
  },
  {
    href: "/blog/japan-cosmetics-photo-listing-software",
    tag: "工具選擇",
    title: "日本藥妝代購有拍照自動上架軟體嗎？工具選擇、流程與收費一次看",
    desc: "從照片辨識、商品資料確認到建立自己的商店，整理日本藥妝快速上架工具的選擇方法與費用。",
    thumb: "/assets/images/blog/og-japan-cosmetics-photo-listing.webp",
    date: "2026-08-06",
    readMin: 7,
  },
  {
    href: "/blog/ai-vs-barcode-product-listing",
    tag: "上架比較",
    title: "AI 拍照上架、掃碼上架、手動輸入哪個準？三種商品建檔方式比較",
    desc: "條碼擅長確認標準商品身分，AI 擅長從照片建立初稿，手動輸入保留最高控制。一次看懂三種方法。",
    thumb: "/assets/images/blog/og-ai-barcode-manual-listing.webp",
    date: "2026-08-06",
    readMin: 8,
  },
  {
    href: "/blog/solo-seller-fast-product-listing",
    tag: "上架教學",
    title: "一個人怎麼快速上新？不用 AI 也能加快商品上架的 6 種方法",
    desc: "從批次拍照、欄位範本到二手商品分級，整理一人賣家真正能執行的快速上新方法。",
    thumb: "/assets/images/blog/og-solo-seller-fast-listing.webp",
    date: "2026-08-06",
    readMin: 8,
  },
  {
    href: "/blog/japan-cosmetics-daigou-guide",
    tag: "實戰攻略",
    title: "日本藥妝代購攻略：走進店裡拍照就上架",
    desc: "第一人稱實戰記錄：從大阪松本清走道拍照，AI 60 秒辨識上架、LINE 群開團到出貨，完整流程親身示範給你看。",
    thumb: "/assets/images/blog/hero-daigou.webp",
    date: "2026-06-13",
    readMin: 9,
  },
  {
    href: "/blog/sell-secondhand-items-fast",
    tag: "上架教學",
    title: "快速上架你的二手不用商品：拍照就能開賣，清空間還能賺一筆",
    desc: "家裡堆滿不用的東西？用 vovosnap 拍照就能自動生成描述、定價、上架。分享連結到 LINE 群，朋友自助挑選下單。",
    thumb: "/assets/images/blog/thumb-secondhand.webp",
    date: "2026-04-07",
    readMin: 7,
  },
  {
    href: "/blog/daigou-profit-calculation",
    tag: "定價策略",
    title: "代購利潤怎麼算？業餘與專業代購的定價策略完整教學",
    desc: "業餘代購建議 10%-20%，專業代購用匯率差 + 代購費雙層利潤。用實際數字帶你算一次。",
    thumb: "/assets/images/blog/thumb-profit.webp",
    date: "2026-04-04",
    readMin: 6,
  },
  {
    href: "/blog/daigou-preparation-checklist",
    tag: "行前準備",
    title: "代購前需要準備什麼？出國代購完整準備清單",
    desc: "從人脈經營、eSIM 網路、網銀 OTP、行李規劃到路線查詢和信用卡選擇，一次整理代購行前準備清單。",
    thumb: "/assets/images/blog/thumb-preparation.webp",
    date: "2026-04-04",
    readMin: 7,
  },
  {
    href: "/blog/first-time-daigou-guide",
    tag: "新手必讀",
    title: "第一次代購就上手：出國代購完整教學，拍照就能賺回機票錢",
    desc: "從出國前準備、到日本藥妝店現場拍照上架、LINE 群接單到回國出貨，手把手帶你走完代購全流程。",
    thumb: "/assets/images/blog/thumb-first-time.webp",
    date: "2026-04-04",
    readMin: 8,
  },
];

/* ── Tag filter state ── */
var activeTag = "all";

function getAllTags() {
  var tags = [];
  BLOG_ARTICLES.forEach(function (a) {
    if (tags.indexOf(a.tag) === -1) tags.push(a.tag);
  });
  return tags;
}

function renderTagFilters() {
  var container = document.getElementById("blog-tag-filters");
  if (!container) return;

  var tags = getAllTags();
  var html = '<button class="tag-btn' + (activeTag === "all" ? " active" : "") + '" data-tag="all">全部</button>';
  tags.forEach(function (t) {
    html += '<button class="tag-btn' + (activeTag === t ? " active" : "") + '" data-tag="' + t + '">' + t + "</button>";
  });
  container.innerHTML = html;

  container.querySelectorAll(".tag-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeTag = btn.getAttribute("data-tag");
      renderTagFilters();
      renderBlogIndex();
    });
  });
}

/**
 * Render related articles into a .related-list element,
 * excluding the current page.
 */
function renderRelatedArticles() {
  var list = document.querySelector(".related-list");
  if (!list) return;

  var current = location.pathname;
  var others = BLOG_ARTICLES.filter(function (a) {
    return a.href !== current;
  });

  var html = others
    .map(function (a) {
      return '<li><a href="' + a.href + '">' + a.title + "</a></li>";
    })
    .join("");
  html += '<li><a href="/#pricing">vovosnap 方案比較</a></li>';
  list.innerHTML = html;
}

/**
 * Render blog index cards with thumbnails into #blog-article-list container.
 */
function renderBlogIndex() {
  var container = document.getElementById("blog-article-list");
  if (!container) return;

  var filtered = activeTag === "all"
    ? BLOG_ARTICLES
    : BLOG_ARTICLES.filter(function (a) { return a.tag === activeTag; });

  if (filtered.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#A09A90;padding:40px 0;">此分類暫無文章</p>';
    return;
  }

  container.innerHTML = filtered.map(function (a) {
    var parts = a.date.split("-");
    var dateDisplay = parts[0] + " 年 " + Number(parts[1]) + " 月 " + Number(parts[2]) + " 日";
    return (
      '<a href="' + a.href + '" class="post-card post-card--with-thumb">' +
      '<div class="post-card__thumb"><img src="' + a.thumb + '" alt="" width="120" height="120" loading="lazy"></div>' +
      '<div class="post-card__body">' +
      '<span class="post-tag">' + a.tag + "</span>" +
      "<h3>" + a.title + "</h3>" +
      "<p>" + a.desc + "</p>" +
      '<div class="post-meta">' + dateDisplay + " ・ 閱讀 " + a.readMin + " 分鐘</div>" +
      "</div></a>"
    );
  }).join("");
}

// Auto-init on load
if (document.querySelector(".related-list")) {
  renderRelatedArticles();
}
if (document.getElementById("blog-article-list")) {
  renderTagFilters();
  renderBlogIndex();
}
