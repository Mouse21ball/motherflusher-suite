// ─── Count Days — the monthly calendar on Profile ────────────────────────────
// P6 (2026-11-08): "counting days" rendered as a real month grid.
// Data source: GET /api/players/:id/daily-bonus/history — rows from the
// server's daily_bonus_claims audit log (one row per actual daily-bonus
// claim: claimedAt, streakDay, chipsGranted). A day is marked ONLY when a
// claim row exists for it. Days before records existed, and days the player
// simply didn't claim, render honestly empty. There is no general "login
// history" table in the codebase, so this calendar counts CLAIM days — it
// is labeled that way in the UI and never presented as logins.

import { useCallback, useEffect, useState } from 'react';
import { ChainMark } from '@/components/ChainMark';
import { apiFetch } from '@/lib/session';
import { apiUrl } from '@/lib/apiConfig';

interface ClaimRow {
  claimedAt: string;
  streakDay: number;
  chipsGranted: number;
  stripesGranted: number;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CountDaysCalendar({ playerId }: { playerId: string }) {
  const now = new Date();
  const [year]  = useState(now.getUTCFullYear());
  const [month] = useState(now.getUTCMonth() + 1); // 1-12, UTC — matches the server's claim-day convention
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const mm = `${year}-${String(month).padStart(2, '0')}`;
      const r = await apiFetch(apiUrl(`/api/players/${playerId}/daily-bonus/history?month=${mm}`));
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json();
      setClaims(Array.isArray(data.claims) ? data.claims : []);
    } catch {
      setFailed(true);
    }
  }, [playerId, year, month]);

  useEffect(() => { void load(); }, [load]);

  const claimedDay = new Map<number, ClaimRow>();
  for (const c of claims ?? []) {
    const d = new Date(c.claimedAt);
    if (d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month) claimedDay.set(d.getUTCDate(), c);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow    = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const today       = now.getUTCDate();
  const isCurrentMonth = now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div
      style={{ background: 'rgba(15,10,25,0.55)', border: '1px solid rgba(255,215,0,0.12)', borderRadius: 16, padding: 16 }}
      data-testid="count-days-calendar"
    >
      <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: 'rgba(240,184,41,0.9)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Count Days
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {MONTH_NAMES[month - 1]} {year}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>
        Every marked day is a day you showed up and claimed your daily bonus.
        {claims !== null && !failed && (
          <span className="cgp-num" style={{ color: 'rgba(240,184,41,0.85)' }}> {claimedDay.size} {claimedDay.size === 1 ? 'day' : 'days'} counted this month.</span>
        )}
      </div>

      {failed ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', padding: '10px 0' }}>
          Couldn't load your claim days right now.
        </div>
      ) : claims === null ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', padding: '10px 0' }}>Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1" style={{ marginBottom: 4 }}>
            {DOW.map((d, i) => (
              <div key={i} className="text-center" style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.1em' }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={`x-${i}`} />;
              const claim = claimedDay.get(day);
              const isToday = isCurrentMonth && day === today;
              return (
                <div
                  key={day}
                  data-testid={claim ? `count-day-claimed-${day}` : undefined}
                  className="relative flex flex-col items-center justify-center rounded-lg"
                  style={{
                    minHeight: 44,
                    border: isToday ? '1px solid rgba(240,184,41,0.65)' : '1px solid rgba(255,255,255,0.05)',
                    background: claim ? 'rgba(240,184,41,0.10)' : 'rgba(255,255,255,0.012)',
                  }}
                >
                  <span className="cgp-num" style={{ fontSize: 12, fontWeight: claim ? 700 : 400, color: claim ? '#F0B829' : 'rgba(255,255,255,0.38)' }}>
                    {day}
                  </span>
                  {claim ? (
                    <span className="flex items-center gap-0.5" style={{ marginTop: 1 }}>
                      <ChainMark width={13} strokeWidth={7} />
                      <span className="cgp-num" style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.55)' }}>D{claim.streakDay}</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.18)', marginTop: 1 }}>·</span>
                  )}
                </div>
              );
            })}
          </div>
          {claimedDay.size === 0 && (
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.40)', marginTop: 12 }}>
              No days counted yet this month. Claim today's daily bonus and day one is on the wall.
            </div>
          )}
        </>
      )}
    </div>
  );
}
