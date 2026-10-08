import { APP_STORE_LISTING_URL, PLAY_STORE_LISTING_URL } from '@shared/mobileStoreListings';

export interface RetiredModeNotice {
  modeId: string;
  modeName: string;
  message: string;
  storeUrls: { ios: string; android: string };
  updateUrl: string | null;
}

/** Accept the legacy-readable server error and Milo's dedicated message type. */
export function readRetiredModeNotice(
  msg: Record<string, unknown>, clientPlatform = 'web',
): RetiredModeNotice | null {
  if (msg.type !== 'mode:retired' && !(msg.type === 'error' && msg.updateRequired === true)) return null;
  const modeName = typeof msg.modeName === 'string' && msg.modeName ? msg.modeName : 'This game';
  const storeUrls = { ios: APP_STORE_LISTING_URL, android: PLAY_STORE_LISTING_URL };
  const platform = clientPlatform === 'ios' || clientPlatform === 'android' ? clientPlatform : msg.platform;
  // Only configured listings are actionable, never an arbitrary server URL.
  const updateUrl = platform === 'ios' ? storeUrls.ios : platform === 'android' ? storeUrls.android
    : msg.updateUrl === storeUrls.ios || msg.updateUrl === storeUrls.android ? msg.updateUrl : null;
  return {
    modeId: typeof msg.modeId === 'string' ? msg.modeId : '',
    modeName,
    message: typeof msg.message === 'string' && msg.message ? msg.message
      : `${modeName} has been retired. Please update the app to continue.`,
    storeUrls,
    updateUrl,
  };
}
