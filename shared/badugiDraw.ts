import type { CardType, GameState, Player } from './gameTypes';

type DrawResult =
  | { ok: true; count: number; players: Player[]; deck: CardType[]; discardPile: CardType[] }
  | { ok: false; reason: string; message: string };

/** Validate the entire untrusted action before touching cards, deck, or discard pile. */
export function applyBadugiDraw(state: GameState, playerId: string, payload: unknown): DrawResult {
  const cap = state.phase === 'DRAW_1' ? 3
    : state.phase === 'DRAW_2' ? 2
    : state.phase === 'DRAW_3' ? 1 : null;
  if (cap === null) return { ok: false, reason: 'invalid_round', message: 'Not a Badugi draw round.' };
  if (!Array.isArray(payload)) return { ok: false, reason: 'invalid_payload', message: 'Draw must contain an array of card indices.' };

  const player = state.players.find(p => p.id === playerId);
  if (!player) return { ok: false, reason: 'not_seated', message: 'Player is not seated.' };
  if (payload.length > cap) {
    return { ok: false, reason: 'cap_exceeded', message: `Round ${state.phase.slice(-1)} allows at most ${cap} discards.` };
  }
  if (payload.some(idx => !Number.isInteger(idx) || idx < 0 || idx >= player.cards.length)) {
    return { ok: false, reason: 'invalid_index', message: 'Draw indices must be integers within your hand.' };
  }
  const indices = payload as number[];
  if (new Set(indices).size !== indices.length) {
    return { ok: false, reason: 'duplicate_index', message: 'Draw indices must be unique.' };
  }

  let deck = [...state.deck];
  const discardPile = [...(state.discardPile || [])];
  const cards = [...player.cards];
  for (const idx of indices) {
    discardPile.push(cards[idx]);
    if (deck.length === 0 && discardPile.length > 0) {
      const reshuffled = [...discardPile];
      discardPile.length = 0;
      for (let i = reshuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
      }
      deck = reshuffled;
    }
    cards[idx] = { ...deck.shift()!, isHidden: false };
  }

  return {
    ok: true, count: indices.length, deck, discardPile,
    players: state.players.map(p => p.id === playerId ? { ...p, cards, hasActed: true } : p),
  };
}
/**
 * Discard-only phase (Detroit 2026-10-10).
 * Removes the selected cards and marks how many replacements are pending.
 * Does NOT deal new cards — those come in the deal phase after all discards.
 */
export function applyBadugiDiscard(state: GameState, playerId: string, payload: unknown): DrawResult {
  const cap = state.phase === 'DRAW_1' ? 3
    : state.phase === 'DRAW_2' ? 2
    : state.phase === 'DRAW_3' ? 1 : null;
  if (cap === null) return { ok: false, reason: 'invalid_round', message: 'Not a Badugi draw round.' };
  if (!Array.isArray(payload)) return { ok: false, reason: 'invalid_payload', message: 'Draw must contain an array of card indices.' };

  const player = state.players.find(p => p.id === playerId);
  if (!player) return { ok: false, reason: 'not_seated', message: 'Player is not seated.' };
  if (payload.length > cap) {
    return { ok: false, reason: 'cap_exceeded', message: `Round ${state.phase.slice(-1)} allows at most ${cap} discards.` };
  }
  if (payload.some(idx => !Number.isInteger(idx) || idx < 0 || idx >= player.cards.length)) {
    return { ok: false, reason: 'invalid_index', message: 'Draw indices must be integers within your hand.' };
  }
  const indices = payload as number[];
  if (new Set(indices).size !== indices.length) {
    return { ok: false, reason: 'duplicate_index', message: 'Draw indices must be unique.' };
  }

  const discardPile = [...(state.discardPile || [])];
  // Remove discarded cards (highest index first to avoid shifting)
  const sortedIndices = [...indices].sort((a, b) => b - a);
  const cards = [...player.cards];
  for (const idx of sortedIndices) {
    discardPile.push(cards[idx]);
    cards.splice(idx, 1);
  }

  return {
    ok: true, count: indices.length, deck: [...state.deck], discardPile,
    players: state.players.map(p => p.id === playerId
      ? { ...p, cards, hasActed: true, pendingDrawCount: indices.length, lastDrawCount: indices.length }
      : p),
  };
}

/**
 * Deal phase (Detroit 2026-10-10).
 * Deals replacement cards to a single player who has pending draws.
 * Called in turn order after all discards are complete.
 */
export function applyBadugiDeal(state: GameState, playerId: string): DrawResult {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return { ok: false, reason: 'not_seated', message: 'Player is not seated.' };

  const pending = player.pendingDrawCount ?? 0;
  if (pending === 0) return { ok: true, count: 0, deck: [...state.deck], discardPile: [...(state.discardPile || [])], players: state.players };

  let deck = [...state.deck];
  const discardPile = [...(state.discardPile || [])];
  const cards = [...player.cards];

  for (let i = 0; i < pending; i++) {
    if (deck.length === 0 && discardPile.length > 0) {
      const reshuffled = [...discardPile];
      discardPile.length = 0;
      for (let j = reshuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [reshuffled[j], reshuffled[k]] = [reshuffled[k], reshuffled[j]];
      }
      deck = reshuffled;
    }
    if (deck.length === 0) break; // No cards left (shouldn't happen)
    cards.push({ ...deck.shift()!, isHidden: false });
  }

  return {
    ok: true, count: pending, deck, discardPile,
    players: state.players.map(p => p.id === playerId
      ? { ...p, cards, pendingDrawCount: 0 }
      : p),
  };
}
