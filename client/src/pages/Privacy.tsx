import { useLocation } from 'wouter';

export default function Privacy() {
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center px-4 pt-10 sm:pt-14 pb-16"
      style={{ background: 'linear-gradient(180deg, #05050A 0%, #0A0A12 50%, #05050A 100%)' }}
    >
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate('/')}
          className="text-white/40 hover:text-white/70 text-sm font-mono transition-colors mb-6 inline-block"
          data-testid="link-privacy-back"
        >
          ← Back to Lobby
        </button>

        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold font-sans mb-1" style={{ color: 'rgba(255,255,255,0.90)' }} data-testid="text-privacy-title">
            Privacy Policy
          </h1>
          <p className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Chain Gang Poker · DGM Poker · Last updated April 2026
          </p>
        </div>

        <div className="space-y-4">
          <Section title="What We Collect">
            When you create an account we store your email address, display name, and a hashed (non-reversible) password. We also store your virtual chip balance, hands played, and win/loss statistics. Guest players are identified by a randomly generated device ID stored in your browser — no email is required.
          </Section>

          <Section title="How We Use It">
            We use your information solely to run the game: saving your chip balance, tracking stats and achievements, and restoring your progress when you log in on a new device. We do not sell, rent, or share your personal information with third parties.
          </Section>

          <Section title="Virtual Chips & No Purchases">
            Chain Gang Poker is a free social card game. All chips are virtual and have no monetary value. The app contains no in-app purchases at this time. No payment data of any kind is collected or stored.
          </Section>

          <Section title="Analytics">
            We collect anonymous, aggregate usage data (session counts, mode popularity, error rates) to improve the game. This data cannot be used to identify individual players. We do not use third-party advertising SDKs.
          </Section>

          <Section title="Data Retention & Deletion">
            You may request deletion of your account and all associated data at any time. To delete your account, go to your Profile page and tap "Delete Account." Your display name, email, chip balance, and statistics will be permanently and irreversibly removed within 24 hours.
          </Section>

          <Section title="Children">
            This app is rated 17+ and is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us and we will remove it promptly.
          </Section>

          <Section title="Security">
            Passwords are stored using scrypt, a one-way cryptographic hash. We never store plain-text passwords. Data is transmitted over encrypted HTTPS connections.
          </Section>

          <Section title="Contact">
            Questions about this policy? Reach us through the feedback option in the app. We take privacy seriously and will respond within a reasonable time.
          </Section>
        </div>

        <div className="mt-8 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-center gap-4 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.18)' }}>
            <a href="/terms" className="hover:text-white/40 transition-colors">Terms &amp; Disclosures</a>
            <span style={{ color: 'rgba(255,255,255,0.08)' }}>·</span>
            <span>DGM Poker · Chain Gang Poker</span>
            <span style={{ color: 'rgba(255,255,255,0.08)' }}>·</span>
            <span>Virtual chips only</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <h2 className="text-sm font-bold font-sans mb-1.5" style={{ color: 'rgba(255,255,255,0.80)' }}>{title}</h2>
      <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.48)' }}>{children}</p>
    </div>
  );
}
