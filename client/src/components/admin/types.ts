export interface MeResponse {
  profileId: string;
  displayName: string;
  isAdmin: boolean;
  sessionToken: string;
}

export interface PlayerSearchResult {
  id: string;
  displayName: string;
  email: string | null;
  chipBalance: number;
  stripes: number;
  isAdmin: boolean;
  isBanned: boolean;
  isDeleted: boolean;
  createdAt: string;
}

export interface ChipTransaction {
  id: number;
  playerId: string;
  beforeBalance: number;
  amountChange: number;
  afterBalance: number;
  reason: string;
  gameId: string | null;
  handId: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface StripeTransaction {
  id: number;
  playerId: string;
  amount: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
}

export interface AdminAction {
  id: string;
  adminId: string;
  targetPlayerId: string;
  actionType: string;
  reason: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminPlayerProfile {
  id: string;
  displayName: string;
  email: string | null;
  chipBalance: number;
  stripes: number;
  isAdmin: boolean;
  isDeleted: boolean;
  bannedAt: string | null;
  banExpiresAt: string | null;
  banReason: string | null;
  activeSubscriptionTier: string | null;
  subscriptionExpiresAt: string | null;
  handsPlayed: number;
  handsWon: number;
  lifetimeProfit: number;
  createdAt: string;
}

export interface AdminPlayerDetails {
  profile: AdminPlayerProfile;
  recentChipHistory: ChipTransaction[];
  recentStripesHistory: StripeTransaction[];
  recentAdminActions: AdminAction[];
  ownedCosmetics: OwnedCosmeticItem[];
}

export interface AdminAuditLogEntry {
  id: string;
  adminId: string;
  adminName: string;
  targetPlayerId: string;
  targetName: string;
  actionType: string;
  reason: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CosmeticCatalogItem {
  id: string;
  displayName: string;
  category: string;
  description: string;
  active: boolean;
}

export interface OwnedCosmeticItem {
  id: string;
  displayName: string;
  category: string;
}

export type AdminActionType =
  | 'grant-chips'
  | 'debit-chips'
  | 'grant-stripes'
  | 'debit-stripes'
  | 'grant-cosmetic'
  | 'revoke-cosmetic'
  | 'grant-subscription'
  | 'revoke-subscription'
  | 'ban'
  | 'unban'
  | 'reset-password'
  | 'delete';

export const ACTION_LABELS: Record<AdminActionType, string> = {
  'grant-chips':          'Grant Chips',
  'debit-chips':          'Debit Chips',
  'grant-stripes':        'Grant Stripes',
  'debit-stripes':        'Debit Stripes',
  'grant-cosmetic':       'Grant Cosmetic',
  'revoke-cosmetic':      'Revoke Cosmetic',
  'grant-subscription':   'Grant Subscription',
  'revoke-subscription':  'Revoke Subscription',
  'ban':                  'Ban Player',
  'unban':                'Unban Player',
  'reset-password':       'Reset Password',
  'delete':               'Delete Account',
};

export const DESTRUCTIVE_ACTIONS = new Set<AdminActionType>(['debit-chips', 'debit-stripes', 'ban', 'delete']);

export const KNOWN_ACTION_TYPES = [
  'grant_chips', 'debit_chips',
  'grant_stripes', 'debit_stripes',
  'grant_cosmetic', 'revoke_cosmetic',
  'grant_subscription', 'revoke_subscription',
  'ban', 'unban',
  'reset_password', 'delete_account',
] as const;
