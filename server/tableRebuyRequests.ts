interface CachedRequest<T> {
  expiresAt: number;
  completed: boolean;
  result: Promise<T>;
}

const REQUEST_TTL_MS = 2 * 60_000;
const MAX_CACHED_REQUESTS = 512;
const requests = new Map<string, CachedRequest<unknown>>();

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