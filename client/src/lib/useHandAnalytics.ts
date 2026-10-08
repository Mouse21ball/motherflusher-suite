import { useEffect, useRef } from "react";
import { analyticsMode } from "@shared/analytics";
import { fire2, trackModePlay } from "./analytics";
import { ensurePlayerIdentity } from "./persistence";
import { isPracticeBadugiRoute } from "./practiceRoute";
import { PokerHandObserver, LadyLuckHandObserver, type PokerAnalyticsFrame, type HandAnalyticsEvent } from "./handAnalytics";
import type { LadyLuckState } from "@shared/modes/ladyluck";

const seen = new Set<string>();
const KEY = "cgp_hand_analytics_seen";
let loaded = false;

export function emitHandEventOnce(event: HandAnalyticsEvent): void {
  if (isPracticeBadugiRoute()) return;
  try {
    if (!loaded) {
      loaded = true;
      try {
        const stored = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
        if (Array.isArray(stored)) stored.filter(v => typeof v === "string").forEach(v => seen.add(v));
      } catch {}
    }
    const actor = ensurePlayerIdentity().id;
    const key = JSON.stringify([actor, event.props.mode, event.props.table_id, event.props.hand_id, event.type]);
    if (seen.has(key)) return;
    seen.add(key);
    if (seen.size > 1024) seen.delete(seen.values().next().value!);
    try { sessionStorage.setItem(KEY, JSON.stringify([...seen])); } catch {}
    fire2(event.type, { ...event.props, event_key: key });
  } catch {
    // In-memory observer still suppresses same-snapshot repeats without storage.
    fire2(event.type, event.props);
  }
}

export function useHandAnalytics(state: PokerAnalyticsFrame, myId: string, tableId: string | undefined, modeValue: string) {
  const observer = useRef(new PokerHandObserver());
  const mode = analyticsMode(modeValue);
  const hero = state.players.find(p => p.id === myId);
  const chipsBefore = useRef(0);
  if (hero && hero.chips > 0) chipsBefore.current = Math.trunc(hero.chips);
  useEffect(() => {
    if (!mode || !tableId || isPracticeBadugiRoute()) return;
    for (const event of observer.current.observe(state, myId, tableId, mode)) emitHandEventOnce(event);
  }, [state, myId, tableId, mode]);
  return chipsBefore.current;
}

export function useLadyLuckAnalytics(state: LadyLuckState | null, myId: string, tableId: string | null) {
  const observer = useRef(new LadyLuckHandObserver());
  useEffect(() => {
    const result = observer.current.observe(state, myId, tableId);
    if (result.joined) {
      trackModePlay("lady_luck", { table_id: tableId });
    }
    for (const event of result.events) emitHandEventOnce(event);
  }, [state, myId, tableId]);
}
