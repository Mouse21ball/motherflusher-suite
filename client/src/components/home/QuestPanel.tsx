import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/session';
import { apiUrl } from '@/lib/apiConfig';
import { useServerProfile } from '@/lib/useServerProfile';

// ── Quest definitions (mirrors server) ───────────────────────────────────────

interface DailyQuestDef {
  questId:      string;
  description:  string;
  modeId:       string | null;
  requiredHands: number;
  stripes:      number;
}

const DAILY_QUESTS: Record<number, DailyQuestDef> = {
  1: { questId: 'daily_monday',    description: 'Play 10 hands in Badugi',              modeId: 'badugi', requiredHands: 10, stripes: 5 },
  2: { questId: 'daily_tuesday',   description: 'Play 10 hands in Dead 7',              modeId: 'dead7',  requiredHands: 10, stripes: 5 },
  3: { questId: 'daily_wednesday', description: 'Play 10 hands in 15/35',               modeId: '1535',   requiredHands: 10, stripes: 5 },
  4: { questId: 'daily_thursday',  description: 'Play 10 hands in Suits & Poker',       modeId: 'suits',  requiredHands: 10, stripes: 5 },
  5: { questId: 'daily_friday',    description: 'Play 15 hands in any mode',            modeId: null,     requiredHands: 15, stripes: 5 },
  6: { questId: 'daily_saturday',  description: 'Win 15 hands in any mode',             modeId: null,     requiredHands: 15, stripes: 5 },
  0: { questId: 'daily_sunday',    description: 'Play 10 hands in two different modes', modeId: null,     requiredHands: 10, stripes: 5 },
};

interface MilestoneQuestDef {
  questId:      string;
  label:        string;
  requiredHands: number;
  modeId:       string | null;
  stripes:      number;
}

const MILESTONE_QUESTS: MilestoneQuestDef[] = [
  { questId: 'milestone_50',         label: '50 Hands Played',         requiredHands: 50,   modeId: null,     stripes: 10  },
  { questId: 'milestone_100',        label: '100 Hands Played',        requiredHands: 100,  modeId: null,     stripes: 25  },
  { questId: 'milestone_500',        label: '500 Hands Played',        requiredHands: 500,  modeId: null,     stripes: 50  },
  { questId: 'milestone_1000',       label: '1,000 Hands Played',      requiredHands: 1000, modeId: null,     stripes: 100 },
  { questId: 'milestone_2500',       label: '2,500 Hands Played',      requiredHands: 2500, modeId: null,     stripes: 150 },
  { questId: 'milestone_badugi_100', label: '100 Badugi Hands',        requiredHands: 100,  modeId: 'badugi', stripes: 15  },
  { questId: 'milestone_dead7_100',  label: '100 Dead 7 Hands',        requiredHands: 100,  modeId: 'dead7',  stripes: 15  },
  { questId: 'milestone_1535_100',   label: '100 15/35 Hands',         requiredHands: 100,  modeId: '1535',   stripes: 15  },
  { questId: 'milestone_suits_100',  label: '100 Suits & Poker Hands', requiredHands: 100,  modeId: 'suits',  stripes: 15  },
];

// ── Server response shape ─────────────────────────────────────────────────────

