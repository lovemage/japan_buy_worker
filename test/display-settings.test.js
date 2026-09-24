import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_CHECKOUT_PAGE_SETTINGS,
  canManageStoreLogo,
  getPublicCheckoutSettings,
  parseDisplaySettings,
  sanitizeDisplaySettingsPatch,
} from "../src/shared/display-settings.js";

test("canManageStoreLogo allows plus and above plans", () => {
  assert.equal(canManageStoreLogo("free"), false);
  assert.equal(canManageStoreLogo("plus"), true);
  assert.equal(canManageStoreLogo("pro"), true);
  assert.equal(canManageStoreLogo("proplus"), true);
});

test("parseDisplaySettings falls back to defaults on invalid input", () => {
  assert.deepEqual(parseDisplaySettings(null), DEFAULT_DISPLAY_SETTINGS);
  assert.deepEqual(parseDisplaySettings("{"), DEFAULT_DISPLAY_SETTINGS);
});

test("parseDisplaySettings strips legacy promo filter values", () => {
  assert.deepEqual(parseDisplaySettings('{"promoEnabled":false,"promoFilters":["350"]}'), {
    ...DEFAULT_DISPLAY_SETTINGS,
    promoEnabled: false,
  });
});

test("sanitizeDisplaySettingsPatch keeps storeLogo for plus but still strips tagNames", () => {
  const sanitized = sanitizeDisplaySettingsPatch(
    {
      storeLogo: "logos/store.webp",
      tagNames: { hot: "人氣商品" },
      promoEnabled: false,
      promoFilters: ["350"],
    },
    "plus"
  );

  assert.deepEqual(sanitized, {
    storeLogo: "logos/store.webp",
    promoEnabled: false,
  });
});

test("sanitizeDisplaySettingsPatch strips storeLogo for free plan", () => {
  const sanitized = sanitizeDisplaySettingsPatch(
    {
      storeLogo: "logos/store.webp",
      promoEnabled: true,
    },
    "free"
  );

  assert.deepEqual(sanitized, {
    promoEnabled: true,
  });
});

test("checkout completion settings have safe customer-facing defaults", () => {
  assert.deepEqual(getPublicCheckoutSettings(DEFAULT_DISPLAY_SETTINGS), {
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
  });
});

test("legacy default checkout message migrates to the new remittance instructions", () => {
  const publicSettings = getPublicCheckoutSettings({
    checkoutMessage: "請將本頁面截圖傳至群組或 Line，我們將人工與您核對訂單內容。",
  }, 7);
  assert.equal(publicSettings.message, DEFAULT_CHECKOUT_PAGE_SETTINGS.message);
});

test("checkout completion settings sanitize text, platform, URL, and image ownership", () => {
  const sanitized = sanitizeDisplaySettingsPatch({
    checkoutPage: {
      title: "  訂單完成  ", messageTitle: "下一步", message: "請加入社群",
      screenshotEnabled: false, screenshotTitle: "截圖提醒", screenshotMessage: "保留單號",
      orderSummaryTitle: "購買內容", copyButtonText: "複製明細", backButtonText: "繼續逛逛",
      paidTitle: "付款成功", paidMessage: "款項已收到",
      social: {
        enabled: true, platform: "threads", title: "加入 Threads", message: "看最新貼文",
        buttonText: "開啟 Threads", url: "https://www.threads.net/@shop",
        imageKey: "12/checkout-social/card.webp",
      },
    },
  }, "free", 12);

  assert.deepEqual(sanitized.checkoutPage, {
    title: "訂單完成", messageTitle: "下一步", message: "請加入社群",
    screenshotEnabled: false, screenshotTitle: "截圖提醒", screenshotMessage: "保留單號",
    orderSummaryTitle: "購買內容",
    paidTitle: "付款成功", paidMessage: "款項已收到",
    social: {
      enabled: true, platform: "threads", title: "加入 Threads", message: "看最新貼文",
      url: "https://www.threads.net/@shop",
      imageKey: "12/checkout-social/card.webp",
    },
  });

  const unsafe = sanitizeDisplaySettingsPatch({
    checkoutPage: { social: { enabled: true, platform: "javascript", url: "javascript:alert(1)", imageKey: "99/checkout-social/stolen.webp" } },
  }, "free", 12);
  assert.equal(unsafe.checkoutPage.social.platform, "instagram");
  assert.equal(unsafe.checkoutPage.social.url, "");
  assert.equal(unsafe.checkoutPage.social.imageKey, "");
});
