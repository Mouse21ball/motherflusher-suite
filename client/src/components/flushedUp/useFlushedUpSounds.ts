import { useRef, useEffect } from 'react';
import { sfx } from '@/lib/sounds';

export function useFlushedUpSounds() {
  const unlockedRef = useRef(false);

  useEffect(() => {
    const unlock = () => { unlockedRef.current = true; };
    document.addEventListener('click', unlock, { once: true, passive: true });
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  function guard(fn: () => void) {
    if (unlockedRef.current) {
      try { fn(); } catch { /* ignore audio errors */ }
    }
  }

  return {
    unlock() { unlockedRef.current = true; },

    cardDeal(delay = 0) {
      if (delay > 0) {
        setTimeout(() => guard(() => sfx.cardDeal()), delay);
      } else {
        guard(() => sfx.cardDeal());
      }
    },

    cardSelect() {
      guard(() => sfx.cardFlip());
    },

    cardDiscard() {
      guard(() => sfx.fold());
    },

    cardDraw(delay = 0) {
      if (delay > 0) {
        setTimeout(() => guard(() => sfx.cardDeal()), delay);
      } else {
        guard(() => sfx.cardDeal());
      }
    },

    chipClink() {
      guard(() => sfx.chipClink());
    },

    showdownFlip() {
      guard(() => {
        [0, 80, 160, 240].forEach(d => setTimeout(() => sfx.cardFlip(), d));
      });
    },

    win() {
      guard(() => sfx.win());
    },

    lose() {
      guard(() => sfx.lose());
    },

    check() {
      guard(() => sfx.check());
    },
  };
}

export type FlushedUpSounds = ReturnType<typeof useFlushedUpSounds>;
