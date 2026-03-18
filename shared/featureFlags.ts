// ─── Feature Flags ────────────────────────────────────────────────────────────
// Single source of truth for both client and server.
// Client:  import { FEATURES } from '@shared/featureFlags'
// Server:  import { FEATURES } from '../shared/featureFlags'
//
// ROLLBACK: set SERVER_AUTHORITATIVE_BADUGI to false — instant, no data migration.

export const FEATURES = {
  SERVER_AUTHORITATIVE_BADUGI: false,
} as const;
