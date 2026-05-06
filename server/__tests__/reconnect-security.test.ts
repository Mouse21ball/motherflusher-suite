// ─── Reconnect-security regression suite ─────────────────────────────────────
// Standalone tsx script. Run with:
//   npx tsx server/__tests__/reconnect-security.test.ts
//
// Pure-logic mirrors of the reconnect / identity-claim guards in
// server/gameEngine.ts and server/genericEngine.ts.
//
// Scenarios covered (mirrors engine code):
//   R1  Same sessionId always maps back to the same seat.
//   R2  Identity reclaim: player reconnects from a NEW session — engine should
//       move them back to their original seat.
//   R3  Identity theft: a different identity cannot steal an occupied seat.
//   R4  Spectator fallback: all seats full + player has no matching identity
//       → goes to spectator list, not an existing seat.
//   R5  Disconnect race guard: lastChipSyncHand seed prevents pre-hand
//       disconnect from overwriting DB chips with placeholder (extended).
//   R6  Mid-hand guard: server-restart reconnect does NOT overwrite live
//       table chips when the phase is BET_2 (mid-hand).
//   R7  Reconnect between hands: server-restart reconnect DOES reload DB chips
//       when the phase is WAITING.
//   R8  Duplicate session rejection: same identity already connected from
//       another tab → old connection is evicted before new one is seated.

let failures = 0;
let passes   = 0;

function assert(cond: unknown, msg: string): void {
  if (!cond) { failures++; console.error('  ✗', msg); }
  else        { passes++;   console.log('  ✓', msg); }
}
function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ─── Shared fixtures ─────────────────────────────────────────────────────────

type SeatId = string;
type SessionId = string;
type IdentityId = string;

interface MockTable {
  sessionToSeat:    Map<SessionId, SeatId>;
  seatToIdentityId: Map<SeatId, IdentityId>;
  connections:      Map<SeatId, { closed: boolean }>;
  seats:            SeatId[];
  spectators:       Set<SessionId>;
  state: {
    phase: string;
    players: Array<{ id: SeatId; chips: number; presence: string }>;
  };
  lastChipSyncHand: Map<SeatId, number>;
  handId: number;
}

function makeTable(): MockTable {
  return {
    sessionToSeat:    new Map(),
    seatToIdentityId: new Map(),
    connections:      new Map(),
    seats:            ['p1', 'p2', 'p3', 'p4', 'p5'],
    spectators:       new Set(),
    state: {
      phase: 'WAITING',
      players: ['p1','p2','p3','p4','p5'].map(id => ({
        id, chips: 1000, presence: 'bot' as const,
      })),
    },
    lastChipSyncHand: new Map(),
    handId: 0,
  };
}

/** Mirrors assignSeat() in gameEngine.ts — returns seat or null (→ spectator). */
function assignSeat(table: MockTable, sessionId: SessionId): SeatId | null {
  const existing = table.sessionToSeat.get(sessionId);
  if (existing) return existing;
  const free = table.seats.find(
    s => !table.connections.has(s) &&
         table.state.players.find(p => p.id === s)?.presence !== 'human',
  );
  return free ?? null;
}

/** Mirrors the identity-reclaim block in addBadugiConnection(). */
function resolveIdentitySeat(
  table: MockTable,
  sessionId: SessionId,
  assignedSeat: SeatId,
  identityId: IdentityId,
): { finalSeat: SeatId; evicted: boolean } {
  let foundSeat: SeatId | null = null;
  for (const [s, id] of table.seatToIdentityId.entries()) {
    if (id === identityId && s !== assignedSeat) { foundSeat = s; break; }
  }
  if (!foundSeat) return { finalSeat: assignedSeat, evicted: false };

  // Identity already has a seat elsewhere.
  if (table.connections.has(foundSeat)) {
    // Active connection from another tab → evict old session.
    let oldSid: SessionId | null = null;
    for (const [sid, s] of table.sessionToSeat.entries()) {
      if (s === foundSeat) { oldSid = sid; break; }
    }
    if (oldSid) {
      table.sessionToSeat.delete(oldSid);
      table.connections.delete(foundSeat);
    }
    return { finalSeat: foundSeat, evicted: true };
  }
  // Disconnected seat — silent reconnect.
  return { finalSeat: foundSeat, evicted: false };
}

