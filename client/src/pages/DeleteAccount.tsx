import { LegalPageLayout, LegalSection } from "@/components/LegalPageLayout";

export default function DeleteAccount() {
  return (
    <LegalPageLayout
      title="Delete Your Chain Gang Poker Account"
      backHref="/"
      backLabel="← Back to Lobby"
      testIdTitle="text-delete-account-title"
      testIdBack="link-delete-account-back"
    >
      <LegalSection title="">
        DGM Entertainment respects your right to delete your account and all associated data.
      </LegalSection>

      <LegalSection title="How to Delete Your Account from Inside the App">
        1. Open Chain Gang Poker{"\n"}
        2. Go to <strong>Profile</strong>{"\n"}
        3. Tap <strong>Delete Account</strong> at the bottom{"\n"}
        4. Confirm the deletion{"\n\n"}
        Deletion is immediate and irreversible.
      </LegalSection>

      <LegalSection title="How to Request Deletion If You Can't Access the App">
        Email{" "}
        <span style={{ color: "rgba(255,255,255,0.60)", fontFamily: "monospace" }}>
          dgm.entertainment2026@gmail.com
        </span>
        {" "}with the subject line <strong>"Account Deletion Request"</strong> and include the email address associated with your Chain Gang Poker account.{"\n\n"}
        We will process the request within <strong>30 days</strong>.
      </LegalSection>

      <LegalSection title="What Gets Deleted">
        When your account is deleted, the following data is permanently removed:{"\n\n"}
        • Your account credentials and email address{"\n"}
        • Your display name and profile information{"\n"}
        • Your gameplay history, hand history, and chip balance{"\n"}
        • Your cosmetics inventory and equipped items{"\n"}
        • Your crew membership and chat messages{"\n"}
        • Your block list and any reports you have filed
      </LegalSection>

      <LegalSection title="What Is Retained">
        The following data may be retained after account deletion:{"\n\n"}
        • <strong>Anonymized analytics data</strong> — aggregate usage statistics with no personally identifiable information{"\n"}
        • <strong>Purchase records</strong> — retained for tax and accounting purposes per legal requirements, typically 7 years{"\n"}
        • <strong>Aggregated fraud-prevention logs</strong> — personally identifiable data is removed; only anonymized signals are kept
      </LegalSection>

      <LegalSection title="Timeline">
        Account deletion is processed within <strong>30 days</strong> of request. Some data may be retained in encrypted backups for up to <strong>90 days</strong> due to standard backup retention cycles, after which it is permanently purged.
      </LegalSection>

      <LegalSection title="Contact">
        For questions about data deletion or privacy:{"\n"}
        Email:{" "}
        <span style={{ color: "rgba(255,255,255,0.60)", fontFamily: "monospace" }}>
          dgm.entertainment2026@gmail.com
        </span>
      </LegalSection>
    </LegalPageLayout>
  );
}
