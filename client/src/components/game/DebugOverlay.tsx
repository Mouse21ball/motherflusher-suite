import { useEffect, useState } from 'react';
import type { GameState } from '@shared/gameTypes';

interface DebugOverlayProps {
  state: GameState;
  myId: string;
  lastWsAt: number | null;
  lastWsType: string | null;
}

export function DebugOverlay({ state, myId, lastWsAt, lastWsType }: DebugOverlayProps) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const activePlayers = state.players.filter(p => p.status === 'active').length;
  const totalChips = state.players.reduce((s, p) => s + (p.chips ?? 0), 0);
  const totalBets = state.players.reduce((s, p) => s + (p.bet ?? 0), 0);
  const ageMs = lastWsAt ? now - lastWsAt : null;
  const stale = ageMs != null && ageMs > 5000;

  return (
    <div
      data-testid="debug-overlay"
      className="fixed top-1 right-1 z-[200] pointer-events-none font-mono text-[10px] leading-tight px-2 py-1.5 rounded border"
      style={{
        background: 'rgba(0,0,0,0.72)',
        borderColor: stale ? 'rgba(255,80,80,0.6)' : 'rgba(255,255,255,0.12)',
        color: stale ? '#ff8080' : 'rgba(255,255,255,0.78)',
        minWidth: 160,
      }}
    >
      <div><span className="text-white/40">phase</span> {state.phase}</div>
      <div><span className="text-white/40">active</span> {activePlayers}/{state.players.length}</div>
      <div><span className="text-white/40">pot</span> ${state.pot}</div>
      <div><span className="text-white/40">cb</span> ${state.currentBet} <span className="text-white/40 ml-1">bets</span> ${totalBets}</div>
      <div><span className="text-white/40">chips</span> ${totalChips}</div>
      <div><span className="text-white/40">turn</span> {state.activePlayerId ?? '—'} {state.activePlayerId === myId ? '(me)' : ''}</div>
      <div><span className="text-white/40">raises</span> {state.raisesThisRound ?? 0}</div>
      <div>
        <span className="text-white/40">ws</span>{' '}
        {lastWsType ?? '—'}{' '}
        <span className={stale ? 'text-red-400' : 'text-white/40'}>
          {ageMs != null ? `${Math.floor(ageMs / 100) / 10}s` : 'never'}
        </span>
      </div>
    </div>
  );
}
