// ─── Authoritative Badugi engine logger ───────────────────────────────────────
// All log lines are prefixed with [badugi:EVENT] so they can be grepped
// independently from general Express/WS traffic.
// Never log card contents — only structural state (phase, pot, player IDs).

type Event =
  | 'TABLE_CREATE'
  | 'PLAYER_JOIN'
  | 'PLAYER_LEAVE'
  | 'PHASE'
  | 'ACTION'
  | 'BOT'
  | 'RECONNECT'
  | 'PERSIST'
  | 'ERROR';

type Detail = Record<string, string | number | boolean | undefined>;

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

// Short table suffix — avoids flooding lines with full table codes.
function tid(tableId: string): string {
  return tableId.length > 8 ? `…${tableId.slice(-8)}` : tableId;
}

export function engineLog(event: Event, tableId: string, detail: Detail = {}): void {
  const kvs = Object.entries(detail)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  const line = `${timestamp()} [badugi:${event}] t=${tid(tableId)}${kvs ? ' ' + kvs : ''}`;
  if (event === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
}
