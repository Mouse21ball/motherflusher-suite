// ─── Re-export shim ───────────────────────────────────────────────────────────
// Badugi mode logic now lives in shared/modes/badugi so the server engine
// can import it directly. All existing client imports of
// '@/lib/poker/modes/badugi' continue to resolve correctly.
export * from '@shared/modes/badugi';
