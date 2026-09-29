import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeReviewResult =
  | { status: "success"; requestCompleted: true }
  | { status: "unavailable"; reason: string }
  | { status: "error"; code: string; message: string };

export type StoreListingResult =
  | { status: "success"; opened: true }
  | { status: "unavailable"; reason: string }
  | { status: "error"; code: string; message: string };

interface RateTheChainReviewPlugin {
  requestReview(): Promise<NativeReviewResult>;
  openStoreListing(): Promise<StoreListingResult>;
}

const RateTheChainReview = registerPlugin<RateTheChainReviewPlugin>("RateTheChainReview");

const APPLE_LISTING_URL = "https://apps.apple.com/app/id6796398661?action=write-review";
const PLAY_LISTING_URL =
  "https://play.google.com/store/apps/details?id=com.dgmentertainment.poker";

/**
 * Request the platform in-app review UI. Success only means the native
 * request flow completed; neither platform reports whether a prompt appeared
 * or whether the user submitted a rating.
 */
export async function requestRateTheChainReview(): Promise<NativeReviewResult> {
  const platform = Capacitor.getPlatform();
  if (platform !== "ios" && platform !== "android") {
    return { status: "unavailable", reason: "unsupported-platform" };
  }

  try {
    return await RateTheChainReview.requestReview();
  } catch (error) {
    return {
      status: "error",
      code: "NATIVE_REVIEW_REQUEST_FAILED",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Return the store listing URL for an explicit, user-triggered menu fallback.
 * This deliberately does not open the listing or invoke a fallback UI.
 */
export function getRateTheChainStoreListingUrl(
  platform: string = Capacitor.getPlatform(),
): string | null {
  if (platform === "ios") return APPLE_LISTING_URL;
  if (platform === "android") return PLAY_LISTING_URL;
  if (platform === "web") {
    return typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent)
      ? APPLE_LISTING_URL : PLAY_LISTING_URL;
  }
  return null;
}

/**
 * Open the corresponding store listing in the platform store. Call only in
 * response to an explicit user action; requesting a review never calls this.
 */
export async function openStoreListing(): Promise<StoreListingResult> {
  const platform = Capacitor.getPlatform();
  if (platform === "ios" || platform === "android") {
    try {
      return await RateTheChainReview.openStoreListing();
    } catch (error) {
      return {
        status: "error",
        code: "STORE_LISTING_OPEN_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (platform === "web") {
    const url = getRateTheChainStoreListingUrl(platform);
    if (!url) return { status: "unavailable", reason: "unsupported-platform" };
    const listingWindow = window.open(url, "_blank");
    if (!listingWindow) return { status: "unavailable", reason: "popup-blocked" };
    listingWindow.opener = null;
    return { status: "success", opened: true };
  }

  return { status: "unavailable", reason: "unsupported-platform" };
}