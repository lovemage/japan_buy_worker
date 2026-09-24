export const DEFAULT_DISPLAY_SETTINGS = {
  viewMode: "2card",
  promoEnabled: true,
  wholesalePriceEnabled: false,
};

export const DEFAULT_CHECKOUT_PAGE_SETTINGS = {
  title: "感謝您的訂購！",
  messageTitle: "感謝您支持本商店服務",
  message: "完成匯款後依照下面表格輸入匯款後五碼, 提供小幫手查帳, 可加入官方賴 @abcde 或是聯繫Thread ID: abcd123",
  screenshotEnabled: true,
  screenshotTitle: "請截圖本頁，傳給賣家",
  screenshotMessage: "請保留訂單編號與明細，方便賣家核對訂單。",
  orderSummaryTitle: "訂單明細",
  paidTitle: "付款完成",
  paidMessage: "感謝你的付款，賣家將盡快與你聯繫。",
  social: {
    enabled: false,
    platform: "instagram",
    title: "追蹤我們的 Instagram",
    message: "掌握新品與最新消息",
    url: "",
    imageKey: "",
  },
};

const SOCIAL_PLATFORMS = new Set(["line", "facebook", "threads", "instagram"]);
const LEGACY_CHECKOUT_MESSAGE = "請將本頁面截圖傳至群組或 Line，我們將人工與您核對訂單內容。";

function cleanText(value, fallback, maxLength) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function migrateLegacyCheckoutMessage(value) {
  return value === LEGACY_CHECKOUT_MESSAGE ? DEFAULT_CHECKOUT_PAGE_SETTINGS.message : value;
}

function cleanUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function cleanImageKey(value, storeId) {
  if (typeof value !== "string" || !Number.isInteger(storeId) || storeId <= 0) return "";
  const prefix = `${storeId}/checkout-social/`;
  return value.startsWith(prefix) && /^[a-zA-Z0-9/_\-.]+$/.test(value) ? value : "";
}

export function getPublicCheckoutSettings(settings, storeId) {
  const source = settings && typeof settings.checkoutPage === "object" && settings.checkoutPage
    ? settings.checkoutPage
    : {};
  const socialSource = source.social && typeof source.social === "object" ? source.social : {};
  const legacyMessage = typeof settings?.checkoutMessage === "string"
    ? settings.checkoutMessage
    : DEFAULT_CHECKOUT_PAGE_SETTINGS.message;
  const platform = SOCIAL_PLATFORMS.has(socialSource.platform) ? socialSource.platform : "instagram";
  const imageKey = Number.isInteger(storeId)
    ? cleanImageKey(socialSource.imageKey, storeId)
    : (typeof socialSource.imageKey === "string" ? socialSource.imageKey : "");

  return {
    title: cleanText(source.title, DEFAULT_CHECKOUT_PAGE_SETTINGS.title, 80),
    messageTitle: cleanText(source.messageTitle, DEFAULT_CHECKOUT_PAGE_SETTINGS.messageTitle, 100),
    message: cleanText(migrateLegacyCheckoutMessage(source.message), cleanText(migrateLegacyCheckoutMessage(legacyMessage), DEFAULT_CHECKOUT_PAGE_SETTINGS.message, 2000), 2000),
    screenshotEnabled: source.screenshotEnabled !== false,
    screenshotTitle: cleanText(source.screenshotTitle, DEFAULT_CHECKOUT_PAGE_SETTINGS.screenshotTitle, 100),
    screenshotMessage: cleanText(source.screenshotMessage, DEFAULT_CHECKOUT_PAGE_SETTINGS.screenshotMessage, 500),
    orderSummaryTitle: cleanText(source.orderSummaryTitle, DEFAULT_CHECKOUT_PAGE_SETTINGS.orderSummaryTitle, 50),
    paidTitle: cleanText(source.paidTitle, DEFAULT_CHECKOUT_PAGE_SETTINGS.paidTitle, 80),
    paidMessage: cleanText(source.paidMessage, DEFAULT_CHECKOUT_PAGE_SETTINGS.paidMessage, 500),
    social: {
      enabled: socialSource.enabled === true,
      platform,
      title: cleanText(socialSource.title, DEFAULT_CHECKOUT_PAGE_SETTINGS.social.title, 100),
      message: cleanText(socialSource.message, DEFAULT_CHECKOUT_PAGE_SETTINGS.social.message, 500),
      url: cleanUrl(socialSource.url),
      imageKey,
    },
  };
}

export function canManageStoreLogo(plan) {
  return plan === "plus" || plan === "pro" || plan === "proplus";
}

export function parseDisplaySettings(rawValue) {
  if (!rawValue) {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }

  try {
    const parsed = JSON.parse(rawValue);
    delete parsed.promoFilters;
    return {
      ...DEFAULT_DISPLAY_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

export function sanitizeDisplaySettingsPatch(input, storePlan, storeId) {
  const next = { ...(input || {}) };
  delete next.promoFilters;

  if (Object.prototype.hasOwnProperty.call(next, "checkoutMessage")) {
    next.checkoutMessage = typeof next.checkoutMessage === "string" ? next.checkoutMessage.trim().slice(0, 2000) : "";
  }
  if (Object.prototype.hasOwnProperty.call(next, "checkoutPage")) {
    next.checkoutPage = getPublicCheckoutSettings(next, storeId);
  }

  if (!canManageStoreLogo(storePlan)) {
    delete next.storeLogo;
  }
  if (storePlan !== "pro") {
    delete next.tagNames;
  }

  return next;
}
