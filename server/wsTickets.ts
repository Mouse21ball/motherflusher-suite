// ─── Short-lived WebSocket connection tickets ─────────────────────────────────
// Instead of putting the long-lived session token directly in the WS upgrade
// URL (where it leaks into access logs, proxy logs, and browser history),
// clients exchange their authenticated session for a single-use ticket via
// GET /api/auth/ws-ticket. The ticket is valid for 60 seconds and is deleted
// from the store the moment it is consumed — one ticket, one connection.
//
// No database involvement: the Map is in-process memory, which is sufficient
// because the ticket lifetime is shorter than any reasonable reconnect window.

import { randomBytes } from 'crypto';

const WS_TICKET_TTL_MS = 60_000; // 60 seconds

interface WsTicketEntry {
  playerId:  string;
  expiresAt: number;
}

const tickets = new Map<string, WsTicketEntry>();

// Sweep expired tickets every minute so the Map doesn't grow unbounded.
// .unref() lets the process exit cleanly even if this timer is still pending.
setInterval(() => {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (now > entry.expiresAt) tickets.delete(ticket);
  }
}, WS_TICKET_TTL_MS).unref();

/**
 * Issue a short-lived, single-use WS ticket for the given player.
 * Returns a 64-hex-character random string.
 */
export function issueWsTicket(playerId: string): string {
  const ticket = randomBytes(32).toString('hex');
  tickets.set(ticket, { playerId, expiresAt: Date.now() + WS_TICKET_TTL_MS });
  return ticket;
}

/**
 * Consume a WS ticket. If the ticket exists and has not expired, deletes it
 * and returns the associated playerId. Returns null for any invalid/expired
 * ticket. Single-use: the ticket is always deleted on the first call.
 */
export function consumeWsTicket(ticket: string): string | null {
  const entry = tickets.get(ticket);
  tickets.delete(ticket); // always delete — single-use, even if expired
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.playerId;
}
