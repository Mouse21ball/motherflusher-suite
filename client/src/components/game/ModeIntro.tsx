import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { SignatureTraceGlow } from "@/components/ui/SignatureTraceGlow";

interface ModeIntroProps {
  modeId: string;
  title: string;
  objective: string;
  steps: string[];
  accentColor: string;
  proTip?: string;
}

const STORAGE_KEY = "poker_table_intro_seen_v2";

function getSeenModes(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

function markSeen(modeId: string) {
  const seen = getSeenModes();
  if (!seen.includes(modeId)) { seen.push(modeId); localStorage.setItem(STORAGE_KEY, JSON.stringify(seen)); }
}

// ── Progress dots ─────────────────────────────────────────────────────────────
function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1.5 items-center justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width:  i === current ? 16 : 6,
            height: 6,
            backgroundColor: i === current ? '#C9A227' : 'rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </div>
  );
}

// ── Slide 0: What & Why ────────────────────────────────────────────────────────
function SlideObjective({ title, objective, accentColor }: { title: string; objective: string; accentColor: string }) {
  return (
    <div className="flex flex-col gap-4">
      <SignatureTraceGlow variant="pulse" durationMs={720}>
        <div className={`rounded-xl px-5 py-5 bg-gradient-to-br ${accentColor} flex flex-col gap-2`}>
          <h2 className="text-xl font-bold text-white/90 font-sans tracking-tight" data-testid="text-intro-title">{title}</h2>
          <p className="text-white/60 text-sm leading-relaxed">{objective}</p>
        </div>
      </SignatureTraceGlow>
    </div>
  );
}

