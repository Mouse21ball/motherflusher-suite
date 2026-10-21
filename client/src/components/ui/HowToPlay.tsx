import { useLocation } from 'wouter';
import { Tutorial } from '../tutorial/Tutorial';
import { TUTORIAL_SPECS } from '../tutorial/specs';

type HowToPlayModeId = 'badugi' | 'flushedup' | 'box_chevy' | 'ladyluck';

interface HowToPlayProps {
  modeId: HowToPlayModeId;
  onClose: () => void;
}

/**
 * How to Play (rebuilt Detroit 2026-10-21, Phase 2): the old 3-slide
 * text carousel is replaced by the shared interactive tutorial —
 * real cards, tappable draws, simulated buttons, win/lose examples
 * written from the game engines. This wrapper keeps the existing
 * call sites and the Badugi practice-table entry point.
 */
export function HowToPlay({ modeId, onClose }: HowToPlayProps) {
  const [, navigate] = useLocation();
  return (
    <Tutorial
      spec={TUTORIAL_SPECS[modeId]}
      onClose={onClose}
      onPractice={modeId === 'badugi' ? () => { onClose(); navigate('/practice/badugi'); } : undefined}
    />
  );
}
