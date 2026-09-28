import { useState } from 'react';
import type { GameState } from '@shared/gameTypes';
import { getBadugiPracticeGuide } from '@shared/practiceGuide';

interface PracticeGuideProps {
  state: GameState;
  myId: string;
  selectedCount: number;
  onExit: () => void;
}

const chrome = {
  background: 'rgba(14, 20, 17, 0.94)',
  border: 'rgba(110, 231, 183, 0.28)',
  accent: '#6ee7b7',
};

/**
 * Small, non-modal table-side guide. It never captures pointer events except
 * for its explicit close control, keeping every table action available.
 */
export function PracticeGuide({ state, myId, selectedCount, onExit }: PracticeGuideProps) {
  const [expanded, setExpanded] = useState(false);
  const guide = getBadugiPracticeGuide(state, myId, selectedCount);
  const statusColor = guide.status === 'your-turn'
    ? '#6ee7b7'
    : guide.status === 'complete'
      ? '#fbbf24'
      : '#cbd5e1';

  return (
    <aside
      aria-label="Practice guidance"
      data-testid="practice-guide"
      className="fixed z-40 left-3 right-3 top-3 sm:left-auto sm:right-4 sm:top-4 sm:w-[min(23rem,calc(100vw-2rem))] pointer-events-none"
    >
      <section
        className="rounded-xl border shadow-xl backdrop-blur-md p-2.5 sm:p-3"
        style={{ background: chrome.background, borderColor: chrome.border, color: 'white' }}
      >
        <header className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="practice-guide-details"
            onClick={() => setExpanded(value => !value)}
            className="pointer-events-auto min-w-0 flex-1 text-left"
            data-testid="button-practice-guide-toggle"
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-[10px] font-mono uppercase tracking-[0.12em]" style={{ color: chrome.accent }}>
                {guide.mode} · {guide.phase}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: `${statusColor}20`, color: statusColor }}
                data-testid="practice-guide-turn-status"
              >
                {guide.statusText}
              </span>
            </div>
            <span className="mt-0.5 block truncate text-sm font-bold">{guide.title}</span>
          </button>
          <button
            type="button"
            aria-label={expanded ? 'Collapse practice guidance' : 'Expand practice guidance'}
            onClick={() => setExpanded(value => !value)}
            className="pointer-events-auto shrink-0 rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
            data-testid="button-practice-guide-expand"
          >
            {expanded ? 'Less' : 'Guide'}
          </button>
          <button
            type="button"
            onClick={onExit}
            aria-label="Exit practice"
            className="pointer-events-auto shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white"
            data-testid="button-practice-guide-exit"
          >
            Exit
          </button>
        </header>
        <div id="practice-guide-details" hidden={!expanded} data-testid="practice-guide-details">
          <p className="mt-2 text-sm leading-snug text-white/90">{guide.instruction}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/65">{guide.detail}</p>
          {!!guide.actions.length && (
            <ul className="mt-2 space-y-1">
              {guide.actions.map((action, index) => (
                <li key={index} className="flex gap-2 text-xs leading-snug text-white/75">
                  <span style={{ color: chrome.accent }} aria-hidden>•</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 border-t border-white/10 pt-2 text-[10px] font-mono uppercase tracking-wider text-white/40">
            Other practice modes coming later
          </p>
        </div>
        {!expanded && <p className="mt-1 text-[9px] font-mono uppercase tracking-wider text-white/40">More practice modes coming later</p>}
      </section>
    </aside>
  );
}

export default PracticeGuide;