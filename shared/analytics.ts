import { z } from "zod";

export const FUNNEL_EVENT_TYPES = [
  "app_open", "age_gate_accepted", "signup_completed",
  "welcome_back_dismissed", "home_viewed", "mode_selected",
  "table_joined", "hand_started", "hand_completed", "bust_shown",
  "bonus_claimed",
] as const;

export type FunnelEventType = typeof FUNNEL_EVENT_TYPES[number];
export type AnalyticsMode = "badugi" | "flushed_up" | "lady_luck" | "box_chevy";

// Legacy payloads, including arbitrary legacy mode strings, remain valid.
export const trackEventSchema = z.object({
  eventType: z.enum(["session_start", "session_end", "mode_play", ...FUNNEL_EVENT_TYPES]),
  playerId: z.string().min(1),
  mode: z.string().optional(),
  durationMs: z.number().int().optional(),
  properties: z.record(z.unknown()).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
  appVersion: z.string().optional(),
});

export function analyticsMode(value: unknown): AnalyticsMode | undefined {
  switch (value) {
    case "badugi": return "badugi";
    case "flushedup":
    case "flushed_up": return "flushed_up";
    case "ladyluck":
    case "lady_luck": return "lady_luck";
    case "box-chevy":
    case "box_chevy": return "box_chevy";
    default: return undefined;
  }
}
