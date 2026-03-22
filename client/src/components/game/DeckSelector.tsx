import { useState } from 'react';
import { Layers, Lock, Check } from 'lucide-react';
import { DECK_THEMES, useDeckTheme, type DeckTheme } from '@/lib/deckTheme';
import { getProgression, getLevelInfo } from '@/lib/progression';
import { cn } from '@/lib/utils';

interface DeckSelectorProps {
  className?: string;
}

export function DeckSelector({ className }: DeckSelectorProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useDeckTheme();

  const progression = getProgression();
  const { level } = getLevelInfo(progression.xp);

  const handleSelect = (id: DeckTheme, unlockLevel: number) => {
    if (level < unlockLevel) return;
    setTheme(id);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-2.5 py-2 min-h-[36px] rounded-lg border border-white/[0.04] text-white/30 hover:text-white/55 hover:border-white/[0.08] hover:bg-white/[0.02] transition-all duration-200 touch-manipulation"
        aria-label="Change deck"
        data-testid="button-deck-selector"
      >
        <Layers className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Deck</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl bg-[#141417] border border-white/[0.06] shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.05]">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/25 font-bold">Card Back Style</p>
            </div>
            <div className="p-2 space-y-1">
              {DECK_THEMES.map(t => {
                const isLocked = level < t.unlockLevel;
                const isActive = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleSelect(t.id, t.unlockLevel)}
                    disabled={isLocked}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 text-left",
                      isLocked
                        ? "opacity-40 cursor-not-allowed"
                        : isActive
                          ? "bg-white/[0.06] border border-white/[0.08]"
                          : "hover:bg-white/[0.04] border border-transparent"
                    )}
                    data-testid={`button-deck-${t.id}`}
                  >
                    <div
                      className={cn(
                        "w-8 h-10 rounded shrink-0 border-2 relative overflow-hidden flex items-center justify-center",
                        t.preview
                      )}
                    >
                      {isLocked && (
                        <Lock className="w-3 h-3" style={{ color: t.accentColor, opacity: 0.6 }} />
                      )}
                      {isActive && !isLocked && (
                        <Check className="w-3 h-3" style={{ color: t.accentColor }} />
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-white/70 leading-none">{t.name}</span>
                        {isActive && <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: t.accentColor }}>Active</span>}
                      </div>
                      <span className="text-[10px] text-white/30 leading-none">{t.tagline}</span>
                      {isLocked && (
                        <span className="text-[9px] font-mono" style={{ color: t.accentColor, opacity: 0.6 }}>
                          Unlocks at Lv {t.unlockLevel}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-3 py-2 border-t border-white/[0.05]">
              <p className="text-[9px] text-white/20 font-mono leading-relaxed">
                Your current level: <span className="text-white/40">Lv {level}</span>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