/** Mirrors the mid-hand guard for server-restart chip reload. */
function shouldReloadChipsOnReconnect(phase: string, wasReserved: boolean): boolean {
  if (wasReserved) return true;
  const isBetweenHands = phase === 'WAITING' || phase === 'ANTE';
  return isBetweenHands;
}

/** Mirrors the disconnect-guard predicate that skips DB write when chips already synced. */
function disconnectWouldWriteDb(
  lastChipSyncHand: Map<string, number>,
  seat: string,
  handId: number,
): boolean {
  const lastSynced = lastChipSyncHand.get(seat) ?? -1;
  return lastSynced !== handId;
}

// ─── R1 — Same sessionId maps back to the same seat ──────────────────────────
section('R1 — same sessionId always maps to the same seat');
{
  const table = makeTable();
  const sessionId = 'sess-abc-123';

  const seat1 = assignSeat(table, sessionId);
  assert(seat1 !== null, 'R1: first call assigns a seat');
  table.sessionToSeat.set(sessionId, seat1!);
  table.connections.set(seat1!, { closed: false });
  table.state.players.find(p => p.id === seat1!)!.presence = 'human';

  // Reconnect — same sessionId.
  const seat2 = assignSeat(table, sessionId);
  assert(seat2 === seat1, `R1: reconnect with same session returns same seat (${seat2})`);
}

// ─── R2 — Identity reclaim: reconnect from NEW session ───────────────────────
section('R2 — identity reclaim from a new session (e.g. tab closed & reopened)');
{
  const table = makeTable();
  const oldSession = 'old-session';
  const newSession = 'new-session';
  const identityId = 'player-uuid-001';

  // Original connection: old session → p2, identity recorded.
  table.sessionToSeat.set(oldSession, 'p2');
  table.seatToIdentityId.set('p2', identityId);
  table.state.players.find(p => p.id === 'p2')!.presence = 'human';
  // Old session disconnected — no active connection.

  // New session assigned p1 (first free seat).
  const assigned = assignSeat(table, newSession) ?? 'p1';
  table.sessionToSeat.set(newSession, assigned);

  // Identity reclaim resolves to p2 (existing seat for this identity).
  const { finalSeat, evicted } = resolveIdentitySeat(table, newSession, assigned, identityId);
  assert(finalSeat === 'p2', `R2: identity reclaimed original seat p2 (got ${finalSeat})`);
  assert(!evicted,           'R2: no eviction needed (old session was disconnected)');
}

// ─── R3 — Identity theft: different identity cannot steal an occupied seat ────
section('R3 — identity theft: occupied seat cannot be reclaimed by a different player');
{
  const table = makeTable();
  const attackerSession  = 'attacker-session';
  const attackerIdentity = 'attacker-uuid';
  const victimIdentity   = 'victim-uuid';

  // Victim is in seat p3, currently connected.
  table.seatToIdentityId.set('p3', victimIdentity);
  table.connections.set('p3', { closed: false });
  table.sessionToSeat.set('victim-session', 'p3');
  table.state.players.find(p => p.id === 'p3')!.presence = 'human';

  // Attacker is assigned p1 (next free seat) and has a DIFFERENT identity.
  const assigned = 'p1';
  table.sessionToSeat.set(attackerSession, assigned);
  table.seatToIdentityId.set(assigned, attackerIdentity);

  // Identity-reclaim block for the attacker: no seat found for attackerIdentity ≠ victimIdentity.
  const { finalSeat } = resolveIdentitySeat(table, attackerSession, assigned, attackerIdentity);
  assert(finalSeat === 'p1', `R3: attacker stays in p1, cannot take p3 (got ${finalSeat})`);

  // Victim's seat must still belong to victimIdentity.
  assert(
    table.seatToIdentityId.get('p3') === victimIdentity,
    'R3: victim seat p3 identity unchanged',
  );
}

// ─── R4 — Spectator fallback: all seats occupied, no matching identity ────────
section('R4 — spectator fallback when all seats are full');
{
  const table = makeTable();
  const spectatorSession = 'spectator-session';

  // Fill all seats with active humans.
  for (const s of table.seats) {
    table.connections.set(s, { closed: false });
    table.state.players.find(p => p.id === s)!.presence = 'human';
    table.sessionToSeat.set(`sess-${s}`, s);
    table.seatToIdentityId.set(s, `id-${s}`);
  }

  const seat = assignSeat(table, spectatorSession);
  assert(seat === null, `R4: full table → assignSeat returns null (goes to spectator) (got ${seat})`);
}