interface QuestData {
  claimed:           string[];
  handsPlayed:       number;
  handsPlayedBadugi: number;
  handsPlayedDead7:  number;
  handsPlayed1535:   number;
  handsPlayedSuits:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function handsForMode(data: QuestData, modeId: string | null): number {
  if (!modeId)         return data.handsPlayed;
  if (modeId === 'badugi') return data.handsPlayedBadugi;
  if (modeId === 'dead7')  return data.handsPlayedDead7;
  if (modeId === '1535')   return data.handsPlayed1535;
  if (modeId === 'suits')  return data.handsPlayedSuits;
  return data.handsPlayed;
}

function ProgressBar({ current, required, color = '#C9A227' }: { current: number; required: number; color?: string }) {
  const pct = Math.min(100, Math.round((current / required) * 100));
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${color}99, ${color})`,
        borderRadius: 4,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: 'linear-gradient(135deg, #1a1230, #12092a)',
      border: '1.5px solid rgba(201,162,39,0.60)',
      borderRadius: 12, padding: '10px 20px',
      color: '#F0B829', fontFamily: 'monospace', fontWeight: 800,
      fontSize: 13, zIndex: 9999, whiteSpace: 'nowrap',
      boxShadow: '0 8px 32px rgba(0,0,0,0.60)',
    }}>
      {message}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface QuestPanelProps {
  playerId: string;
}

export function QuestPanel({ playerId }: QuestPanelProps) {
  const [data, setData]       = useState<QuestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [toast, setToast]     = useState<string | null>(null);
  const { refetch: refetchProfile } = useServerProfile();

  const fetchData = useCallback(async () => {
    try {
      const r = await apiFetch(apiUrl(`/api/players/${playerId}/quests`));
      if (r.ok) setData(await r.json());
    } catch {}
    finally { setLoading(false); }
  }, [playerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const claim = useCallback(async (questId: string, stripes: number) => {
    if (claiming) return;
    setClaiming(questId);
    try {
      const r = await apiFetch(apiUrl(`/api/players/${playerId}/quests/claim`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questId }),
      });
      if (r.ok) {
        const body = await r.json();
        setToast(`+${body.stripesGranted ?? stripes} ◆ Stripes earned!`);
        await fetchData();
        refetchProfile();
      } else {
        const err = await r.json().catch(() => ({}));
        setToast(err.error ?? 'Could not claim');
      }
    } catch {
      setToast('Network error');
    } finally {
      setClaiming(null);
    }
  }, [claiming, playerId, fetchData, refetchProfile]);

  // Today's daily quest
  const todayDow = new Date().getUTCDay();
  const todayQuest = DAILY_QUESTS[todayDow];

  if (loading) return (
    <div style={{ padding: '16px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 12 }}>
      Loading quests…
    </div>
  );
  if (!data) return null;

  return (
    <div
      data-testid="quest-panel"
      style={{
        background: 'linear-gradient(135deg, rgba(20,14,40,0.98) 0%, rgba(12,8,28,0.98) 100%)',
        border: '1px solid rgba(201,162,39,0.18)',
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 8,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>🎯</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 13, color: '#C9A227', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Quests & Milestones
        </span>
      </div>

      {/* Daily Quest */}
      {todayQuest && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(201,162,39,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            Today's Quest
          </div>
          <DailyQuestRow
            quest={todayQuest}
            data={data}
            claimed={data.claimed}
            claiming={claiming}
            onClaim={claim}
          />
        </div>
      )}

      {/* Milestones */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(201,162,39,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          Milestones
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MILESTONE_QUESTS.map(m => {
            const hands    = handsForMode(data, m.modeId);
            const done     = hands >= m.requiredHands;
            const claimed  = data.claimed.includes(m.questId);
            const isClaiming = claiming === m.questId;
            return (
              <div key={m.questId} data-testid={`milestone-row-${m.questId}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Progress + label */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: claimed ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.80)' }}>
                      {m.label}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(201,162,39,0.65)', flexShrink: 0 }}>
                      {Math.min(hands, m.requiredHands).toLocaleString()}/{m.requiredHands.toLocaleString()}
                    </span>
                  </div>
                  <ProgressBar current={hands} required={m.requiredHands} color={claimed ? '#555' : '#C9A227'} />
                </div>
                {/* Reward badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, width: 80, justifyContent: 'flex-end' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: 'rgba(201,162,39,0.80)' }}>
                    +{m.stripes} ◆
                  </span>
                  {claimed ? (
                    <span
                      data-testid={`milestone-claimed-${m.questId}`}
                      style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 9, color: '#10B981', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 6, padding: '2px 6px', letterSpacing: '0.06em' }}
                    >
                      ✓
                    </span>
                  ) : (
                    <button
                      data-testid={`milestone-claim-${m.questId}`}
                      disabled={!done || !!isClaiming}
                      onClick={() => claim(m.questId, m.stripes)}
                      style={{
                        fontFamily: 'monospace', fontWeight: 800, fontSize: 9,
                        padding: '3px 8px', borderRadius: 6,
                        background: done ? 'linear-gradient(135deg, #C9A227, #a07c1a)' : 'rgba(255,255,255,0.05)',
                        color: done ? '#0c0b08' : 'rgba(255,255,255,0.20)',
                        border: done ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        cursor: done ? 'pointer' : 'not-allowed',
                        opacity: isClaiming ? 0.6 : 1,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {isClaiming ? '…' : 'Claim'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ── Daily quest row ───────────────────────────────────────────────────────────

function DailyQuestRow({
  quest, data, claimed, claiming, onClaim,
}: {
  quest:    DailyQuestDef;
  data:     QuestData;
  claimed:  string[];
  claiming: string | null;
  onClaim:  (questId: string, stripes: number) => void;
}) {
  const hands      = handsForMode(data, quest.modeId);
  const eligible   = hands >= quest.requiredHands;
  const isClaimed  = claimed.some(q => q === quest.questId);
  const isClaiming = claiming === quest.questId;

  return (
    <div data-testid="daily-quest-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <span style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 13, color: isClaimed ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.90)' }}>
            {quest.description}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(201,162,39,0.75)', flexShrink: 0, marginLeft: 8 }}>
            +{quest.stripes} ◆
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <ProgressBar current={hands} required={quest.requiredHands} color={isClaimed ? '#555' : '#F0B829'} />
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
            {Math.min(hands, quest.requiredHands)}/{quest.requiredHands}
          </span>
        </div>
      </div>

      {isClaimed ? (
        <div
          data-testid="daily-quest-claimed"
          style={{
            fontFamily: 'monospace', fontWeight: 900, fontSize: 10,
            color: '#10B981', background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.30)', borderRadius: 8,
            padding: '4px 10px', letterSpacing: '0.08em', textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          CLAIMED
        </div>
      ) : (
        <button
          data-testid="daily-quest-claim-btn"
          disabled={!eligible || !!isClaiming}
          onClick={() => onClaim(quest.questId, quest.stripes)}
          style={{
            fontFamily: 'monospace', fontWeight: 900, fontSize: 11,
            padding: '6px 14px', borderRadius: 8, flexShrink: 0,
            background: eligible ? 'linear-gradient(135deg, #F0B829, #C9A227)' : 'rgba(255,255,255,0.06)',
            color: eligible ? '#0c0b08' : 'rgba(255,255,255,0.22)',
            border: eligible ? 'none' : '1px solid rgba(255,255,255,0.08)',
            cursor: eligible ? 'pointer' : 'not-allowed',
            opacity: isClaiming ? 0.6 : 1,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            boxShadow: eligible ? '0 2px 12px rgba(240,184,41,0.40)' : 'none',
          }}
        >
          {isClaiming ? '…' : 'Claim'}
        </button>
      )}
    </div>
  );
}
