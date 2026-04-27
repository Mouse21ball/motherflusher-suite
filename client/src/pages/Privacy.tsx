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
            Chain Gang Poker · DGM Entertainment · Last updated April 2026
          </p>
        </div>

        <div className="space-y-4">
          <Section title="What Data We Collect">
            We collect different data depending on how you use the app:{'\n\n'}
            <strong>Guest players:</strong> We generate a random device ID and store it in your browser's local storage. No email or personal information is required or collected for guest play. Your chip balance, game stats, and XP are stored locally on your device only.{'\n\n'}
            <strong>Account holders:</strong> When you create an account, we store your email address, display name, and a hashed (non-reversible) password on our servers. We also store your virtual chip balance, hands played, win/loss statistics, and game progress.
          </Section>

          <Section title="Gameplay Statistics">
            For all players, we store gameplay statistics including hands played, hands won, chip balance history, XP, rank, achievements, and daily streak information. For guest players, this is stored locally on your device. For account holders, this is stored on our servers and synced across devices.
          </Section>

          <Section title="Device & App Diagnostics">
            We may collect anonymous, aggregate diagnostic data including app crash reports, error rates, and performance metrics to improve stability. This data does not identify individual players and is not linked to your account or device ID.
          </Section>

          <Section title="Server Logs & Network Data">
            Our servers automatically record standard server logs including IP addresses, request timestamps, and connection events. These logs are used for security monitoring, abuse prevention, and debugging. Logs are retained for a limited period and are not used for advertising or sold to third parties.
          </Section>

          <Section title="Virtual Chips & No Purchases">
            Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn. This app contains no in-app purchases at this time. No payment data of any kind is collected or stored.
          </Section>

          <Section title="How We Use Your Data">
            We use your data solely to operate the game: restoring your chip balance and progress when you log in on a new device, tracking achievements, and improving gameplay. We do not sell, rent, or share your personal information with third parties. We do not use your data for advertising.
          </Section>

          <Section title="Analytics">
            We may collect anonymous, aggregate usage data (session counts, mode popularity, feature usage) to understand how the game is used and improve it. This aggregate data cannot be used to identify individual players. We do not use third-party advertising SDKs.
          </Section>

          <Section title="Account Deletion">
            You may delete your account at any time from the Profile page. Upon deletion, your email address, display name, password hash, chip balance, and all associated gameplay statistics are permanently removed from our servers. Local device data (progression, daily rewards, guest stats) is also cleared during the deletion process. Deletion is immediate and irreversible. If you need help, contact us at support@dgmentertainment.com.
          </Section>

          <Section title="Children">
            This app requires users to be 13 years of age or older. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information, please contact us at support@dgmentertainment.com and we will remove it promptly.
          </Section>

          <Section title="Security">
            Passwords are stored using scrypt, a one-way cryptographic hash function. We never store plain-text passwords. Data in transit is protected using HTTPS encryption. We take reasonable steps to protect data but cannot guarantee absolute security.
          </Section>

          <Section title="Data Retention">
            Guest data is stored locally on your device and persists until you clear your browser data or delete through the Profile page. Account data is stored on our servers for the life of your account. You may request deletion at any time via the Profile page or by contacting support.
          </Section>

          <Section title="Contact">
            For privacy questions, data deletion requests, or concerns:{'\n'}
            Email: <span className="text-white/60 font-mono">support@dgmentertainment.com</span>{'\n\n'}
            We take privacy seriously and will respond within a reasonable time.
          </Section>
        </div>

        <div className="mt-8 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-center gap-4 text-[10px] font-mono mb-2" style={{ color: 'rgba(255,255,255,0.18)' }}>
            <a href="/terms" className="hover:text-white/40 transition-colors underline" data-testid="link-privacy-terms">Terms &amp; Disclosures</a>
            <span style={{ color: 'rgba(255,255,255,0.08)' }}>·</span>
            <a href="/" className="hover:text-white/40 transition-colors">Back to Lobby</a>
          </div>
          <p className="text-[10px] font-mono text-center" style={{ color: 'rgba(255,255,255,0.15)' }}>
            DGM Entertainment · Chain Gang Poker · Virtual chips only · No cash value · 13+
          </p>
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
      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-line" style={{ color: 'rgba(255,255,255,0.48)' }}>{children}</p>
    </div>
  );
}
