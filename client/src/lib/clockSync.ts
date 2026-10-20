// Server-clock synchronization (2026-10-20).
//
// State snapshot envelopes from both engines carry `serverNow` (server
// epoch ms at send time). Each snapshot refreshes the offset between the
// server clock and this device's clock. Turn-deadline rendering must use
// serverNowMs() instead of Date.now() so a device with a skewed clock
// still counts down against the server's authoritative deadline.
//
// The server remains the sole authority — this only corrects the DISPLAY.
// Before the first snapshot arrives the offset is 0 (raw device clock),
// which matches the pre-sync behavior exactly. Backward-compatible: old
// servers simply never send `serverNow` and the offset stays 0.

let offsetMs = 0;

export function noteServerNow(serverNow: unknown): void {
  if (typeof serverNow === 'number' && Number.isFinite(serverNow)) {
    offsetMs = serverNow - Date.now();
  }
}

/** Current time on the server's clock, as best known. */
export function serverNowMs(): number {
  return Date.now() + offsetMs;
}

/** The currently applied offset (server minus device), for diagnostics. */
export function clockOffsetMs(): number {
  return offsetMs;
}
