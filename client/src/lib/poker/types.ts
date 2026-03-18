// ─── Re-export shim ───────────────────────────────────────────────────────────
// All game types now live in shared/gameTypes.ts so both client and server
// can import them from a single source of truth.
//
// All existing imports of '@/lib/poker/types' continue to work unchanged.
export * from '@shared/gameTypes';
