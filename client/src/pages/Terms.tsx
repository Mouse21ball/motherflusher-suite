export default function Terms() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center px-4 pt-10 sm:pt-14 pb-16">
      <div className="w-full max-w-md">
        <a href="/" className="text-white/40 hover:text-white/70 text-sm font-mono transition-colors mb-6 inline-block" data-testid="link-terms-back">
          ← Back to Lobby
        </a>

        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-white" data-testid="text-terms-title">
            Terms &amp; Disclosures
          </h1>
          <p className="text-[11px] font-mono text-white/30 mt-1">
            Chain Gang Poker · DGM Entertainment · Last updated April 2026
          </p>
        </div>

        <div className="space-y-4">
          <Section title="Virtual Chips — No Cash Value">
            Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn. All chips, balances, and rewards in this app are virtual game mechanics with no monetary value outside the game. They cannot be transferred or exchanged for any real-world goods or services.
          </Section>

          <Section title="Entertainment Only — No Gambling">
            Chain Gang Poker (DGM Entertainment) is a free-to-play social card game for entertainment purposes only. This app does not constitute gambling under any jurisdiction. There are no bets, wagers, or stakes involving real currency. No purchase is necessary to play. No prizes, withdrawals, or redemptions of any kind are offered or implied.
          </Section>

          <Section title="Age Requirement">
            You must be 13 years of age or older to use this app. By using Chain Gang Poker, you confirm that you meet this age requirement. If you are under 13, you may not use this app.
          </Section>

          <Section title="Guest &amp; Account Play">
            You may play as a guest without creating an account. Guest progress is saved on your device only and may be lost if you clear your browser data. Creating an account lets you save your chip balance and stats across devices. Accounts are identified by email address and password. Your virtual chip balance has no cash value regardless of account type.
          </Section>

          <Section title="Account Deletion">
            You may delete your account at any time from the Profile page. Deleting your account permanently removes your profile, email address, chip balance, and all statistics from our servers. This action cannot be undone. Guest data stored locally on your device will also be cleared when you delete from the Profile page.
          </Section>

          <Section title="Fair Play">
            You agree to use Chain Gang Poker for lawful, personal entertainment only. The following are prohibited: using automated bots or scripts to play (beyond the in-game bot system), attempting to exploit bugs or glitches to gain unfair advantages, harassing other players, and creating multiple accounts to circumvent any restrictions. We reserve the right to remove accounts that violate these rules.
          </Section>

          <Section title="Multiplayer &amp; Bots">
            Tables support up to 5 real players. When real players are unavailable, bot opponents fill seats automatically so the game continues. Bots are disclosed and do not represent real users.
          </Section>

          <Section title="App Changes">
            Chain Gang Poker is an evolving app. Features, game rules, chip balances, and this agreement may change over time. We will make reasonable efforts to notify users of material changes. Continued use of the app after changes constitutes acceptance of the updated terms.
          </Section>

          <Section title="Disclaimer of Warranties">
            This app is provided as-is for entertainment. We make no warranties regarding uptime, data retention, or uninterrupted access. Virtual chip balances may be reset or adjusted in the event of technical issues. We are not liable for any loss of virtual currency or progress.
          </Section>

          <Section title="Contact">
            Questions or concerns? Contact us at{' '}
            <span className="text-white/60 font-mono">support@dgmentertainment.com</span>
          </Section>
        </div>

        <div className="mt-8 pt-6 border-t border-white/[0.06] space-y-3">
          <div className="flex items-center justify-center gap-4">
            <a href="/privacy" className="text-[10px] font-mono text-white/25 hover:text-white/50 transition-colors underline" data-testid="link-terms-privacy">
              Privacy Policy
            </a>
            <span className="text-white/10 text-[10px]">·</span>
            <a href="/" className="text-[10px] font-mono text-white/25 hover:text-white/50 transition-colors">
              Back to Lobby
            </a>
          </div>
          <p className="text-white/20 text-[10px] font-mono text-center">
            DGM Entertainment · Chain Gang Poker · Virtual chips only · No cash value · 13+
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
