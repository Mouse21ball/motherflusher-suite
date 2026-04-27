/**
 * BrandBackground — full-screen branded backdrop using DGM Entertainment artwork.
 *
 * variant="legal"   → legal-bg.png   (fox/wolf crew — Terms & Privacy)
 * variant="welcome" → agegate-bg.png (tiger/bear/rabbit crew — age gate)
 * variant="splash"  → splash-bg.png  (tiger/leopard — loading/signature)
 *
 * Each variant applies a dark overlay so overlaid text is always readable.
 */

import legalBg   from "@/assets/images/legal-bg.png";
import welcomeBg from "@/assets/images/agegate-bg.png";
import splashBg  from "@/assets/images/splash-bg.png";

const BG_MAP = {
  legal:   legalBg,
  welcome: welcomeBg,
  splash:  splashBg,
};

const OVERLAY_MAP = {
  legal:   "rgba(0,0,0,0.70)",
  welcome: "rgba(0,0,0,0.55)",
  splash:  "rgba(0,0,0,0.50)",
};

interface BrandBackgroundProps {
  variant?: "legal" | "welcome" | "splash";
  children: React.ReactNode;
}

export function BrandBackground({ variant = "legal", children }: BrandBackgroundProps) {
  const bgImage   = BG_MAP[variant];
  const overlayBg = OVERLAY_MAP[variant];

  return (
    <div className="relative min-h-[100dvh] overflow-hidden" style={{ backgroundColor: "#05050B" }}>

      {/* ── Artwork layer ──────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${bgImage})` }}
        aria-hidden="true"
      />

      {/* ── Dark overlay for text readability ─────────────────────────────── */}
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background: [
            `linear-gradient(180deg, ${overlayBg} 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.75) 100%)`,
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(240,184,41,0.05) 0%, transparent 65%)",
          ].join(", "),
        }}
      />

      {/* ── Gold top accent bar ───────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(240,184,41,0.60) 25%, rgba(240,184,41,0.95) 50%, rgba(240,184,41,0.60) 75%, transparent 100%)",
        }}
      />

      {/* ── Pink bottom accent ────────────────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,20,147,0.50) 30%, rgba(255,20,147,0.85) 50%, rgba(255,20,147,0.50) 70%, transparent 100%)",
        }}
      />

      {/* ── Vignette edges ────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 40%, rgba(0,0,0,0.70) 100%)",
        }}
      />

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
