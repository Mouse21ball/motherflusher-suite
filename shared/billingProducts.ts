// Store product identifiers shared by client-side registration and server verification.
export const GOOGLE_SUBSCRIPTION_PRODUCT_IDS = {
  goldProMonthly: "sub_gold_pro_monthly",
  goldProYearly: "sub_gold_pro_yearly",
  diamondEliteMonthly: "sub_diamond_elite_monthly",
  diamondEliteYearly: "sub_diamond_elite_yearly",
} as const;

export const GOOGLE_SUBSCRIPTION_PRODUCT_ID_LIST = [
  GOOGLE_SUBSCRIPTION_PRODUCT_IDS.goldProMonthly,
  GOOGLE_SUBSCRIPTION_PRODUCT_IDS.goldProYearly,
  GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteMonthly,
  GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteYearly,
] as const;

export const APPLE_SUBSCRIPTION_PRODUCTS = {
  goldProMonthly: "com.dgmentertainment.poker.goldpro.monthly",
  diamondEliteMonthly: "com.dgmentertainment.poker.diamond.monthly",
  diamondEliteYearly: "com.dgmentertainment.poker.diamond.yearly",
} as const;

export const APPLE_SUBSCRIPTION_PRODUCT_IDS = [
  APPLE_SUBSCRIPTION_PRODUCTS.goldProMonthly,
  APPLE_SUBSCRIPTION_PRODUCTS.diamondEliteMonthly,
  APPLE_SUBSCRIPTION_PRODUCTS.diamondEliteYearly,
] as const;

// A missing Apple equivalent is intentionally null; do not route an iOS purchase
// through a Google Play product identifier.
export const APPLE_SUBSCRIPTION_PRODUCT_BY_GOOGLE_ID: Record<string, string | null> = {
  [GOOGLE_SUBSCRIPTION_PRODUCT_IDS.goldProMonthly]: APPLE_SUBSCRIPTION_PRODUCTS.goldProMonthly,
  [GOOGLE_SUBSCRIPTION_PRODUCT_IDS.goldProYearly]: null,
  [GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteMonthly]: APPLE_SUBSCRIPTION_PRODUCTS.diamondEliteMonthly,
  [GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteYearly]: APPLE_SUBSCRIPTION_PRODUCTS.diamondEliteYearly,
};