// ─── R5 — Disconnect race guard (extended) ───────────────────────────────────
section('R5 — disconnect race guard: seeded lastChipSyncHand prevents placeholder write');
{
  const table = makeTable();
  table.handId = 3;

  // BEFORE fix: no seed — disconnect writes placeholder 1000.
  assert(
    disconnectWouldWriteDb(table.lastChipSyncHand, 'p1', table.handId) === true,
    'R5: pre-fix — no seed → disconnect would overwrite DB chips',
  );

  // AFTER fix: seed at join time → no write.
  table.lastChipSyncHand.set('p1', table.handId);
  assert(
    disconnectWouldWriteDb(table.lastChipSyncHand, 'p1', table.handId) === false,
    'R5: post-fix — seeded to handId=3 → disconnect skipped',
  );

  // After resetToAnte (handId increments to 4, sync written with handId=4):
  table.handId = 4;
  table.lastChipSyncHand.set('p1', 4);
  assert(
    disconnectWouldWriteDb(table.lastChipSyncHand, 'p1', 4) === false,
    'R5: after hand-end sync → still skipped (lastSynced === handId)',
  );

  // Mid-hand next round (handId=4, lastSynced=4 from prior resetToAnte):
  assert(
    disconnectWouldWriteDb(table.lastChipSyncHand, 'p1', 4) === false,
    'R5: mid-hand disconnect → skipped (hand-end will write correct chips)',
  );
}

// ─── R6 — Mid-hand guard: server-restart does NOT reload mid-hand chips ───────
section('R6 — mid-hand guard: server-restart reconnect skips chip reload mid-hand');
{
  // Phase = BET_2 (mid-hand) + wasReserved=false (reconnect, not new seat).
  assert(
    shouldReloadChipsOnReconnect('BET_2', false) === false,
    'R6: BET_2, wasReserved=false → no chip reload (protect live mid-hand chips)',
  );
  assert(
    shouldReloadChipsOnReconnect('HIT_1', false) === false,
    'R6: HIT_1, wasReserved=false → no chip reload',
  );
  assert(
    shouldReloadChipsOnReconnect('SHOWDOWN', false) === false,
    'R6: SHOWDOWN, wasReserved=false → no chip reload',
  );
}

// ─── R7 — Between-hands reload: server-restart reconnect DOES reload chips ────
section('R7 — between-hands guard: server-restart reconnect reloads DB chips in WAITING/ANTE');
{
  assert(
    shouldReloadChipsOnReconnect('WAITING', false) === true,
    'R7: WAITING, wasReserved=false → reload DB chips (safe to overwrite)',
  );
  assert(
    shouldReloadChipsOnReconnect('ANTE', false) === true,
    'R7: ANTE, wasReserved=false → reload DB chips (safe to overwrite)',
  );
  // wasReserved=true always reloads regardless of phase.
  assert(
    shouldReloadChipsOnReconnect('BET_3', true) === true,
    'R7: any phase, wasReserved=true → always reloads (first join)',
  );
}

// ─── R8 — Duplicate tab eviction: old connection kicked on second tab join ────
section('R8 — duplicate tab eviction: old same-identity session is evicted');
{
  const table = makeTable();
  const identityId  = 'player-with-two-tabs';
  const oldSession  = 'tab-1-session';
  const newSession  = 'tab-2-session';

  // Tab 1 is seated and actively connected at p4.
  table.sessionToSeat.set(oldSession, 'p4');
  table.seatToIdentityId.set('p4', identityId);
  table.connections.set('p4', { closed: false });
  table.state.players.find(p => p.id === 'p4')!.presence = 'human';

  // Tab 2 gets assigned a different seat first (p1).
  const assignedSeat = 'p1';
  table.sessionToSeat.set(newSession, assignedSeat);

  // Identity reclaim resolves back to p4 and evicts Tab 1.
  const { finalSeat, evicted } = resolveIdentitySeat(
    table, newSession, assignedSeat, identityId,
  );
  assert(finalSeat === 'p4', `R8: new tab reclaims original seat p4 (got ${finalSeat})`);
  assert(evicted,            'R8: old tab-1 connection was evicted');
  assert(
    !table.sessionToSeat.has(oldSession),
    'R8: old session removed from sessionToSeat after eviction',
  );
  assert(
    !table.connections.has('p4'),
    'R8: old connection removed from connections map after eviction',
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n── Results: ${passes} passed, ${failures} failed ──`);
process.exit(failures === 0 ? 0 : 1);
