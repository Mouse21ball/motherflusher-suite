import { randomUUID } from 'crypto';
import { BoxChevyMode, hasMadeHand } from '../shared/modes/boxchevy';
import type { GamePhase } from '../shared/gameTypes';
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
      // Stamp the reason exactly like the Badugi engine does
      // (foldReason 'declare-auto-invalid' + autoFoldedAtDeclare) so
      // clients can render an honest plate/panel ("NO MADE HAND")
      // instead of a generic fold. Metadata only — the fold itself,
      // its timing, and the made-hand rule are unchanged.
      return { ...player, status: 'folded' as const, declaration: null, hasActed: true, autoFoldedAtDeclare: true, foldReason: 'declare-auto-invalid' };
    });
    if (!messages.length) return state;
    let next = { ...state, players };
    for (const message of messages) next = addMessage(next, message);
    const unacted = players.find(player => player.status === 'active' && !player.hasActed);
    return unacted ? { ...next, activePlayerId: unacted.id } : next;
  },
  // Detroit 2026-10-21 (ruling 2): a lone survivor collects ONLY with a
  // made hand. Without one the pot rolls over — the Badugi house rule.
  canWinUncontested(player, state) {
    return hasMadeHand(player.cards, state.communityCards ?? []);
  },
  resolveUncontested(state, winner, netPot) {
    // The survivor never declared (the hand ended on folds), so the
    // mode's own resolver finds no declarers and returns the post-rake
    // pot untouched as a rollover.
    const result = BoxChevyMode.resolveShowdown(state.players, netPot, '__server__', state.communityCards);
    return {
      ...state,
      players: result.players,
      pot: result.pot,
      phase: 'SHOWDOWN' as GamePhase,
      activePlayerId: winner.id,
      currentBet: 0,
      messages: [
        ...state.messages,
        ...result.messages.map(text => ({
          id: randomUUID(),
          text,
          time: Date.now(),
          isResolution: true,
        })),
      ].slice(-10),
    };
  },
};
