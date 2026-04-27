import { LegalPageLayout, LegalSection } from "@/components/LegalPageLayout";

export default function Privacy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      backHref="/"
      backLabel="← Back to Lobby"
      testIdTitle="text-privacy-title"
      testIdBack="link-privacy-back"
    >
      <LegalSection title="What Data We Collect">
        We collect different data depending on how you use the app:{"\n\n"}
        <strong>Guest players:</strong> We generate a random device ID and store it in your browser's local storage. No email or personal information is required or collected for guest play. Your chip balance, game stats, and XP are stored locally on your device only.{"\n\n"}
        <strong>Account holders:</strong> When you create an account, we store your email address, display name, and a hashed (non-reversible) password on our servers. We also store your virtual chip balance, hands played, win/loss statistics, and game progress.
      </LegalSection>

      <LegalSection title="Gameplay Statistics">
        For all players, we store gameplay statistics including hands played, hands won, chip balance history, XP, rank, achievements, and daily streak information. For guest players, this is stored locally on your device. For account holders, this is stored on our servers and synced across devices.
      </LegalSection>

      <LegalSection title="Device & App Diagnostics">
        We may collect anonymous, aggregate diagnostic data including app crash reports, error rates, and performance metrics to improve stability. This data does not identify individual players and is not linked to your account or device ID.
      </LegalSection>

      <LegalSection title="Server Logs & Network Data">
        Our servers automatically record standard server logs including IP addresses, request timestamps, and connection events. These logs are used for security monitoring, abuse prevention, and debugging. Logs are retained for a limited period and are not used for advertising or sold to third parties.
      </LegalSection>

      <LegalSection title="Virtual Chips & No Purchases">
        Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn. This app contains no in-app purchases at this time. No payment data of any kind is collected or stored.
      </LegalSection>

      <LegalSection title="How We Use Your Data">
        We use your data solely to operate the game: restoring your chip balance and progress when you log in on a new device, tracking achievements, and improving gameplay. We do not sell, rent, or share your personal information with third parties. We do not use your data for advertising.
      </LegalSection>

      <LegalSection title="Analytics">
        We may collect anonymous, aggregate usage data (session counts, mode popularity, feature usage) to understand how the game is used and improve it. This aggregate data cannot be used to identify individual players. We do not use third-party advertising SDKs.
      </LegalSection>

      <LegalSection title="Account Deletion">
        You may delete your account at any time from the Profile page. Upon deletion, your email address, display name, password hash, chip balance, and all associated gameplay statistics are permanently removed from our servers. Local device data (progression, daily rewards, guest stats) is also cleared during the deletion process. Deletion is immediate and irreversible. If you need help, contact us at support@dgmentertainment.com.
      </LegalSection>

      <LegalSection title="Children">
        This app requires users to be 13 years of age or older. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information, please contact us at support@dgmentertainment.com and we will remove it promptly.
      </LegalSection>

      <LegalSection title="Security">
        Passwords are stored using scrypt, a one-way cryptographic hash function. We never store plain-text passwords. Data in transit is protected using HTTPS encryption. We take reasonable steps to protect data but cannot guarantee absolute security.
      </LegalSection>

      <LegalSection title="Data Retention">
        Guest data is stored locally on your device and persists until you clear your browser data or delete through the Profile page. Account data is stored on our servers for the life of your account. You may request deletion at any time via the Profile page or by contacting support.
      </LegalSection>

      <LegalSection title="Contact">
        For privacy questions, data deletion requests, or concerns:{"\n"}
        Email:{" "}
        <span style={{ color: "rgba(255,255,255,0.60)", fontFamily: "monospace" }}>
          support@dgmentertainment.com
        </span>
        {"\n\n"}We take privacy seriously and will respond within a reasonable time.
      </LegalSection>
    </LegalPageLayout>
  );
}
