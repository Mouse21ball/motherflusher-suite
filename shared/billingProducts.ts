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

export const PERSONAL_CHIP_PACKS = [
  { tier: "starter", chips: 1_000, priceCents: 99 },
  { tier: "small", chips: 6_000, priceCents: 499 },
  { tier: "medium", chips: 15_000, priceCents: 999 },
  { tier: "large", chips: 45_000, priceCents: 2_499 },
  { tier: "mega", chips: 200_000, priceCents: 9_999 },
] as const;

export const GOOGLE_PERSONAL_CHIP_PRODUCTS = {
  starter: "personal-chips-starter-99",
  small: "personal-chips-small-499",
  medium: "personal-chips-medium-999",
  large: "personal-chips-large-2499",
  mega: "personal-chips-mega-9999",
} as const;

export const APPLE_PERSONAL_CHIP_PRODUCTS = {
  starter: "com.dgmentertainment.poker.personalchips.starter",
  small: "com.dgmentertainment.poker.personalchips.small",
  medium: "com.dgmentertainment.poker.personalchips.medium",
  large: "com.dgmentertainment.poker.personalchips.large",
  mega: "com.dgmentertainment.poker.personalchips.mega",
} as const;

export const GOOGLE_PERSONAL_CHIP_PRODUCT_IDS = Object.values(GOOGLE_PERSONAL_CHIP_PRODUCTS);
export const APPLE_PERSONAL_CHIP_PRODUCT_IDS = Object.values(APPLE_PERSONAL_CHIP_PRODUCTS);
export const PERSONAL_CHIP_PRODUCT_BY_GOOGLE_ID: Record<string, string> = {
  [GOOGLE_PERSONAL_CHIP_PRODUCTS.starter]: APPLE_PERSONAL_CHIP_PRODUCTS.starter,
  [GOOGLE_PERSONAL_CHIP_PRODUCTS.small]: APPLE_PERSONAL_CHIP_PRODUCTS.small,
  [GOOGLE_PERSONAL_CHIP_PRODUCTS.medium]: APPLE_PERSONAL_CHIP_PRODUCTS.medium,
  [GOOGLE_PERSONAL_CHIP_PRODUCTS.large]: APPLE_PERSONAL_CHIP_PRODUCTS.large,
  [GOOGLE_PERSONAL_CHIP_PRODUCTS.mega]: APPLE_PERSONAL_CHIP_PRODUCTS.mega,
};

// A missing Apple equivalent is intentionally null; do not route an iOS purchase
// through a Google Play product identifier.
export const APPLE_SUBSCRIPTION_PRODUCT_BY_GOOGLE_ID: Record<string, string | null> = {
  [GOOGLE_SUBSCRIPTION_PRODUCT_IDS.goldProMonthly]: APPLE_SUBSCRIPTION_PRODUCTS.goldProMonthly,
  [GOOGLE_SUBSCRIPTION_PRODUCT_IDS.goldProYearly]: null,
  [GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteMonthly]: APPLE_SUBSCRIPTION_PRODUCTS.diamondEliteMonthly,
  [GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteYearly]: APPLE_SUBSCRIPTION_PRODUCTS.diamondEliteYearly,
};