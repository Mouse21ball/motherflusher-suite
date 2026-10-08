import type { AnalyticsMode, FunnelEventType } from "@shared/analytics";
import type { LadyLuckState } from "@shared/modes/ladyluck";

export interface HandAnalyticsEvent {
  type: Extract<FunnelEventType, "hand_started" | "hand_completed">;
  props: Record<string, unknown>;
}
export interface PokerAnalyticsFrame {
  handId?: number;
  phase: string;
  isRollover?: boolean;
  players: {
    id: string; chips: number; status: string; cards?: unknown[];
    isWinner?: boolean; declaration?: string | null;
  }[];
}

// Observes authoritative snapshots only: no cards, bets, outcomes or rewards
// are calculated here. Clients can skip the transient DEAL snapshot, so the
// first in-progress snapshot with the hero's dealt cards is also recognized.
export class PokerHandObserver {
  private started = new Set<string>();
  private completed = new Set<string>();
  chipsBefore = 0;

  observe(state: PokerAnalyticsFrame, myId: string, tableId: string, mode: AnalyticsMode): HandAnalyticsEvent[] {
    const hero = state.players.find(p => p.id === myId);
    if (!hero) return [];
    if (hero.chips > 0) this.chipsBefore = Math.trunc(hero.chips);
    if (state.handId == null || !hero.cards?.length
      || hero.status === "sitting_out" || ["WAITING", "ANTE", "GAME_OVER"].includes(state.phase)) return [];
    const key = `${mode}:${tableId}:${state.handId}:${myId}`;
    const props = { mode, table_id: tableId, hand_id: String(state.handId) };
    const events: HandAnalyticsEvent[] = [];
    if (state.phase !== "SHOWDOWN" && !this.started.has(key)) {
      this.started.add(key);
      events.push({ type: "hand_started", props });
    }
    const folded = hero.status === "folded" || hero.declaration === "FOLD";
    if ((folded || state.phase === "SHOWDOWN") && !this.completed.has(key)) {
      this.completed.add(key);
      events.push({
        type: "hand_completed",
        props: {
          ...props, outcome: hero.isWinner ? "win" : folded ? "fold" : "loss",
          ...(state.isRollover ? { rollover: true } : {}),
        },
      });
    }
    if (this.started.size > 128) this.started.delete(this.started.values().next().value!);
    if (this.completed.size > 128) this.completed.delete(this.completed.values().next().value!);
    return events;
  }
}

export function bustAnalyticsTier(lifetime: number, session: number, neverPurchased: boolean): 1 | 2 | 3 | 4 | 5 {
  // Tier 5 is frequent repeat busting. It is an analytics classification only;
  // the existing four UI offer branches remain unchanged.
  if (session >= 3) return 5;
  if (lifetime === 1 && neverPurchased) return 1;
  if (session >= 2 && !neverPurchased) return 2;
  if (session >= 2 && neverPurchased) return 3;
  return 4;
}

export class LadyLuckHandObserver {
  private joined: string | null = null;
  private race: { id: string; suit: string } | null = null;

  observe(state: LadyLuckState | null, myId: string, tableId: string | null) {
    const events: HandAnalyticsEvent[] = [];
    if (!tableId) this.joined = null;
    const hero = state?.players.find(p => p.id === myId && p.presence === "human");
    if (!state || !hero || !tableId) return { joined: false, events };
    const key = `${tableId}:${myId}`;
    const joined = this.joined !== key;
    this.joined = key;
    if (!state.raceId) return { joined, events };
    const props = { mode: "lady_luck", table_id: tableId, hand_id: state.raceId };
    if (state.phase === "RACE" && hero.wagered && hero.wager > 0 && hero.suit) {
      this.race = { id: state.raceId, suit: hero.suit };
      events.push({ type: "hand_started", props });
    }
    if (state.phase === "RESULTS" && state.winner) {
      const suit = this.race?.id === state.raceId
        ? this.race.suit : hero.wagered && hero.wager > 0 ? hero.suit : null;
      if (suit) events.push({ type: "hand_completed", props: { ...props, outcome: suit === state.winner ? "win" : "loss" } });
    }
    return { joined, events };
  }
}
