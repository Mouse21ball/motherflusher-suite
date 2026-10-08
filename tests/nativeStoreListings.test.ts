import { describe, expect, it, vi } from 'vitest';
import { APP_STORE_LISTING_URL, PLAY_STORE_LISTING_URL } from '../shared/mobileStoreListings';
import { getRateTheChainStoreListingUrl } from '../client/src/lib/nativeReview';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web' }, registerPlugin: () => ({}),
}));

describe('shared existing mobile store listings', () => {
  it('retains the existing review URLs while update links open listings, not review forms', () => {
    expect(APP_STORE_LISTING_URL).toBe('https://apps.apple.com/app/id6796398661');
    expect(PLAY_STORE_LISTING_URL).toBe('https://play.google.com/store/apps/details?id=com.dgmentertainment.poker');
    expect(getRateTheChainStoreListingUrl('ios')).toBe(`${APP_STORE_LISTING_URL}?action=write-review`);
    expect(getRateTheChainStoreListingUrl('android')).toBe(PLAY_STORE_LISTING_URL);
    expect(APP_STORE_LISTING_URL).not.toContain('write-review');
  });
});
