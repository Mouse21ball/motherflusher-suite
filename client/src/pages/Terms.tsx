import { LegalPageLayout, LegalSection } from "@/components/LegalPageLayout";

export default function Terms() {
  return (
    <LegalPageLayout
      title="Terms & Disclosures"
      backHref="/"
      backLabel="← Back to Lobby"
      testIdTitle="text-terms-title"
      testIdBack="link-terms-back"
    >
      <LegalSection title="Virtual Chips — No Cash Value">
        Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn. All chips, balances, and rewards in this app are virtual game mechanics with no monetary value outside the game. They cannot be transferred or exchanged for any real-world goods or services.
      </LegalSection>

      <LegalSection title="Entertainment Only — No Gambling">
        Chain Gang Poker (DGM Entertainment) is a free-to-play social card game for entertainment purposes only. This app does not constitute gambling under any jurisdiction. There are no bets, wagers, or stakes involving real currency. No purchase is necessary to play. No prizes, withdrawals, or redemptions of any kind are offered or implied.
      </LegalSection>

      <LegalSection title="Age Requirement">
        You must be 13 years of age or older to use this app. By using Chain Gang Poker, you confirm that you meet this age requirement. If you are under 13, you may not use this app.
      </LegalSection>

      <LegalSection title="Guest & Account Play">
        You may play as a guest without creating an account. Guest progress is saved on your device only and may be lost if you clear your browser data. Creating an account lets you save your chip balance and stats across devices. Accounts are identified by email address and password. Your virtual chip balance has no cash value regardless of account type.
      </LegalSection>

      <LegalSection title="Account Deletion">
        You may delete your account at any time from the Profile page. Deleting your account permanently removes your profile, email address, chip balance, and all statistics from our servers. This action cannot be undone. Guest data stored locally on your device will also be cleared when you delete from the Profile page.
      </LegalSection>

      <LegalSection title="Fair Play">
        You agree to use Chain Gang Poker for lawful, personal entertainment only. The following are prohibited: using automated bots or scripts to play (beyond the in-game bot system), attempting to exploit bugs or glitches to gain unfair advantages, harassing other players, and creating multiple accounts to circumvent any restrictions. We reserve the right to remove accounts that violate these rules.
      </LegalSection>

      <LegalSection title="Multiplayer & Bots">
        Tables support up to 5 real players. When real players are unavailable, bot opponents fill seats automatically so the game continues. Bots are disclosed and do not represent real users.
      </LegalSection>

      <LegalSection title="App Changes">
        Chain Gang Poker is an evolving app. Features, game rules, chip balances, and this agreement may change over time. We will make reasonable efforts to notify users of material changes. Continued use of the app after changes constitutes acceptance of the updated terms.
      </LegalSection>

      <LegalSection title="Disclaimer of Warranties">
        This app is provided as-is for entertainment. We make no warranties regarding uptime, data retention, or uninterrupted access. Virtual chip balances may be reset or adjusted in the event of technical issues. We are not liable for any loss of virtual currency or progress.
      </LegalSection>

      <LegalSection title="Contact">
        Questions or concerns? Contact us at{" "}
        <span style={{ color: "rgba(255,255,255,0.60)", fontFamily: "monospace" }}>
          support@dgmentertainment.com
        </span>
      </LegalSection>
    </LegalPageLayout>
  );
}
