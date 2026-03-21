import { useEffect, useState } from 'react';
import { getLevelInfo, getRankForLevel } from '@/lib/progression';

interface XPToastProps {
  xpGained: number;
  leveledUp?: boolean;
  newLevel?: number;
  newAchievementName?: string;
  onDone: () => void;
}

export function XPToast({ xpGained, leveledUp, newLevel, newAchievementName, onDone }: XPToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, leveledUp ? 3000 : 2000);
    return () => clearTimeout(t);
  }, [leveledUp, onDone]);

  const rank = newLevel ? getRankForLevel(newLevel) : null;

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1.5 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      aria-live="polite"
    >
      {leveledUp && newLevel && rank && (
        <div
          className="px-4 py-2 rounded-xl text-sm font-bold font-sans shadow-xl border"
          style={{ color: rank.color, backgroundColor: rank.bg, borderColor: rank.border }}
          data-testid="toast-level-up"
        >
          🎉 Level Up! You're now Level {newLevel} — {rank.name}
        </div>
      )}
      {newAchievementName && (
        <div className="px-4 py-2 rounded-xl text-xs font-bold text-[#C9A227] bg-[#C9A227]/10 border border-[#C9A227]/25 shadow-xl">
          🏆 Achievement: {newAchievementName}
        </div>
      )}
      <div
        className="px-3 py-1.5 rounded-lg text-xs font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-lg"
        data-testid="toast-xp"
      >
        +{xpGained} XP
      </div>
    </div>
  );
}

// Hook to manage XP toasts from game results
export interface XPToastState {
  id: string;
  xpGained: number;
  leveledUp: boolean;
  newLevel: number;
  achievementName?: string;
}

export function useXPToast() {
  const [toast, setToast] = useState<XPToastState | null>(null);

  const showXP = (state: Omit<XPToastState, 'id'>) => {
    setToast({ ...state, id: Date.now().toString() });
  };

  const dismiss = () => setToast(null);

  return { toast, showXP, dismiss };
}
