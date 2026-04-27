/**
 * BrandBackground — full-screen branded backdrop using DGM Entertainment artwork.
 *
 * variant="legal"   → dgm-legal-bg.png   (fox/wolf characters — legal pages)
 * variant="welcome" → dgm-agegate-bg.png (tiger/bear at poker table — age gate)
 * variant="splash"  → dgm-splash-bg.png  (tiger/leopard glamour — loading/splash)
 *
 * Each variant applies a dark overlay so overlaid text is always readable.
 * Animal art placeholder class `.dgm-animal-art` is retained on the fallback
 * suit symbols — they become invisible when a real image loads but serve as
 * graceful CSS-only fallback if the image fails.
 */

import legalBg   from "@/assets/images/dgm-legal-bg.png";
import welcomeBg from "@/assets/images/dgm-agegate-bg.png";
import splashBg  from "@/assets/images/dgm-splash-bg.png";

const BG_MAP = {
  legal:   legalBg,
  welcome: welcomeBg,
  splash:  splashBg,
};

const OVERLAY_MAP = {
  legal:   "rgba(4,4,10,0.72)",
  welcome: "rgba(3,3,10,0.62)",
  splash:  "rgba(3,3,10,0.55)",
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

      {/* ── Atmospheric overlay (readability) ─────────────────────────────── */}
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background: [
            `linear-gradient(180deg, ${overlayBg} 0%, rgba(4,4,12,0.55) 45%, rgba(4,4,12,0.80) 100%)`,
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(240,184,41,0.06) 0%, transparent 65%)",
          ].join(", "),
        }}
      />

      {/* ── Gold top accent bar ───────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(240,184,41,0.55) 25%, rgba(240,184,41,0.88) 50%, rgba(240,184,41,0.55) 75%, transparent 100%)",
        }}
      />

      {/* ── Pink bottom accent ────────────────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px]"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,80,160,0.30) 30%, rgba(255,80,160,0.55) 50%, rgba(255,80,160,0.30) 70%, transparent 100%)",
        }}
      />

      {/* ── Vignette edges ────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 45%, rgba(0,0,0,0.65) 100%)",
        }}
      />

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
