import { Hourglass, Crosshair } from 'lucide-react';

function formatPhase(phase: string): { title: string; subtitle: string } {
  if (phase.startsWith('DRAW_')) {
    const n = phase.split('_')[1];
    return { title: `DRAW ${n} / 3`, subtitle: 'OPPONENTS ARE DISCARDING' };
  }
  if (phase.startsWith('BET_')) {
    return { title: 'BETTING', subtitle: 'PLACE YOUR BETS' };
  }
  if (phase === 'SHOWDOWN') return { title: 'SHOWDOWN', subtitle: 'HANDS REVEALED' };
  if (phase === 'DEAL') return { title: 'DEALING', subtitle: 'CARDS INCOMING' };
  if (phase === 'ANTE') return { title: 'ANTES', subtitle: 'BUYING IN' };
  if (phase === 'DECLARE') return { title: 'DECLARE', subtitle: 'HIGH OR LOW' };
  return { title: phase.replace(/_/g, ' '), subtitle: '' };
}

/**
 * Phase tracker bar — current phase, draw progress, timer.
 * Detroit 2026-10-10: from ChatGPT mockup, on yard background.
 */
export function PhaseTracker({
  phase,
  drawnCount,
  totalPlayers,
  secondsLeft,
}: {
  phase: string;
  drawnCount?: number;
  totalPlayers?: number;
  secondsLeft?: number;
}) {
  const { title, subtitle } = formatPhase(phase);
  const isDrawPhase = phase.startsWith('DRAW_');

  return (
    <div className="phase-tracker">
      <div className="phase-tracker-left">
        {isDrawPhase ? <Crosshair size={18} className="phase-tracker-icon" /> : <Hourglass size={18} className="phase-tracker-icon" />}
        <div>
          <div className="phase-tracker-title">{title}</div>
          <div className="phase-tracker-subtitle">
            {isDrawPhase && drawnCount !== undefined && totalPlayers !== undefined
              ? `${drawnCount} OF ${totalPlayers} PLAYERS DRAWN`
              : subtitle}
          </div>
        </div>
      </div>
      {secondsLeft !== undefined && secondsLeft > 0 && (
        <div className="phase-tracker-timer">
          <Hourglass size={14} />
          <span>{secondsLeft}s</span>
        </div>
      )}
    </div>
  );
}
