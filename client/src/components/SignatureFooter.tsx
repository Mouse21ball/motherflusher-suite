/**
 * SignatureFooter — DGM Entertainment official signature block.
 * Used at the bottom of /terms, /privacy, and optionally splash screens.
 */

interface SignatureFooterProps {
  showLinks?: boolean;
}

export function SignatureFooter({ showLinks = true }: SignatureFooterProps) {
  return (
    <div className="mt-10 pt-6 flex flex-col items-center gap-4" style={{ borderTop: "1px solid rgba(240,184,41,0.12)" }}>
      {/* DGM diamond logo mark */}
      <div className="flex flex-col items-center gap-2">
        <div
          className="flex items-center gap-2"
          style={{ color: "rgba(240,184,41,0.75)" }}
        >
          <span style={{ fontSize: "11px", letterSpacing: "0.05em" }}>◆</span>
          <span
            className="font-bold font-sans tracking-widest uppercase"
            style={{ fontSize: "11px", color: "rgba(240,184,41,0.75)", letterSpacing: "0.18em" }}
          >
            DGM Entertainment
          </span>
          <span style={{ fontSize: "11px", letterSpacing: "0.05em" }}>◆</span>
        </div>

        <p className="text-[10px] font-mono text-center" style={{ color: "rgba(255,255,255,0.28)" }}>
          Official publisher of Chain Gang Poker
        </p>

        <p
          className="text-[10px] font-mono italic text-center"
          style={{ color: "rgba(240,184,41,0.28)" }}
        >
          Built for the table. Backed by DGM Entertainment.
        </p>
      </div>

      {/* Nav links */}
      {showLinks && (
        <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.20)" }}>
          <a href="/terms" className="hover:text-white/45 transition-colors underline underline-offset-2" data-testid="link-footer-terms">
            Terms
          </a>
          <span style={{ color: "rgba(255,255,255,0.10)" }}>·</span>
          <a href="/privacy" className="hover:text-white/45 transition-colors underline underline-offset-2" data-testid="link-footer-privacy">
            Privacy Policy
          </a>
          <span style={{ color: "rgba(255,255,255,0.10)" }}>·</span>
          <a href="/" className="hover:text-white/45 transition-colors">
            Back to Lobby
          </a>
        </div>
      )}

      {/* Copyright */}
      <p className="text-[9px] font-mono text-center" style={{ color: "rgba(255,255,255,0.13)" }}>
        © 2026 DGM Entertainment LLC. All rights reserved.{"\n"}
        Virtual chips only · No cash value · 13+
      </p>
    </div>
  );
}
