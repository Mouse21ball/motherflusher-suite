import { BUST_RESCUE_PRODUCT } from "@shared/billingProducts";

export const BUST_RESCUE_OFFER_DURATION_MS = BUST_RESCUE_PRODUCT.offerDurationMs;

export interface BustRescueOfferWindow {
  issuedAt: Date;
  expiresAt: Date;
  claimedAt: Date | null;
}

export function isBustRescueOfferAvailable(
  offer: BustRescueOfferWindow | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!offer
    && !offer.claimedAt
    && now.getTime() >= offer.issuedAt.getTime()
    && now.getTime() < offer.expiresAt.getTime();
}

export function isBustRescuePurchaseValid(
  offer: BustRescueOfferWindow | null | undefined,
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