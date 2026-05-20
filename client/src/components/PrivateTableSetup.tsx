// ─── PrivateTableSetup ────────────────────────────────────────────────────────
// Modal that lets the host configure a private (or public) table before creating
// it. Supports all four game modes with a single shared UI.

import { useState } from 'react';
import { useLocation } from 'wouter';
import { generateTableCode } from '@/lib/tableSession';
import { apiUrl } from '@/lib/apiConfig';
import { ensurePlayerIdentity } from '@/lib/persistence';
import { track } from '@/lib/analytics';

const MODES = [
  { id: 'badugi',     name: 'BADUGI',       color: '#10b981', path: '/badugi',     icon: '/mode-icon-badugi.png'   },
  { id: 'dead7',      name: 'DEAD 7',        color: '#ef4444', path: '/dead7',      icon: '/mode-icon-dead7.png'    },
  { id: 'fifteen35',  name: '15 / 35',       color: '#f59e0b', path: '/fifteen35',  icon: '/mode-icon-fifteen35.png' },
  { id: 'suitspoker', name: 'SUITS & POKER', color: '#3b82f6', path: '/suitspoker', icon: '/mode-icon-suits.png'    },
] as const;

type ModeId = typeof MODES[number]['id'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PrivateTableSetup({ open, onClose }: Props) {
  const [, navigate] = useLocation();
  const [selectedMode, setSelectedMode] = useState<ModeId>('badugi');
  const [maxPlayers, setMaxPlayers] = useState(5);
  const [isInviteOnly, setIsInviteOnly] = useState(true);
  const [botsEnabled, setBotsEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const modeInfo = MODES.find(m => m.id === selectedMode)!;

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const code = generateTableCode();
      const identity = ensurePlayerIdentity();

      const res = await fetch(apiUrl('/api/tables'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId:     code,
          modeId:      selectedMode === 'suitspoker' ? 'suits_poker' : selectedMode,
          createdBy:   identity.id,
          maxPlayers,
          botsEnabled,
          isInviteOnly,
          hostId:      identity.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to create table');
      }

      track({ name: 'crew_private_created', mode: selectedMode });

      const params = new URLSearchParams({ t: code });
      if (isInviteOnly) params.set('private', '1');

      navigate(`${modeInfo.path}?${params.toString()}`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, rgba(10,10,20,0.98) 0%, rgba(5,5,10,0.99) 100%)',
          border: '1px solid rgba(201,162,39,0.22)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 pt-5 pb-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">⛓</span>
            <span className="text-sm font-mono font-bold tracking-widest uppercase" style={{ color: 'rgba(201,162,39,0.90)' }}>
              Host a Table
            </span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors text-xl leading-none" data-testid="button-close-setup">×</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">

          {/* Mode selector */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-white/35 block mb-2">Game Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMode(m.id)}
                  data-testid={`button-mode-select-${m.id}`}
                  className="h-10 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  style={{
                    background: selectedMode === m.id ? `${m.color}22` : 'rgba(255,255,255,0.04)',
                    borderColor: selectedMode === m.id ? `${m.color}70` : 'rgba(255,255,255,0.10)',
                    color: selectedMode === m.id ? m.color : 'rgba(255,255,255,0.45)',
                    boxShadow: selectedMode === m.id ? `0 0 12px ${m.color}30` : 'none',
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Max players stepper */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-white/35 block mb-2">Max Players</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMaxPlayers(p => Math.max(2, p - 1))}
                disabled={maxPlayers <= 2}
                data-testid="button-max-players-dec"
                className="w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-bold transition-all active:scale-90 disabled:opacity-30"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
              >−</button>
              <div className="flex-1 text-center">
                <span className="text-2xl font-bold" style={{ color: modeInfo.color }} data-testid="text-max-players">{maxPlayers}</span>
                <span className="text-white/30 text-xs font-mono ml-1">/ 5 seats</span>
              </div>
              <button
                onClick={() => setMaxPlayers(p => Math.min(5, p + 1))}
                disabled={maxPlayers >= 5}
                data-testid="button-max-players-inc"
                className="w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-bold transition-all active:scale-90 disabled:opacity-30"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
              >+</button>
            </div>
          </div>

          {/* Invite-Only vs Public */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-white/35 block mb-2">Access</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true,  label: '🔒 Invite-Only', sub: 'Code required' },
                { value: false, label: '🌐 Public',      sub: 'Listed for all' },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => setIsInviteOnly(opt.value)}
                  data-testid={`button-access-${opt.value ? 'private' : 'public'}`}
                  className="py-2.5 rounded-xl border flex flex-col items-center gap-0.5 transition-all active:scale-95"
                  style={{
                    background: isInviteOnly === opt.value ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)',
                    borderColor: isInviteOnly === opt.value ? 'rgba(139,92,246,0.55)' : 'rgba(255,255,255,0.10)',
                  }}
                >
                  <span className="text-xs font-bold" style={{ color: isInviteOnly === opt.value ? '#a78bfa' : 'rgba(255,255,255,0.45)' }}>{opt.label}</span>
                  <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bots toggle */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-white/35 block mb-2">Bots</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true,  label: '🤖 Bots ON',  sub: 'Fill empty seats' },
                { value: false, label: '🚫 Bots OFF', sub: 'Humans only'       },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => setBotsEnabled(opt.value)}
                  data-testid={`button-bots-${opt.value ? 'on' : 'off'}`}
                  className="py-2.5 rounded-xl border flex flex-col items-center gap-0.5 transition-all active:scale-95"
                  style={{
                    background: botsEnabled === opt.value ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.04)',
                    borderColor: botsEnabled === opt.value ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.10)',
                  }}
                >
                  <span className="text-xs font-bold" style={{ color: botsEnabled === opt.value ? '#10b981' : 'rgba(255,255,255,0.45)' }}>{opt.label}</span>
                  <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs font-mono text-red-400 text-center">{error}</p>
          )}

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={creating}
            data-testid="button-create-private-table"
            className="w-full h-12 rounded-xl text-sm font-bold tracking-widest uppercase transition-all active:scale-[0.97] disabled:opacity-50"
            style={{
              background: creating ? 'rgba(201,162,39,0.25)' : 'linear-gradient(135deg, rgba(201,162,39,0.90) 0%, rgba(240,184,41,0.80) 100%)',
              color: creating ? 'rgba(201,162,39,0.6)' : '#05050A',
              boxShadow: creating ? 'none' : '0 4px 20px rgba(201,162,39,0.35)',
            }}
          >
            {creating ? 'Creating…' : '⛓ Create Table'}
          </button>

        </div>
      </div>
    </div>
  );
}
