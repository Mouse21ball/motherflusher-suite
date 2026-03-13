export default function Terms() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center px-4 pt-10 sm:pt-14 pb-16">
      <div className="w-full max-w-md">
        <a href="/" className="text-white/40 hover:text-white/70 text-sm font-mono transition-colors mb-6 inline-block" data-testid="link-terms-back">
          &larr; Back to Lobby
        </a>

        <h1 className="text-xl sm:text-2xl font-bold text-white mb-6" data-testid="text-terms-title">
          About This Beta
        </h1>

        <div className="space-y-5">
          <Section title="Early Beta">
            This app is in closed beta testing. Features, rules, and balancing may change between sessions as we iterate based on tester feedback.
          </Section>

          <Section title="No Real Money">
            All chips and balances are virtual and for entertainment purposes only. Nothing in this app involves real currency, wagering, or payouts.
          </Section>

          <Section title="Entertainment Only">
            Poker Table is a single-player game against bot opponents. It is designed purely for fun and to explore original poker variants.
          </Section>

          <Section title="Bugs May Occur">
            As an early build, you may encounter bugs, visual glitches, or unexpected behavior. Your chip balances are saved locally on your device and may reset during updates.
          </Section>

          <Section title="Feedback Welcome">
            If something feels off or you have ideas, we want to hear it. Your input directly shapes what gets built next.
          </Section>
        </div>

        <div className="mt-8 pt-6 border-t border-white/[0.06]">
          <p className="text-white/25 text-[10px] font-mono text-center">
            Poker Table — Closed Beta
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
      <h2 className="text-sm font-bold text-white/80 mb-1.5">{title}</h2>
      <p className="text-xs sm:text-sm text-white/50 leading-relaxed">{children}</p>
    </div>
  );
}