// ── Slide 1: How to play ──────────────────────────────────────────────────────
function SlideHowTo({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] font-mono uppercase tracking-[0.22em] text-white/60 mb-1">How it works</p>
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black shrink-0 mt-0.5 font-mono border"
              style={{ background: 'rgba(201,162,39,0.12)', borderColor: 'rgba(201,162,39,0.25)', color: 'rgba(201,162,39,0.80)' }}
            >
              {i + 1}
            </span>
            <span className="text-sm text-white/60 leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Slide 2: Pro tip ──────────────────────────────────────────────────────────
function SlideProTip({ proTip, onDismiss }: { proTip: string; onDismiss: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl px-4 py-4 border border-[#C9A227]/20 bg-[#C9A227]/[0.04] flex gap-3 items-start">
        <span className="text-lg shrink-0">💡</span>
        <p className="text-sm text-white/60 leading-relaxed">{proTip}</p>
      </div>
      <Button
        onClick={onDismiss}
        className="w-full font-bold uppercase tracking-wider bg-[#C9A227] hover:bg-[#D4B44A] text-[#0B0B0D]"
        size="lg"
        data-testid="button-intro-start"
      >
        Let's Play
      </Button>
      <p className="text-center text-[12px] text-white/60 font-mono tracking-wider">
        Help opens the full rules; this intro will not reopen after dismissal
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ModeIntro({ modeId, title, objective, steps, accentColor, proTip }: ModeIntroProps) {
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(0);
  const totalPages = proTip ? 3 : 2;

  useEffect(() => {
    const seen = getSeenModes();
    if (!seen.includes(modeId)) setVisible(true);
  }, [modeId]);

  const dismiss = useCallback(() => {
    markSeen(modeId);
    setVisible(false);
  }, [modeId]);

  const next = useCallback(() => {
    if (page < totalPages - 1) setPage(p => p + 1);
    else dismiss();
  }, [page, totalPages, dismiss]);

  const prev = useCallback(() => {
    if (page > 0) setPage(p => p - 1);
  }, [page]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0B0D]/92 backdrop-blur-md p-4"
      role="dialog"
      aria-labelledby="mode-intro-title"
      data-testid="overlay-mode-intro"
    >
      <div className="w-full max-w-sm bg-[#141417] border border-white/[0.05] rounded-2xl shadow-2xl overflow-hidden anim-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <Dots total={totalPages} current={page} />
          <button
            onClick={dismiss}
            aria-label="Close"
            className="p-2 -mr-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-white/60 hover:text-white/60 transition-colors rounded-lg touch-manipulation"
            data-testid="button-intro-dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slide content */}
        <div className="px-5 pb-2 min-h-[220px]">
          {page === 0 && <SlideObjective title={title} objective={objective} accentColor={accentColor} />}
          {page === 1 && <SlideHowTo steps={steps} />}
          {page === 2 && proTip && <SlideProTip proTip={proTip} onDismiss={dismiss} />}
        </div>

        {/* Nav footer — only on non-final slides */}
        {page < totalPages - 1 && (
          <div className="px-5 pb-5 pt-3 flex gap-2">
            {page > 0 && (
              <Button
                variant="outline"
                size="lg"
                onClick={prev}
                className="flex-shrink-0 border-white/[0.06] text-white/60 hover:text-white/60 hover:bg-white/[0.03]"
                data-testid="button-intro-prev"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="lg"
              onClick={next}
              className="flex-1 font-bold uppercase tracking-wider bg-[#C9A227] hover:bg-[#D4B44A] text-[#0B0B0D] flex items-center justify-center gap-1.5"
              data-testid="button-intro-next"
            >
              {page === 0 ? 'How to Play' : 'Pro Tips'}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* On last slide when no proTip */}
        {page === totalPages - 1 && !proTip && (
          <div className="px-5 pb-5 pt-3">
            <Button
              onClick={dismiss}
              className="w-full font-bold uppercase tracking-wider bg-[#C9A227] hover:bg-[#D4B44A] text-[#0B0B0D]"
              size="lg"
              data-testid="button-intro-start"
            >
              Got it — Let's Play
            </Button>
            <p className="text-center text-[12px] text-white/60 mt-2.5 font-mono tracking-wider">
              Help opens the full rules; this intro will not reopen after dismissal
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mode intro content ────────────────────────────────────────────────────────

export const MODE_INTROS: Record<string, Omit<ModeIntroProps, "modeId">> = {
  badugi: {
    title: "Badugi",
    objective: "Build a valid Badugi: four cards that all have different ranks AND different suits. Lowest valid Badugi wins the Low pot, highest wins High.",
    steps: [
      "Receive 4 face-down cards",
      "Swap duplicates across 3 draw rounds (3, 2, then 1 card max)",
      "Declare High, Low, or Fold at the declare round",
      "One final betting round, then cards are revealed",
    ],
    proTip: "A-2-3-4 with all different suits is the perfect Low Badugi. Even a 3-card Badugi beats any 2-card hand — partial Badugi still qualifies.",
    accentColor: "from-emerald-800/60 to-[#141417]",
  },
  flushed_up: {
    title: "Flushed Up",
    objective: "Make a genuine five-card flush: all five cards must be the same suit. Only a flush can win, even when everyone else folds.",
    steps: [
      "Receive 5 cards, then bet in the first betting round",
      "Three draw rounds let you replace up to 3, then 2, then 1 card",
      "A betting round follows each draw, for 4 betting rounds total",
      "No declaration: at showdown, qualifying flushes compare by card ranks",
    ],
    proTip: "Keep cards of one suit and draw toward a complete five-card flush. If no one makes a flush, being the last player standing is not enough to win.",
    accentColor: "from-indigo-800/60 to-[#141417]",
  },
  ladyluck: {
    title: "Lady Luck",
    objective: "A shuffled full 52-card deck—including Queens—starts the race. Pick a suit, then watch the cards turn: the first suit seen 9 times wins.",
    steps: [
      "Choose one of the four unique suits (not a Queen card), starting with the seat left of the dealer",
      "Wager in 100-chip increments; room ranges are Pony 100–500, Thoroughbred 500–2,000, and Champion 2,000–5,000",
      "Cards flip one at a time; the first suit to appear 9 times wins",
      "Your main wager goes into the main pot, awarded to the winning suit after rake",
    ],
    proTip: "Optional side bets are separate from the main pot: a winning side bet pays 2.5× its stake gross, minus rake. You can skip side bets and play with your main wager only.",
    accentColor: "from-rose-800/60 to-[#141417]",
  },
  box_chevy: {
    title: "Box Chevy",
    objective: "5 hole cards + 5 shared community cards (always visible). Three draw rounds let you swap up to 3/2/1 hole cards. All 10 combined cards must have unique ranks to qualify. Declare HIGH, LOW, or SWING.",
    steps: [
      "5 hole cards dealt to you, 5 community cards face-up in the center",
      "Draw 1: discard up to 3 hole cards, get replacements",
      "Draw 2: discard up to 2, Draw 3: discard up to 1",
      "No pair across all 10 cards = made hand. Declare HIGH / LOW / SWING",
    ],
    proTip: "The community cards are visible from the start — use them to decide which hole cards to keep. If a hole card shares a rank with any community card, discard it immediately. Without a made hand (unique ranks across all 10), you're auto-folded.",
    accentColor: "from-blue-900/60 to-[#0a1628]",
  },
};
