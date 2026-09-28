import { FIRST_PURCHASE_BUNDLE } from "@shared/billingProducts";

export const FIRST_PURCHASE_OFFER_DURATION_MS = FIRST_PURCHASE_BUNDLE.offerDurationMs;

export interface FirstPurchaseOfferWindow {
  issuedAt: Date;
  expiresAt: Date;
  claimedAt: Date | null;
}

export function isFirstPurchaseOfferAvailable(
  offer: FirstPurchaseOfferWindow | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!offer
    && !offer.claimedAt
    && now.getTime() >= offer.issuedAt.getTime()
    && now.getTime() < offer.expiresAt.getTime();
}

export function isFirstPurchaseBundlePurchaseValid(
  offer: FirstPurchaseOfferWindow | null | undefined,
  storePurchaseAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!offer?.claimedAt || !storePurchaseAt) return false;
  const purchasedAt = storePurchaseAt.getTime();
  return purchasedAt >= offer.issuedAt.getTime()
    && purchasedAt >= offer.claimedAt.getTime()
    && purchasedAt < offer.expiresAt.getTime()
    && purchasedAt <= now.getTime() + 60_000;
}