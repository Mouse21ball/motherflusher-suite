import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

type HowToPlayModeId = 'badugi' | 'flushedup' | 'box_chevy' | 'ladyluck';

interface HowToPlayProps {
  modeId: HowToPlayModeId;
  onClose: () => void;
}

interface Slide {
  title: string;
  desc: string;
  mark: string;
}

const RULES: Record<HowToPlayModeId, { name: string; color: string; slides: Slide[] }> = {
  badugi: {
    name: 'BADUGI',
    color: '#4CAF50',
    slides: [
      { mark: 'B', title: 'Build a Badugi', desc: 'Make a four-card hand with different ranks and different suits. The lowest valid hand wins Low; the highest valid hand wins High.' },
      { mark: '3 / 2 / 1', title: 'Three Draw Rounds', desc: 'Receive four cards. Swap up to three cards, then two, then one. Choose discards that improve your hand without giving away your plan.' },
      { mark: 'H / L', title: 'Declare Your Side', desc: 'At declaration, choose High, Low, or Fold. Only valid Badugis compete. A-2-3-4 in four suits is the ideal Low hand.' },
    ],
  },
  flushedup: {
    name: 'FLUSHED UP',
    color: '#7c3aed',
    slides: [
      { mark: '5', title: 'Make a Real Flush', desc: 'A qualifying hand is five cards of one suit. If no player makes a flush, the pot is not awarded to a player who simply stayed in.' },
      { mark: '3 / 2 / 1', title: 'Draw Toward One Suit', desc: 'Keep cards that share a suit and replace up to three, then two, then one card across the draw rounds.' },
      { mark: 'SHOWDOWN', title: 'Compare Qualifying Flushes', desc: 'There is no declaration round. At showdown, qualifying flushes compare by card ranks.' },
    ],
  },
  box_chevy: {
    name: 'BOX CHEVY',
    color: '#3b82f6',
    slides: [
      { mark: '5 + 5', title: 'Ten Cards, No Pairs', desc: 'Combine your five hole cards with the five community cards. Every rank across all ten cards must be unique for a made hand.' },
      { mark: '3 / 2 / 1', title: 'Draw Carefully', desc: 'Replace up to three hole cards, then two, then one. The made-hand indicator updates as your cards change.' },
      { mark: 'H / L / S', title: 'Declare High, Low, or Swing', desc: 'Choose a side only with a made hand. If any rank is duplicated across the full ten-card hand at declaration, you are auto-folded.' },
    ],
  },
  ladyluck: {
    name: 'LADY LUCK',
    color: '#e53935',
    slides: [
      { mark: 'SUIT', title: 'Pick a Suit', desc: 'Choose one of the four suits when your seat is up. Queens are part of the shuffled deck, not suit choices.' },
      { mark: '9', title: 'Watch the Race', desc: 'Cards turn one at a time. The first suit to appear nine times wins the race.' },
      { mark: 'WAGER', title: 'Set Your Stake', desc: 'Wager within the room limit. Optional side bets are separate from the main pot.' },
    ],
  },
};

export function HowToPlay({ modeId, onClose }: HowToPlayProps) {
  const [, navigate] = useLocation();
  const [slide, setSlide] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { name, color, slides } = RULES[modeId];
  const current = slides[slide];
  const isLast = slide === slides.length - 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => dialog?.querySelectorAll<HTMLElement>(selector) ?? [];
    (focusables()[0] ?? dialog)?.focus();
    const containTabFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const elements = focusables();
      if (!elements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', containTabFocus);
    return () => {
      document.removeEventListener('keydown', containTabFocus);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <div
      ref={dialogRef}
      data-testid="modal-how-to-play"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} how to play`}
      tabIndex={-1}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
          <span data-testid="text-how-to-play-mode-name" style={{ fontFamily: 'Anton, Impact, "Arial Narrow Bold", sans-serif', fontSize: 20, color, letterSpacing: '1px' }}>{name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span data-testid="text-slide-counter" style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{slide + 1} of {slides.length}</span>
          <button data-testid="button-how-to-play-skip" onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 20, padding: '5px 14px', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.55)', cursor: 'pointer', letterSpacing: '0.06em' }}>SKIP</button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px 0 0' }}>
        {slides.map((item, index) => <div key={item.title} style={{ width: index === slide ? 18 : 6, height: 6, borderRadius: 3, background: index === slide ? color : 'rgba(255,255,255,0.18)', transition: 'all 0.25s' }} />)}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 24px 8px', textAlign: 'center', overflowY: 'auto' }}>
        <div data-testid="text-slide-icon" style={{ fontFamily: 'monospace', fontSize: 34, fontWeight: 900, color, marginBottom: 16, lineHeight: 1, letterSpacing: '0.08em' }}>{current.mark}</div>
        <div data-testid="text-slide-title" style={{ fontFamily: 'Anton, Impact, "Arial Narrow Bold", sans-serif', fontSize: 22, fontWeight: 'bold', color: 'white', marginBottom: 10, letterSpacing: '0.5px' }}>{current.title}</div>
        <div data-testid="text-slide-desc" style={{ fontSize: 15, color: 'rgba(255,255,255,0.80)', lineHeight: 1.6, maxWidth: 320 }}>{current.desc}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: modeId === 'badugi' ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px 40px', gap: 16 }}>
        {modeId === 'badugi' && (
          <button type="button" data-testid="button-how-to-practice-badugi" onClick={() => { onClose(); navigate('/practice/badugi'); }} style={{ background: 'rgba(110,231,183,0.14)', border: '1px solid rgba(110,231,183,0.55)', borderRadius: 24, padding: '10px 24px', fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: '#6ee7b7', cursor: 'pointer', letterSpacing: '0.06em', width: '100%', marginBottom: 10 }}>
            PRACTICE BADUGI
          </button>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 16 }}>
          <button data-testid="button-how-to-play-back" onClick={() => setSlide(value => Math.max(0, value - 1))} disabled={slide === 0} style={{ background: 'none', border: `1px solid ${slide === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)'}`, borderRadius: 24, padding: '12px 32px', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: slide === 0 ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)', cursor: slide === 0 ? 'default' : 'pointer', letterSpacing: '0.04em' }}>BACK</button>
          <button data-testid={isLast ? 'button-how-to-play-finish' : 'button-how-to-play-next'} onClick={() => isLast ? onClose() : setSlide(value => value + 1)} style={{ background: color, border: 'none', borderRadius: 24, padding: '12px 32px', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: 'white', cursor: 'pointer', letterSpacing: '0.04em', boxShadow: `0 0 20px ${color}66` }}>{isLast ? "LET'S PLAY" : 'NEXT'}</button>
        </div>
      </div>
    </div>
  );
}
