export const LEADERBOARD_LIMIT = 50;

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  lifetimeProfit: number;
  xp: number;
  handsPlayed: number;
  avatarId: string | null;
  equippedAvatarId: string | null;
  equippedFrameId: string | null;
  rank: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  me: LeaderboardEntry | null;
}