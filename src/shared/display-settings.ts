export type CheckoutSocialPlatform = "line" | "facebook" | "threads" | "instagram";

export interface CheckoutSocialSettings {
  enabled: boolean;
  platform: CheckoutSocialPlatform;
  title: string;
  message: string;
  url: string;
  imageKey: string;
}

export interface CheckoutPageSettings {
  title: string;
  messageTitle: string;
  message: string;
  screenshotEnabled: boolean;
  screenshotTitle: string;
  screenshotMessage: string;
  orderSummaryTitle: string;
  paidTitle: string;
  paidMessage: string;
  social: CheckoutSocialSettings;
}

export interface DisplaySettings {
  viewMode?: "list" | "1card" | "2card";
  promoEnabled?: boolean;
  wholesaleEnabled?: boolean;
  storeLogo?: string;
  /** Legacy mirror retained while existing stores migrate to checkoutPage.message. */
  checkoutMessage?: string;
  checkoutPage?: CheckoutPageSettings;
}

export type DisplaySettingsPatch = Partial<DisplaySettings>;
