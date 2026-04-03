/**
 * Blog articles registry — single source of truth for all blog pages.
 * When adding a new article, add it here. Related links, blog index,
 * and tag filters will pick it up automatically.
 */
var BLOG_ARTICLES = [
  {
    href: "/blog/daigou-profit-calculation.html",
    tag: "定價策略",
    title: "代購利潤怎麼算？業餘與專業代購的定價策略完整教學",
    desc: "業餘代購建議 10%-20%，專業代購用匯率差 + 代購費雙層利潤。用實際數字帶你算一次。",
    thumb: "/assets/images/blog/thumb-profit.webp",
    date: "2026-04-04",
    readMin: 6,
  },
  {
    href: "/blog/daigou-preparation-checklist.html",
    tag: "行前準備",
    title: "代購前需要準備什麼？出國代購完整準備清單",
    desc: "從人脈經營、eSIM 網路、網銀 OTP、行李規劃到路線查詢和信用卡選擇，一次整理代購行前準備清單。",
    thumb: "/assets/images/blog/thumb-preparation.webp",
    date: "2026-04-04",
    readMin: 7,
  },
  {
    href: "/blog/first-time-daigou-guide.html",
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
      "<h2>" + a.title + "</h2>" +
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
