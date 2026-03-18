// ─── Re-export shim ───────────────────────────────────────────────────────────
// Feature flags live in shared/featureFlags so both client and server read
// the same constants from one file.
export * from '@shared/featureFlags';
