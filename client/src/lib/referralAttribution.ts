import { isPracticeBadugiRoute } from './practiceRoute';

const REFERRAL_CODE_KEY = 'cgp_signup_referral_code';

function normalizeCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? '';
  return /^[A-Z0-9]{6,16}$/.test(code) ? code : null;
}

export function captureReferralCodeFromUrl(): void {
  if (typeof window === 'undefined' || isPracticeBadugiRoute()) return;
  const code = normalizeCode(new URLSearchParams(window.location.search).get('ref'));
  if (!code) return;
  try { localStorage.setItem(REFERRAL_CODE_KEY, code); } catch {}
}

export function getSavedReferralCode(): string {
  try { return normalizeCode(localStorage.getItem(REFERRAL_CODE_KEY)) ?? ''; } catch { return ''; }
}

export function clearSavedReferralCode(): void {
  try { localStorage.removeItem(REFERRAL_CODE_KEY); } catch {}
}