import { initOrders, refreshOrders } from "./app-admin-orders.js";
import { initProducts } from "./app-admin-products.js";
import { initSettings } from "./app-admin-settings.js";
import { initMarketing } from "./app-admin-marketing.js";
import {
  buildStorePublicBaseUrl,
  buildStorePublicDisplayText,
  buildStoreDomainChangeMessage,
} from "./store-url.js";

const TAB_TITLES = {
  products: "商品管理",
  camera: "拍照上架",
  orders: "訂單列表",
  settings: "網站設定",
};

// "products" is the main view; all others open as bottom sheets
const SHEET_TABS = new Set(["camera", "orders", "settings"]);

let currentTab = "products";
let sheetOpen = false;
const tabInitialized = {};

// ── Bottom Sheet ──

const sheet = document.getElementById("admin-sheet");
const sheetBackdrop = document.getElementById("admin-sheet-backdrop");
const sheetBody = document.getElementById("admin-sheet-body");
const sheetTitle = document.getElementById("admin-sheet-title");
const sheetClose = document.getElementById("admin-sheet-close");
const sheetHandle = document.getElementById("admin-sheet-handle");

function openSheet(tab) {
  const panel = document.querySelector(`.admin-tab-panel[data-tab="${tab}"]`);
  if (!panel || !sheet) return;

  sheetTitle.textContent = TAB_TITLES[tab] || "";

  // Move panel content into sheet body
  sheetBody.innerHTML = "";
  sheetBody.appendChild(panel);
  panel.classList.remove("hidden");

  // Re-init sub-tabs inside the sheet
  initSubTabs(panel);

  requestAnimationFrame(() => {
    sheet.classList.add("is-open");
    sheetBackdrop.classList.add("is-open");
    document.body.style.overflow = "hidden";
  });
  sheetOpen = true;
  currentTab = tab;

  // Highlight active nav
  document.querySelectorAll(".admin-nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-tab") === tab);
  });

  // Lazy init
  if (!tabInitialized[tab]) {
    tabInitialized[tab] = true;
    if (tab === "orders") initOrders();
    if (tab === "settings") initSettings();
  }
}

function closeSheet() {
  if (!sheet || !sheetOpen) return;

  sheet.classList.remove("is-open");
  sheetBackdrop.classList.remove("is-open");
  document.body.style.overflow = "";
  sheetOpen = false;

  // Move panel back to main so state is preserved
  const panel = sheetBody.querySelector(".admin-tab-panel");
  if (panel) {
    panel.classList.add("hidden");
    document.getElementById("admin-main").appendChild(panel);
  }

  // Reset nav to products
  currentTab = "products";
  document.querySelectorAll(".admin-nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-tab") === "products");
  });
}

// Close via backdrop, X button
if (sheetBackdrop) sheetBackdrop.addEventListener("click", closeSheet);
if (sheetClose) sheetClose.addEventListener("click", closeSheet);

// Swipe-down to close
let touchStartY = 0;
let touchDeltaY = 0;
let isDragging = false;

if (sheetHandle) {
  sheetHandle.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
    isDragging = true;
    sheet.style.transition = "none";
  }, { passive: true });
}

document.addEventListener("touchmove", (e) => {
  if (!isDragging || !sheetOpen) return;
  touchDeltaY = e.touches[0].clientY - touchStartY;
  if (touchDeltaY > 0) {
    sheet.style.transform = `translateY(${touchDeltaY}px)`;
  }
}, { passive: true });

document.addEventListener("touchend", () => {
  if (!isDragging) return;
  isDragging = false;
  sheet.style.transition = "";
  sheet.style.transform = "";
  if (touchDeltaY > 100) {
    closeSheet();
  }
  touchDeltaY = 0;
});

// ── Tab switching ──

function switchTab(tab) {
  if (tab === currentTab && !sheetOpen) return;

  // If a sheet is open and user taps a different tab, close first
  if (sheetOpen) {
    closeSheet();
    if (tab === "products") return;
  }

  if (tab === "products") {
    // Show products panel in main area (already visible)
    const productsPanel = document.querySelector('.admin-tab-panel[data-tab="products"]');
    if (productsPanel) productsPanel.classList.remove("hidden");
    currentTab = "products";
    document.querySelectorAll(".admin-nav-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-tab") === "products");
    });
    return;
  }

  if (SHEET_TABS.has(tab)) {
    // Small delay if we just closed a sheet
    if (sheetOpen) {
      setTimeout(() => openSheet(tab), 350);
    } else {
      openSheet(tab);
    }
  }
}

// ── Errors ──

export function showError(message) {
  const node = document.getElementById("admin-error");
  if (!node) return;
  node.textContent = message;
  node.classList.remove("hidden");
  setTimeout(() => node.classList.add("hidden"), 5000);
}

export function hideError() {
  const node = document.getElementById("admin-error");
  if (node) node.classList.add("hidden");
}

// ── Sub-tabs ──

function initSubTabs(scope) {
  const root = scope || document;
  root.querySelectorAll(".tab-sub-nav").forEach((nav) => {
    nav.querySelectorAll(".tab-sub-btn").forEach((btn) => {
      // Remove old listeners by cloning
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
      clone.addEventListener("click", () => {
        const subtab = clone.getAttribute("data-subtab");
        const parent = clone.closest(".admin-tab-panel");
        if (!parent || !subtab) return;
        nav.querySelectorAll(".tab-sub-btn").forEach((b) =>
          b.classList.toggle("is-active", b === clone)
        );
        parent.querySelectorAll(".admin-sub-panel").forEach((panel) => {
          panel.classList.toggle("hidden", panel.getAttribute("data-subtab-panel") !== subtab);
        });
      });
    });
  });
}

// ── Bootstrap ──

function bootstrap() {
  const publicUrlLink = document.getElementById("public-url-link");
  const baseUrl = buildStorePublicBaseUrl({
    plan: window.__STORE_PLAN,
    slug: window.__STORE_SLUG,
    mainDomain: window.__MAIN_DOMAIN,
    protocol: location.protocol,
    origin: location.origin,
    apiBase: window.__API_BASE || "",
  });

  if (publicUrlLink instanceof HTMLAnchorElement) {
    publicUrlLink.href = `${baseUrl}/`;
    publicUrlLink.textContent = buildStorePublicDisplayText({
      plan: window.__STORE_PLAN,
      slug: window.__STORE_SLUG,
      mainDomain: window.__MAIN_DOMAIN,
      protocol: location.protocol,
      origin: location.origin,
      apiBase: window.__API_BASE || "",
    });
  }

  document.querySelectorAll(".admin-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab) switchTab(tab);
    });
  });

  initSubTabs();

  tabInitialized["products"] = true;
  tabInitialized["camera"] = true;
  initProducts();
  initMarketing();

  import("./app-admin-recognize.js");
}

window.__buildStoreDomainChangeMessage = buildStoreDomainChangeMessage;

bootstrap();
