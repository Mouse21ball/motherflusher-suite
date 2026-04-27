/**
 * LegalPageLayout — branded wrapper for /terms and /privacy.
 * Composes BrandBackground + DGM header badge + content + SignatureFooter.
 */

import { BrandBackground } from "./BrandBackground";
import { SignatureFooter } from "./SignatureFooter";

interface LegalPageLayoutProps {
  title: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
  testIdTitle?: string;
  testIdBack?: string;
}

export function LegalPageLayout({
  title,
  backHref = "/",
  backLabel = "← Back to Lobby",
  children,
  testIdTitle,
  testIdBack,
}: LegalPageLayoutProps) {
  return (
    <BrandBackground variant="legal">
      <div className="flex flex-col items-center px-4 pb-16" style={{ paddingTop: '120px' }}>
        <div className="w-full max-w-md">

          {/* DGM Entertainment header badge */}
          <div className="flex flex-col items-center mb-8 pt-2">
            <div
              className="flex items-center gap-2 px-4 py-1.5 rounded-full mb-3"
              style={{
                background: "rgba(240,184,41,0.07)",
                border: "1px solid rgba(240,184,41,0.18)",
              }}
            >
              <span style={{ color: "rgba(240,184,41,0.7)", fontSize: "10px" }}>◆</span>
              <span
                className="font-mono uppercase tracking-[0.22em] font-semibold"
                style={{ fontSize: "9px", color: "rgba(240,184,41,0.70)" }}
              >
                DGM Entertainment
              </span>
              <span style={{ color: "rgba(240,184,41,0.7)", fontSize: "10px" }}>◆</span>
            </div>
            <p
              className="font-mono text-center"
              style={{ fontSize: "9px", color: "rgba(255,255,255,0.20)", letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              Official Legal Information
            </p>
          </div>

          {/* Page header */}
          <div className="mb-2">
            <a
              href={backHref}
              className="font-mono transition-colors inline-block mb-5"
              style={{ fontSize: "12px", color: "rgba(255,255,255,0.32)" }}
              data-testid={testIdBack}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.60)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.32)")}
            >
              {backLabel}
            </a>

            <h1
              className="text-xl sm:text-2xl font-bold font-sans mb-1"
              style={{ color: "rgba(255,255,255,0.92)" }}
              data-testid={testIdTitle}
            >
              {title}
            </h1>

            {/* Gold underline accent */}
            <div
              className="mt-2 mb-1 h-[1.5px] w-16 rounded-full"
              style={{ background: "linear-gradient(90deg, rgba(240,184,41,0.70), transparent)" }}
            />

            <p className="font-mono mt-2" style={{ fontSize: "10px", color: "rgba(255,255,255,0.22)" }}>
              Chain Gang Poker · DGM Entertainment · Last updated April 2026
            </p>
          </div>

          {/* Content */}
          <div className="mt-6 space-y-3">
            {children}
          </div>

          <SignatureFooter />
        </div>
      </div>
    </BrandBackground>
  );
}

// ── Shared Section card ───────────────────────────────────────────────────────
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.055)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: "rgba(240,184,41,0.55)", fontSize: "8px" }}>◆</span>
        <h2
          className="text-sm font-bold font-sans"
          style={{ color: "rgba(255,255,255,0.82)" }}
        >
          {title}
        </h2>
      </div>
      <p
        className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-line"
        style={{ color: "rgba(255,255,255,0.48)", paddingLeft: "14px" }}
      >
        {children}
      </p>
    </div>
  );
}
