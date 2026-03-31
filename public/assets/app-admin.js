import { initSync } from "./app-admin-sync.js";
import { initOrders } from "./app-admin-orders.js";
import { initProducts } from "./app-admin-products.js";
import { initSettings } from "./app-admin-settings.js";

const TAB_TITLES = {
  products: "新增商品",
  camera: "拍照上架",
  sync: "網站同步",
  orders: "訂單列表",
  settings: "網站設定",
};

let currentTab = "products";
const tabInitialized = {};

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

function switchTab(tab) {
  if (tab === currentTab) return;
  currentTab = tab;

  document.querySelectorAll(".admin-tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.getAttribute("data-tab") !== tab);
  });

  document.querySelectorAll(".admin-nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-tab") === tab);
  });

  const title = document.getElementById("admin-topbar-title");
  if (title) title.textContent = TAB_TITLES[tab] || "";

  if (!tabInitialized[tab]) {
    tabInitialized[tab] = true;
    if (tab === "orders") initOrders();
    if (tab === "settings") initSettings();
    if (tab === "sync") initSync();
    // camera tab is initialized by app-admin-recognize.js on import
  }
}

function initSubTabs() {
  document.querySelectorAll(".tab-sub-nav").forEach((nav) => {
    nav.querySelectorAll(".tab-sub-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const subtab = btn.getAttribute("data-subtab");
        const parent = btn.closest(".admin-tab-panel");
        if (!parent || !subtab) return;
        nav.querySelectorAll(".tab-sub-btn").forEach((b) =>
          b.classList.toggle("is-active", b === btn)
        );
        parent.querySelectorAll(".admin-sub-panel").forEach((panel) => {
          panel.classList.toggle("hidden", panel.getAttribute("data-subtab-panel") !== subtab);
        });
      });
    });
  });
}

function bootstrap() {
  document.querySelectorAll(".admin-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab) switchTab(tab);
    });
  });

  initSubTabs();

  // Initialize default tab and camera tab
  tabInitialized["products"] = true;
  tabInitialized["camera"] = true;
  initProducts();

  // Dynamic import for camera tab (self-initializing)
  import("./app-admin-recognize.js");
}

bootstrap();
