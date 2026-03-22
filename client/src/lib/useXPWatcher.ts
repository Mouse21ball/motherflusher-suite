import { useEffect, useRef, useState } from 'react';
import { getProgression, getLevelInfo, getRankForLevel, ACHIEVEMENTS } from './progression';
import type { XPToastState } from '@/components/XPToast';

// ─── useXPWatcher ─────────────────────────────────────────────────────────────
// Polls localStorage progression every second.
// When XP increases, fires an XPToast with the delta, level-up info, and any
// newly unlocked achievement.
//
// Psychology: immediate positive feedback after every hand played; the
// level-up moment is a powerful "ding" reward loop borrowed from MMORPGs.

const POLL_MS = 800;

export function useXPWatcher() {
  const prevXPRef = useRef<number | null>(null);
  const prevAchievementsRef = useRef<string[]>([]);
  const [toast, setToast] = useState<XPToastState | null>(null);

  useEffect(() => {
    function poll() {
      const prog = getProgression();
      const currentXP = prog.xp;
      const currentAchievements = prog.unlockedAchievements ?? [];

      if (prevXPRef.current === null) {
        // First poll — just initialize
        prevXPRef.current = currentXP;
        prevAchievementsRef.current = [...currentAchievements];
        return;
      }

      const xpGained = currentXP - prevXPRef.current;

      // Find newly unlocked achievements
      const newAchievements = currentAchievements.filter(
        id => !prevAchievementsRef.current.includes(id)
      );
      const newAchievementName = newAchievements.length > 0
        ? ACHIEVEMENTS.find(a => a.id === newAchievements[0])?.name
        : undefined;

      if (xpGained > 0) {
        const oldLevel = getLevelInfo(prevXPRef.current).level;
        const newLevelInfo = getLevelInfo(currentXP);
        const newLevel = newLevelInfo.level;
        const leveledUp = newLevel > oldLevel;

        setToast({
          id: Date.now().toString(),
          xpGained,
          leveledUp,
          newLevel,
          achievementName: newAchievementName,
        });
      } else if (newAchievementName) {
        // Achievement unlocked without XP (edge case)
        setToast({
          id: Date.now().toString(),
          xpGained: 0,
          leveledUp: false,
          newLevel: getLevelInfo(currentXP).level,
          achievementName: newAchievementName,
        });
      }

      prevXPRef.current = currentXP;
      prevAchievementsRef.current = [...currentAchievements];
    }

    const interval = setInterval(poll, POLL_MS);
    poll(); // run immediately on mount
    return () => clearInterval(interval);
  }, []);

  const dismiss = () => setToast(null);

  return { toast, dismiss };
}
