/**
 * Pre-render the blog index so crawlers (and AI fetchers, which mostly do not
 * run JS) see the article list in the static HTML instead of an empty shell.
 *
 * The card and tag markup is produced by running the *real* browser renderer
 * from public/assets/blog-data.js inside a tiny DOM stub, so the baked HTML can
 * never drift from what the client renders.
 *
 * Usage: node scripts/build-blog-index.mjs [--check]
 *   --check exits non-zero when the committed HTML is out of date.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createContext, runInContext } from "node:vm";

const blogDataUrl = new URL("../public/assets/blog-data.js", import.meta.url);
const indexUrl = new URL("../public/blog/index.html", import.meta.url);
const SITE = "https://vovosnap.com";

/** Run blog-data.js against a DOM stub and capture what it writes. */
export function renderBlogFragments() {
  const captured = Object.create(null);
  const makeNode = (id) => ({
    set innerHTML(value) {
      captured[id] = value;
    },
    get innerHTML() {
      return captured[id] || "";
    },
    querySelectorAll: () => [],
  });
  const nodes = {
    "blog-tag-filters": makeNode("blog-tag-filters"),
    "blog-article-list": makeNode("blog-article-list"),
  };
  const sandbox = {
    document: {
      getElementById: (id) => nodes[id] || null,
      querySelector: () => null,
    },
  };
  const context = createContext(sandbox);
  runInContext(readFileSync(blogDataUrl, "utf8"), context, { filename: "blog-data.js" });

  return {
    articles: sandbox.BLOG_ARTICLES,
    tagsHtml: captured["blog-tag-filters"] || "",
    cardsHtml: captured["blog-article-list"] || "",
  };
}

/** Blog + ItemList JSON-LD describing every published article. */
function buildBlogJsonLd(articles) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${SITE}/blog/#blog`,
    name: "電商開店與商品上架教學",
    description:
      "拍照上架、AI 商品辨識、一人開店、二手出清與代購情境的實用教學，幫你更快建立自己的電商網站。",
    url: `${SITE}/blog/`,
    inLanguage: "zh-Hant-TW",
    publisher: {
      "@type": "Organization",
      name: "我拍 VOVOSnap",
      url: `${SITE}/`,
      logo: `${SITE}/assets/images/logo-full.webp`,
    },
    blogPost: articles.map((article) => ({
      "@type": "BlogPosting",
      headline: article.title,
      description: article.desc,
      url: SITE + article.href,
      image: SITE + article.thumb,
      datePublished: article.date,
      dateModified: article.date,
      keywords: article.tag,
      author: { "@type": "Organization", name: "我拍 VOVOSnap" },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
}

/** Replace the content between `<!-- BUILD:NAME:START -->` and `:END`. */
function replaceBlock(html, name, body) {
  const start = `<!-- BUILD:${name}:START -->`;
  const end = `<!-- BUILD:${name}:END -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(html)) {
    throw new Error(`public/blog/index.html is missing the ${name} build markers`);
  }
  return html.replace(pattern, `${start}\n${body}\n${end}`);
}

export function buildBlogIndexHtml(currentHtml) {
  const { articles, tagsHtml, cardsHtml } = renderBlogFragments();
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error("blog-data.js exposed no BLOG_ARTICLES");
  }
  let html = replaceBlock(currentHtml, "BLOG_TAGS", tagsHtml);
  html = replaceBlock(html, "BLOG_CARDS", cardsHtml);
  html = replaceBlock(html, "BLOG_JSONLD", buildBlogJsonLd(articles));
  return html;
}

export function readBlogIndexHtml() {
  return readFileSync(indexUrl, "utf8");
}

// CLI entry point — skipped when the module is imported by a test.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const isCheck = process.argv.includes("--check");
  const current = readBlogIndexHtml();
  const next = buildBlogIndexHtml(current);

  if (current === next) {
    console.log("blog index is up to date");
  } else if (isCheck) {
    console.error("blog index is stale — run `node scripts/build-blog-index.mjs`");
    process.exit(1);
  } else {
    writeFileSync(indexUrl, next);
    console.log("blog index rebuilt");
  }
}
