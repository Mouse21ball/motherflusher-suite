import { useState } from 'react';
import { useLocation } from 'wouter';
import { HowToPlay } from '@/components/ui/HowToPlay';

type ModeId = 'badugi' | 'flushedup' | 'box_chevy' | 'ladyluck';

interface UniversalTableHeaderProps {
  mode: ModeId;
  title: string;
  subtitle: string;
  titleClass?: string;
  hideHelp?: boolean;
}

/**
 * Universal table header — one consistent exit + info across all games.
 * Left: back button (‹) to leave the table.
 * Center: game name + subtitle.
 * Right: info (?) button opening the How To Play modal.
 * (Detroit 2026-10-11: "one universal table exit ... and information")
 */
export function UniversalTableHeader({ mode, title, subtitle, titleClass = '', hideHelp = false }: UniversalTableHeaderProps) {
  const [, navigate] = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <div className="pt-ttop">
        <button className="pt-iconbtn" onClick={() => navigate('/')} aria-label="Leave table">‹</button>
        <div className="pt-ttitle">
          <div className={`pt-game-name ${titleClass}`}>{title}</div>
          <div className="pt-game-sub">{subtitle}</div>
        </div>
        {!hideHelp && (
          <button className="pt-iconbtn" onClick={() => setShowHelp(true)} aria-label="How to play">?</button>
        )}
      </div>
      {showHelp && <HowToPlay modeId={mode} onClose={() => setShowHelp(false)} />}
    </>
  );
}
