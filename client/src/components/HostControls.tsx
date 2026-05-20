// ─── HostControls ─────────────────────────────────────────────────────────────
// In-game host authority panel.
//   • Shows a HOST badge next to the host's name.
//   • Host: opens a panel with share invite, player kick, and settings display.
//   • Non-host: reads settings as read-only; sees who the host is.

import { useState } from 'react';
import { shareOrigin } from '@/lib/apiConfig';

export interface TableSettings {
  maxPlayers:  number;
  botsEnabled: boolean;
  isInviteOnly: boolean;
}

interface PlayerRow {
  id:   string;
  name: string;
}

interface HostControlsProps {
  myId:          string;
  hostId:        string | null;
  tableCode:     string;
  tableSettings: TableSettings;
  players:       PlayerRow[];
  onKick:        (targetPlayerId: string) => void;
  onSettings:    (settings: Partial<TableSettings>) => void;
}

function copyToClipboard(text: string): void {
  try { navigator.clipboard.writeText(text); } catch {}
}

async function shareInvite(tableCode: string, isInviteOnly: boolean): Promise<void> {
  const url  = `${shareOrigin()}/join/${tableCode.toUpperCase()}`;
  const text = isInviteOnly
    ? `Join my private Chain Gang Poker table! Code: ${tableCode.toUpperCase()}`
    : `Play Chain Gang Poker with me!`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Chain Gang Poker', text, url });
      return;
    } catch {}
  }
  copyToClipboard(url);
}

export function HostBadge() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase"
      style={{ background: 'rgba(201,162,39,0.22)', color: 'rgba(201,162,39,0.90)', border: '1px solid rgba(201,162,39,0.35)' }}
    >
      HOST
    </span>
  );
}

export function HostControls({
  myId,
  hostId,
  tableCode,
  tableSettings,
  players,
  onKick,
  onSettings,
}: HostControlsProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isHost = myId === hostId;
  if (!hostId) return null;

  const hostName = players.find(p => p.id === hostId)?.name ?? 'Host';

  function handleShare() {
    shareInvite(tableCode, tableSettings.isInviteOnly);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      {/* Floating HOST button */}
      <button
        onClick={() => setOpen(o => !o)}
        data-testid="button-host-controls"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all active:scale-95"
        style={{
          background: isHost ? 'rgba(201,162,39,0.18)' : 'rgba(255,255,255,0.06)',
          borderColor: isHost ? 'rgba(201,162,39,0.40)' : 'rgba(255,255,255,0.12)',
        }}
      >
        <span className="text-[10px] leading-none">⛓</span>
        <span
          className="text-[10px] font-mono font-bold tracking-widest uppercase"
          style={{ color: isHost ? 'rgba(201,162,39,0.90)' : 'rgba(255,255,255,0.45)' }}
        >
          {isHost ? 'HOST' : `Host: ${hostName}`}
        </span>
      </button>

      {/* Panel overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.70)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(160deg, rgba(10,10,20,0.99) 0%, rgba(5,5,10,1) 100%)',
              border: '1px solid rgba(201,162,39,0.22)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
            }}
          >
            {/* Header */}
            <div
              className="px-5 pt-5 pb-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-base leading-none">⛓</span>
                <span className="text-sm font-mono font-bold tracking-widest uppercase" style={{ color: 'rgba(201,162,39,0.90)' }}>
                  {isHost ? 'Host Controls' : 'Table Info'}
                </span>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60 transition-colors text-xl leading-none" data-testid="button-close-host-panel">×</button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">

              {/* Invite code + share */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-white/35 block mb-2">
                  {tableSettings.isInviteOnly ? '🔒 Invite Code' : '🌐 Table Code'}
                </label>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 rounded-xl px-3 py-2.5 text-center"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
                  >
                    <span className="text-base font-mono font-bold tracking-[0.3em]" style={{ color: 'rgba(201,162,39,0.90)' }} data-testid="text-table-code">
                      {tableCode.toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={handleShare}
                    data-testid="button-share-invite"
                    className="h-10 px-3 rounded-xl text-xs font-bold border transition-all active:scale-95"
                    style={{
                      background: copied ? 'rgba(16,185,129,0.20)' : 'rgba(201,162,39,0.18)',
                      borderColor: copied ? 'rgba(16,185,129,0.50)' : 'rgba(201,162,39,0.40)',
                      color: copied ? '#10b981' : 'rgba(201,162,39,0.90)',
                    }}
                  >
                    {copied ? '✓ Copied' : '↑ Share'}
                  </button>
                </div>
              </div>

              {/* Table settings (read-only for non-host) */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-white/35 block mb-2">Table Settings</label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl px-2 py-2 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="text-xs font-bold text-white/70">{tableSettings.maxPlayers}</div>
                    <div className="text-[9px] font-mono text-white/30">max seats</div>
                  </div>
                  <div className="rounded-xl px-2 py-2 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="text-xs font-bold" style={{ color: tableSettings.botsEnabled ? '#10b981' : '#ef4444' }}>
                      {tableSettings.botsEnabled ? 'ON' : 'OFF'}
                    </div>
                    <div className="text-[9px] font-mono text-white/30">bots</div>
                  </div>
                  <div className="rounded-xl px-2 py-2 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="text-xs font-bold text-white/70">{tableSettings.isInviteOnly ? '🔒' : '🌐'}</div>
                    <div className="text-[9px] font-mono text-white/30">{tableSettings.isInviteOnly ? 'private' : 'public'}</div>
                  </div>
                </div>
              </div>

              {/* Player list with kick buttons (host only) */}
              {isHost && players.length > 0 && (
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-widest text-white/35 block mb-2">Players</label>
                  <div className="flex flex-col gap-1.5">
                    {players.map(p => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/70 font-mono">{p.name}</span>
                          {p.id === hostId && <HostBadge />}
                        </div>
                        {p.id !== myId && (
                          <button
                            onClick={() => { onKick(p.id); setOpen(false); }}
                            data-testid={`button-kick-${p.id}`}
                            className="text-[10px] font-mono px-2 py-1 rounded-lg border transition-all active:scale-90"
                            style={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.30)', color: 'rgba(239,68,68,0.70)' }}
                          >
                            Kick
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Host-only quick settings */}
              {isHost && (
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-widest text-white/35 block mb-2">Quick Settings</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onSettings({ botsEnabled: !tableSettings.botsEnabled })}
                      data-testid="button-toggle-bots"
                      className="py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95"
                      style={{
                        background: tableSettings.botsEnabled ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.10)',
                        borderColor: tableSettings.botsEnabled ? 'rgba(16,185,129,0.40)' : 'rgba(239,68,68,0.30)',
                        color: tableSettings.botsEnabled ? '#10b981' : '#ef4444',
                      }}
                    >
                      {tableSettings.botsEnabled ? '🤖 Bots ON' : '🚫 Bots OFF'}
                    </button>
                    <button
                      onClick={() => onSettings({ isInviteOnly: !tableSettings.isInviteOnly })}
                      data-testid="button-toggle-access"
                      className="py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95"
                      style={{
                        background: tableSettings.isInviteOnly ? 'rgba(139,92,246,0.14)' : 'rgba(16,185,129,0.10)',
                        borderColor: tableSettings.isInviteOnly ? 'rgba(139,92,246,0.40)' : 'rgba(16,185,129,0.30)',
                        color: tableSettings.isInviteOnly ? '#a78bfa' : '#10b981',
                      }}
                    >
                      {tableSettings.isInviteOnly ? '🔒 Invite-Only' : '🌐 Public'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  );
}
