import type { GameState } from '@shared/gameTypes';

export type CelebrationType =
  | 'NORMAL_WIN' | 'BIG_POT' | 'RARE_HAND' | 'WIN_STREAK' | 'BLUFF_WIN'
  | 'PLAYER_BUST' | 'BADUGI_SPECIAL' | 'DEAD7_SPECIAL' | '1535_SPECIAL';
export type CelebrationIntensity = 'normal' | 'big' | 'premium';
export type CelebrationAnimation = 'chip-glow' | 'chain-sweep' | 'dead7-skull';
export type CelebrationParticles = 'gold-sparks' | 'amber-burst' | 'red-gold-pulse' | 'none';
export type CelebrationScreenEffect = 'none' | 'punch' | 'dim-pulse';
export type CelebrationSound = 'chipClink' | 'win' | 'bigWin' | 'none';

export interface CelebrationTarget {
  playerId: string;
  amount: number;
}

/** A presentation-only event. Awards are observed chip deltas, never calculated payouts. */
export interface CelebrationEvent {
  type: CelebrationType;
  playerId: string;
  playerName: string;
  targets: CelebrationTarget[];
  amount: number;
  text?: string;
  durationMs?: number;
  animation?: CelebrationAnimation;
  sound?: CelebrationSound;
  particles?: CelebrationParticles;
  screenEffect?: CelebrationScreenEffect;
  characterAsset?: string;
  intensity?: CelebrationIntensity;
}

export interface CelebrationPreset {
  animation: CelebrationAnimation;
  durationMs: number;
  text: string;
  sound: CelebrationSound;
  particles: CelebrationParticles;
  screenEffect: CelebrationScreenEffect;
  intensity: CelebrationIntensity;
  characterAsset?: string;
}

// New modes register a preset here and emit a CelebrationEvent. No table code changes.
export const CELEBRATION_PRESETS: Partial<Record<CelebrationType, CelebrationPreset>> = {
  NORMAL_WIN: {
    animation: 'chip-glow', durationMs: 1200, text: 'WINNER',
    sound: 'chipClink', particles: 'gold-sparks', screenEffect: 'none', intensity: 'normal',
  },
  BIG_POT: {
    animation: 'chain-sweep', durationMs: 1900, text: 'BIG POT',
    sound: 'bigWin', particles: 'amber-burst', screenEffect: 'punch', intensity: 'big',
  },
  DEAD7_SPECIAL: {
    animation: 'dead7-skull', durationMs: 2100, text: 'DEAD 7',
    sound: 'bigWin', particles: 'red-gold-pulse', screenEffect: 'dim-pulse', intensity: 'premium',
  },
};

export function resolveCelebration(event: CelebrationEvent): CelebrationPreset {
  const preset = CELEBRATION_PRESETS[event.type];
  if (!preset) throw new Error(`No presentation preset registered for ${event.type}`);
  const intensity = event.intensity ?? preset.intensity;
  const bounds = intensity === 'normal' ? [800, 1500] : intensity === 'big' ? [1500, 2200] : [800, 3000];
  return {
    ...preset,
    ...event,
    durationMs: Math.max(bounds[0], Math.min(bounds[1], event.durationMs ?? preset.durationMs)),
    text: event.text ?? preset.text,
    animation: event.animation ?? preset.animation,
    sound: event.sound ?? preset.sound,
    particles: event.particles ?? preset.particles,
    screenEffect: event.screenEffect ?? preset.screenEffect,
    intensity,
  };
}

export interface CelebrationSnapshot {
  tableId: string;
  phase: string;
  players: Record<string, { chips: number; totalBet: number; isWinner: boolean }>;
}

export function snapshotForCelebrations(state: GameState): CelebrationSnapshot {
  return {
    tableId: state.tableId,
    phase: state.phase,
    players: Object.fromEntries(state.players.map(p => [
      p.id, { chips: p.chips, totalBet: p.totalBet ?? 0, isWinner: !!p.isWinner },
    ])),
  };
}

// BIG_POT is based on observed awarded chips (not a client-side pot calculation).
export const BIG_POT_MIN_CHIPS = 500;

export function deriveCelebration(
  previous: CelebrationSnapshot | null,
  state: GameState,
  modeId: string,
  source: 'init' | 'update' = 'update',
): CelebrationEvent | null {
  if (source === 'init' || !previous || previous.tableId !== state.tableId || state.phase !== 'SHOWDOWN') return null;

  const paid = state.players.flatMap(player => {
    const before = previous.players[player.id];
    if (!before || !player.isWinner || (before.isWinner && previous.phase === 'SHOWDOWN')) return [];
    // The final bet can be debited between snapshots. Both quantities come
    // from server snapshots; this restores the observed gross award without
    // attempting to calculate pots, side pots, or split shares on the client.
    const amount = player.chips - before.chips
      + Math.max(0, (player.totalBet ?? 0) - before.totalBet);
    return amount > 0 ? [{ playerId: player.id, playerName: player.name, amount }] : [];
  });
  if (paid.length === 0) return null; // rollover, reconnect or unresolved showdown

  const primary = [...paid].sort((a, b) => b.amount - a.amount)[0];
  const amount = paid.reduce((sum, award) => sum + award.amount, 0);
  const type: CelebrationType = modeId === 'dead7'
    ? 'DEAD7_SPECIAL'
    : amount >= BIG_POT_MIN_CHIPS ? 'BIG_POT' : 'NORMAL_WIN';
  return {
    type,
    playerId: primary.playerId,
    playerName: paid.length > 1 ? paid.map(p => p.playerName).join(' & ') : primary.playerName,
    targets: paid.map(({ playerId, amount: award }) => ({ playerId, amount: award })),
    amount,
  };
}