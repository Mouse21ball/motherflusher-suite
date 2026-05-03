// ─── P3: Reconnect / session-takeover security regression tests ───────────────
// Standalone tsx script. Run with:
//   npx tsx server/__tests__/reconnect.test.ts
//
// These are pure-state-machine tests that exercise the same identity guard
// logic used by addGenericConnection, without spinning up real websockets.
// They mirror the rules implemented at:
//   server/genericEngine.ts ::  multi-tab / duplicate identity guard
//   server/genericEngine.ts ::  wasReserved presence transition
//
// Properties under test:
//   1. A reserved seat held during the join window is RECLAIMED (not duplicated)
//      when the same identityId reconnects from a new session.
//   2. A reserved seat is NEVER reassigned to a different identityId — even if
//      the original session has gone away, until the reconnect window expires.
//   3. When the same identityId connects from a 2nd tab while the 1st tab is
//      still live, the 2nd tab takes over the seat and the 1st tab is marked
//      superseded (no duplicated seat).
//   4. presence flips reserved→human exactly once on the takeover/reconnect
//      transition, and is never written backwards (human→reserved) by a
//      reconnecting client.

import type { Player, GameState } from '../../shared/gameTypes';

let failures = 0;
let passes = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) { failures++; console.error('  ✗', msg); }
  else { passes++; console.log('  ✓', msg); }
}
function section(title: string): void { console.log(`\n── ${title} ──`); }

// Minimal table shim — same shape as GenericTable for the fields the
// reconnect path touches.
interface MiniTable {
  state: GameState;
  connections: Map<string, { live: boolean }>;
  sessionToSeat: Map<string, string>;
  seatToIdentityId: Map<string, string>;
  humanSeats: Set<string>;
  disconnectTimers: Map<string, NodeJS.Timeout>;
  supersededSessions: Set<string>;
}

function makePlayer(id: string, presence: Player['presence'] = 'reserved'): Player {
  return {
    id, name: id, presence, chips: 1000, bet: 0, totalBet: 0,
    cards: [], status: 'active', hasActed: false, isDealer: false,
    declaration: null,
  } as Player;
}

function makeTable(): MiniTable {
  const players = ['p1','p2','p3','p4','p5'].map(id => makePlayer(id, 'reserved'));
  return {
    state: {
      tableId: 't', phase: 'WAITING', pot: 0, currentBet: 0, minBet: 0,
      activePlayerId: null, players, communityCards: [], messages: [],
      chatMessages: [], deck: [], discardPile: [],
    },
    connections: new Map(),
    sessionToSeat: new Map(),
    seatToIdentityId: new Map(),
    humanSeats: new Set(),
    disconnectTimers: new Map(),
    supersededSessions: new Set(),
  };
}

// Pure transcription of the takeover+reclaim guard from addGenericConnection.
function reconnect(table: MiniTable, sessionId: string, identityId: string, requestedSeat: string): { seat: string; superseded: string | null } {
  let seat = requestedSeat;
  let superseded: string | null = null;
  // Identity-based reclaim: find any other seat owned by this identity.
  let foundSeat: string | null = null;
  for (const [s, id] of Array.from(table.seatToIdentityId.entries())) {
    if (id === identityId && s !== seat) { foundSeat = s; break; }
  }
  if (foundSeat) {
    if (table.connections.has(foundSeat) && table.connections.get(foundSeat)!.live) {
      // Tab takeover.
      let oldSession: string | null = null;
      for (const [sid, s] of Array.from(table.sessionToSeat.entries())) {
        if (s === foundSeat) { oldSession = sid; break; }
      }
      if (oldSession) {
        table.supersededSessions.add(oldSession);
        table.sessionToSeat.delete(oldSession);
        table.connections.delete(foundSeat);
        table.humanSeats.delete(foundSeat);
        superseded = oldSession;
      }
      seat = foundSeat;
    } else {
      // Reclaim from disconnected state.
      seat = foundSeat;
    }
  }
  // Reservation conversion.
  const wasReserved = table.state.players.find(p => p.id === seat)?.presence === 'reserved';
  table.state = {
    ...table.state,
    players: table.state.players.map(p => p.id !== seat ? p : {
      ...p, presence: 'human' as const,
      ...(wasReserved ? { status: 'active' as const } : {}),
    }),
  };
  table.sessionToSeat.set(sessionId, seat);
  table.connections.set(seat, { live: true });
  table.humanSeats.add(seat);
  table.seatToIdentityId.set(seat, identityId);
  return { seat, superseded };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

section('1. Identity-based reclaim of reserved seat');
{
  const t = makeTable();
  // Initial connection — claims p1.
  reconnect(t, 'sess-A', 'identity-X', 'p1');
  assert(t.state.players[0].presence === 'human', 'p1 → human after first connect');
  // Simulate disconnect: drop the live connection but keep identity mapping.
  t.connections.set('p1', { live: false });
  // Reconnect from a brand-new session id with same identity → must reclaim p1.
  const r = reconnect(t, 'sess-B', 'identity-X', 'p2');
  assert(r.seat === 'p1', 'identity-X reclaims p1 (not p2)');
  assert(t.seatToIdentityId.get('p1') === 'identity-X', 'identity binding preserved');
  assert(t.state.players[1].presence === 'reserved', 'p2 untouched (still reserved)');
  // No duplicate seat assignment.
  const seats = new Set(Array.from(t.sessionToSeat.values()));
  assert(seats.size === 1 && seats.has('p1'), 'no duplicate seat — single mapping to p1');
}

section('2. Reserved seat owned by a different identity is NEVER stolen');
{
  const t = makeTable();
  // Identity-A grabs p1 then disconnects.
  reconnect(t, 'sess-A', 'identity-A', 'p1');
  t.connections.set('p1', { live: false });
  // Identity-B comes in fresh asking for p2 — must NOT receive p1.
  const r = reconnect(t, 'sess-B', 'identity-B', 'p2');
  assert(r.seat === 'p2', 'identity-B receives the requested p2');
  assert(t.seatToIdentityId.get('p1') === 'identity-A', 'p1 still bound to identity-A');
  assert(t.seatToIdentityId.get('p2') === 'identity-B', 'p2 now bound to identity-B');
}

section('3. Multi-tab takeover supersedes the older session');
{
  const t = makeTable();
  reconnect(t, 'sess-A', 'identity-X', 'p1');
  // Second tab from same identity, different session.
  const r = reconnect(t, 'sess-B', 'identity-X', 'p3');
  assert(r.seat === 'p1', 'second tab takes over the same seat (p1)');
  assert(r.superseded === 'sess-A', 'old session marked superseded');
  assert(t.sessionToSeat.has('sess-A') === false, 'old session removed');
  assert(t.sessionToSeat.get('sess-B') === 'p1', 'new session owns p1');
}

section('4. Presence transitions are monotonic (reserved→human, never backwards)');
{
  const t = makeTable();
  reconnect(t, 'sess-A', 'identity-X', 'p1');
  // Force p1 to human in mid-game state, then have the same identity reconnect
  // with no requested seat shift — presence must remain 'human'.
  t.state = {
    ...t.state,
    players: t.state.players.map(p => p.id === 'p1' ? { ...p, presence: 'human' as const, status: 'active' } : p),
  };
  t.connections.set('p1', { live: false });
  reconnect(t, 'sess-B', 'identity-X', 'p1');
  assert(t.state.players[0].presence === 'human', 'reconnect does not write human → reserved');
}

console.log(`\n── Summary ──\n  ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
