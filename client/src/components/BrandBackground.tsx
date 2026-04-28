/**
 * BrandBackground — full-screen branded backdrop using DGM Entertainment artwork.
 *
 * variant="welcome" → agegate-bg.png  (tiger/bear/rabbit crew — age gate)
 * variant="legal"   → legal-bg.png   (fox/wolf crew — Terms & Privacy)
 * variant="splash"  → splash-bg.png  (tiger/leopard — loading/signature)
 */

const agegateUrl = new URL('../assets/images/agegate-bg.png', import.meta.url).href;
const legalUrl   = new URL('../assets/images/legal-bg.png',   import.meta.url).href;
const splashUrl  = new URL('../assets/images/splash-bg.png',  import.meta.url).href;

const BG_MAP = {
  welcome: agegateUrl,
  legal:   legalUrl,
  splash:  splashUrl,
};

interface BrandBackgroundProps {
  variant?: "legal" | "welcome" | "splash";
  children: React.ReactNode;
}

export function BrandBackground({ variant = "legal", children }: BrandBackgroundProps) {
  const bgUrl = BG_MAP[variant];

  const bgStyle: React.CSSProperties = variant === "legal"
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.80) 100%), url(${bgUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
      }
    : {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.45) 100%), url(${bgUrl})`,
        backgroundSize: "105%",
        backgroundPosition: "center 65%",
        backgroundRepeat: "no-repeat",
      };

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden"
      style={{ backgroundColor: "#05050B", ...bgStyle }}
    >
      {/* ── Gold top accent bar ───────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] z-10"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(240,184,41,0.60) 25%, rgba(240,184,41,0.95) 50%, rgba(240,184,41,0.60) 75%, transparent 100%)",
        }}
      />

      {/* ── Pink bottom accent ────────────────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] z-10"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,20,147,0.50) 30%, rgba(255,20,147,0.85) 50%, rgba(255,20,147,0.50) 70%, transparent 100%)",
        }}
      />

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
