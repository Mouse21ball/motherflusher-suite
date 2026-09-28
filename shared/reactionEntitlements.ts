export const STARTER_REACTION_EMOTES = ['🔥', '👀', '😈', '💀', '😂'] as const;
export const VIP_REACTION_EMOTES = [
  '⛓️', '💯', '🫡', '🤝', '🥶', '🚀', '🃏', '💸', '🎯', '👑',
  '🧊', '⚡', '🦈', '🍀', '🏆',
] as const;
export const REACTION_EMOTES = [...STARTER_REACTION_EMOTES, ...VIP_REACTION_EMOTES] as const;

/** Each level unlocks the matching prefix count of VIP reactions. */
export const VIP_REACTION_UNLOCK_LEVELS = [1, 11, 21, 36] as const;
export const VIP_REACTION_EXTRA_COUNTS = [0, 5, 10, 15] as const;

export function vipReactionCountAtLevel(level: number): number {
  for (let tier = VIP_REACTION_UNLOCK_LEVELS.length - 1; tier >= 0; tier--) {
    if (level >= VIP_REACTION_UNLOCK_LEVELS[tier]) return VIP_REACTION_EXTRA_COUNTS[tier];
  }
  return VIP_REACTION_EXTRA_COUNTS[0];
}