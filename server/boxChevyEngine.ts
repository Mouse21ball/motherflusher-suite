import { BoxChevyMode, hasMadeHand } from '../shared/modes/boxchevy';
import type { ModeEngine } from './modeEngine';

/** Box Chevy owns its draw sequence and made-hand declaration eligibility. */
export const BoxChevyEngine: ModeEngine = {
  mode: BoxChevyMode,
  drawCap(phase) {
    return ({ DRAW_1: 3, DRAW_2: 2, DRAW_3: 1 } as Record<string, number>)[phase] ?? null;
  },
  onPhaseEnter(state, addMessage) {
    if (state.phase !== 'DECLARE') return state;
    const messages: string[] = [];
    const players = state.players.map(player => {
      if (player.status !== 'active' || hasMadeHand(player.cards, state.communityCards ?? [])) return player;
      messages.push(`${player.name} has no made hand — auto-folded`);
      return { ...player, status: 'folded' as const, declaration: null, hasActed: true };
    });
    if (!messages.length) return state;
    let next = { ...state, players };
    for (const message of messages) next = addMessage(next, message);
    const unacted = players.find(player => player.status === 'active' && !player.hasActed);
    return unacted ? { ...next, activePlayerId: unacted.id } : next;
  },
};
