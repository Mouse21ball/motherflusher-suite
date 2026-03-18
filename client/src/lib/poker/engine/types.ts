// ─── Re-export shim ───────────────────────────────────────────────────────────
// GameMode now lives in shared/gameTypes so both client and server import
// from one source. All existing imports of '@/lib/poker/engine/types' still work.
export type { GameMode } from '@shared/gameTypes';
