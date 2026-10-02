import { randomUUID } from 'node:crypto';

interface CachedRequest<T> {
  expiresAt: number;
  completed: boolean;
  result: Promise<T>;
}

const REQUEST_TTL_MS = 2 * 60_000;
const MAX_CACHED_REQUESTS = 512;
const requests = new Map<string, CachedRequest<unknown>>();

export function parseLegacyRebuyAmount(payload: unknown): number | undefined {
  if (payload === null || payload === undefined) return undefined;
  const amount = typeof payload === 'number'
    ? payload
    : typeof payload === 'object' && !Array.isArray(payload) && 'amount' in payload
      ? (payload as { amount?: unknown }).amount
      : undefined;
  if (!Number.isSafeInteger(amount) || (amount as number) <= 0) {
    throw new Error('Invalid legacy rebuy amount.');
  }
  return amount as number;
}

export interface TableRebuyBustEvent {
  identityId: string;
  eventId: string;
  claimed: boolean;
  fundedSinceBust: boolean;
}

/**
 * The Android 1.3 rebuy message predates the explicit free/reserve/borrow kind.
 * Prefer wallet chips whenever the old request can be satisfied from its
 * authoritative reserve. A legacy 1,000-chip request with less than 1,000 in
 * reserve is the old starter-rebuy shape; route that through the same free
 * grant as the new protocol, unless an outstanding loan shows that this is
 * already-funded loan money.
 *
 * This must be called only while the engine holds the authoritative seat lock.
 */
export function resolveLegacyTableRebuy(
  amount: number | undefined,
  availableReserve: number,
  maxTransfer: number,
  minBuyin: number,
  defaultAmount: number,
  hasOutstandingLoan: boolean,
): { kind: 'free' | 'reserve'; amount?: number } {
  if (amount === undefined) {
    if (maxTransfer >= minBuyin) {
      return {
        kind: 'reserve',
        amount: Math.min(Math.max(minBuyin, defaultAmount), maxTransfer),
      };
    }
    if (hasOutstandingLoan) {
      throw new Error('Your existing chip loan does not have enough wallet chips to fund this rebuy.');
    }
    return { kind: 'free' };
  }

  if (amount === 1_000 && availableReserve < amount) {
    if (hasOutstandingLoan) {
      throw new Error('Your existing chip loan does not have enough wallet chips to fund this rebuy.');
    }
    return { kind: 'free' };
  }
  return { kind: 'reserve', amount };
}

/**
 * Keep a server-owned rebuy id for the entire zero-stack episode, not just
 * whichever hand happens to be current when a button is tapped. A new event is
 * opened only after this event funded the seat and it later busted again.
 */
export function getTableRebuyBustEvent(
  events: Map<string, TableRebuyBustEvent>,
  seat: string,
  identityId: string,
): TableRebuyBustEvent {
  const previous = events.get(seat);
  if (previous && previous.identityId === identityId && previous.claimed && !previous.fundedSinceBust) {
    throw new Error('A rebuy has already been used for this bust event.');
  }
  if (previous && previous.identityId === identityId && !(previous.claimed && previous.fundedSinceBust)) {
    return previous;
  }

  const event = {
    identityId,
    eventId: `${identityId}:${seat}:${randomUUID()}`,
    claimed: false,
    fundedSinceBust: false,
  };
  events.set(seat, event);
  return event;
}

export function markTableRebuyEventClaimed(event: TableRebuyBustEvent): void {
  event.claimed = true;
}

export function markTableRebuyEventFunded(event: TableRebuyBustEvent): void {
  event.claimed = true;
  event.fundedSinceBust = true;
}

/**
 * Deduplicate an authenticated table request across socket retries/reconnects.
 * Rejections are evicted so a failed persistence attempt can be retried.
 */
export function runIdempotentTableRebuyRequest<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  for (const [requestKey, cached] of requests) {
    if (cached.completed && cached.expiresAt <= now) requests.delete(requestKey);
  }

  const previous = requests.get(key);
  if (previous && (!previous.completed || previous.expiresAt > now)) return previous.result as Promise<T>;

  const cached: CachedRequest<T> = {
    expiresAt: now + REQUEST_TTL_MS,
    completed: false,
    result: Promise.resolve().then(operation),
  };
  requests.set(key, cached as CachedRequest<unknown>);
  while (requests.size > MAX_CACHED_REQUESTS) {
    const oldest = [...requests.entries()].find(([, entry]) => entry.completed)?.[0];
    if (oldest === undefined) break;
    requests.delete(oldest);
  }

  void cached.result.then(() => {
    cached.completed = true;
  }, () => {
    if (requests.get(key) === cached) requests.delete(key);
  });
  return cached.result;
}