/**
 * Helpers for pre-rendering client-rendered storefront pages.
 *
 * The storefront HTML in public/ is a shell that app-list.js / app-product.js
 * fill in at runtime, which means crawlers and AI fetchers (most of which do
 * not execute JS) receive a page with no product copy. The router uses these
 * helpers to write the same values into the same elements server-side; the
 * client later overwrites them with identical content, so hydration stays the
 * single source of truth and nothing can drift.
 */

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Replace the inner HTML of the element carrying `id`. No-op when absent. */
export function setElementHtmlById(html, id, inner) {
  const pattern = new RegExp(`(<([a-zA-Z0-9]+)\\b[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(</\\2>)`);
  return html.replace(pattern, (_match, open, _tag, close) => `${open}${inner}${close}`);
}

/** Replace the text content of the element carrying `id`. Empty text is a no-op. */
export function setElementTextById(html, id, text) {
  if (!text) return html;
  return setElementHtmlById(html, id, escapeHtml(text));
}

/** Integer thousands separators, matching toLocaleString("en-US") in the client. */
export function formatThousands(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
