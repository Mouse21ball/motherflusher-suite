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
  starter: "personal_chips_starter_99",
  small: "personal_chips_small_499",
  medium: "personal_chips_medium_999",
  large: "personal_chips_large_2499",
  mega: "personal_chips_mega_9999",
} as const;

export const APPLE_PERSONAL_CHIP_PRODUCTS = {
  starter: "com.dgmentertainment.poker.personalchips.starter",
  small: "com.dgmentertainment.poker.personalchips.small",
  medium: "com.dgmentertainment.poker.personalchips.medium",
  large: "com.dgmentertainment.poker.personalchips.large",
  mega: "com.dgmentertainment.poker.personalchips.mega",
} as const;

// One-time $0.99 bust-rescue offer; keep platform IDs centralized for later store mapping.
export const BUST_RESCUE_PRODUCT = {
  chips: 3_000,
  priceCents: 99,
  googleId: "personal_chips_bust_rescue_99",
  appleId: "com.dgmentertainment.poker.personalchips.bustrescue",
  offerDurationMs: 10 * 60 * 1000,
} as const;

// One-time 24-hour introduction offer shown from the first Shop visit.
export const FIRST_PURCHASE_BUNDLE = {
  chips: 6_000,
  stripes: 200,
  priceCents: 199,
  offerDurationMs: 24 * 60 * 60 * 1000,
  googleId: "first_purchase_bundle_199",
  appleId: "com.dgmentertainment.poker.firstpurchase.bundle",
} as const;

export const GOOGLE_PERSONAL_CHIP_PRODUCT_IDS = [
  ...Object.values(GOOGLE_PERSONAL_CHIP_PRODUCTS),
  BUST_RESCUE_PRODUCT.googleId,
  FIRST_PURCHASE_BUNDLE.googleId,
];
export const APPLE_PERSONAL_CHIP_PRODUCT_IDS = [
  ...Object.values(APPLE_PERSONAL_CHIP_PRODUCTS),
  BUST_RESCUE_PRODUCT.appleId,
  FIRST_PURCHASE_BUNDLE.appleId,
];
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