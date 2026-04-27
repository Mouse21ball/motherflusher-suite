export default function Terms() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center px-4 pt-10 sm:pt-14 pb-16">
      <div className="w-full max-w-md">
        <a href="/" className="text-white/40 hover:text-white/70 text-sm font-mono transition-colors mb-6 inline-block" data-testid="link-terms-back">
          &larr; Back to Lobby
        </a>

        <h1 className="text-xl sm:text-2xl font-bold text-white mb-6" data-testid="text-terms-title">
          Terms &amp; Disclosures
        </h1>

        <div className="space-y-5">
          <Section title="Virtual Chips — No Cash Value">
            All chips, balances, and rewards in this app are virtual and have no monetary value. They cannot be withdrawn, transferred, redeemed for cash, or exchanged for any real-world goods or services. This app involves no real-money wagering, gambling, or payouts of any kind.
          </Section>

          <Section title="Entertainment Only">
            Chain Gang Poker (DGM Poker) is a free-to-play social card game for entertainment purposes only. No purchase is necessary to play. Chip balances exist solely within the game and carry no financial value outside it.
          </Section>

          <Section title="Multiplayer &amp; Bots">
            Tables support up to 5 real players. When real players are unavailable, bot opponents fill seats automatically so the game continues without delay.
          </Section>

          <Section title="No Gambling">
            This app does not constitute gambling under any jurisdiction. There are no bets, wagers, or stakes involving real currency. Virtual chips are a game mechanic only.
          </Section>

          <Section title="Account Play">
            Creating an account lets you save your progress, chip balance, and stats across devices. Accounts use email and password. Your virtual chip balance has no cash value regardless of account type. Guest play is available without an account — progress is saved on your device only.
          </Section>

          <Section title="Feedback Welcome">
            If something feels off or you have ideas, we want to hear it. Your input directly shapes what gets built next.
          </Section>
        </div>

        <div className="mt-8 pt-6 border-t border-white/[0.06] space-y-3">
          <div className="flex items-center justify-center gap-4">
            <a href="/privacy" className="text-[10px] font-mono text-white/25 hover:text-white/50 transition-colors underline">
              Privacy Policy
            </a>
            <span className="text-white/10 text-[10px]">·</span>
            <a href="/" className="text-[10px] font-mono text-white/25 hover:text-white/50 transition-colors">
              Back to Lobby
            </a>
          </div>
          <p className="text-white/20 text-[10px] font-mono text-center">
            DGM Poker · Chain Gang Poker · Virtual chips only · No cash value · 17+
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
