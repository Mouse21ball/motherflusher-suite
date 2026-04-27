/**
 * BrandBackground — reusable branded backdrop for DGM Entertainment screens.
 *
 * variant="legal"  → dark charcoal + subtle felt grid + gold top bar
 * variant="gate"   → deeper atmospheric dark + radial spotlight + suit symbols
 *
 * No external image assets required.
 * When animal artwork is available, drop an <img> into the `.dgm-animal-art`
 * placeholder divs rendered in each variant.
 */

interface BrandBackgroundProps {
  variant?: "legal" | "gate";
  children: React.ReactNode;
}

export function BrandBackground({ variant = "legal", children }: BrandBackgroundProps) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden" style={{ backgroundColor: "#05050B" }}>
      {variant === "legal" ? <LegalBg /> : <GateBg />}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ── Legal variant background layers ──────────────────────────────────────────
function LegalBg() {
  return (
    <>
      {/* Deep gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 60% at 50% 0%, rgba(240,184,41,0.045) 0%, transparent 65%), " +
            "linear-gradient(180deg, #07070E 0%, #0A0A15 40%, #07070E 100%)",
        }}
      />

      {/* Subtle felt-weave dot grid */}
      <div
        className="absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.55) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />

      {/* Gold top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(240,184,41,0.55) 30%, rgba(240,184,41,0.85) 50%, rgba(240,184,41,0.55) 70%, transparent 100%)",
        }}
      />

      {/* Gold bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(240,184,41,0.2) 30%, rgba(240,184,41,0.4) 50%, rgba(240,184,41,0.2) 70%, transparent 100%)",
        }}
      />

      {/* Top-left suit watermark — placeholder for animal art */}
      <div
        className="dgm-animal-art absolute top-10 -left-4 select-none pointer-events-none"
        aria-hidden="true"
        style={{ opacity: 0.035, fontSize: "120px", color: "#F0B829", transform: "rotate(-15deg)" }}
      >
        ♠
      </div>

      {/* Bottom-right suit watermark */}
      <div
        className="dgm-animal-art absolute bottom-10 -right-4 select-none pointer-events-none"
        aria-hidden="true"
        style={{ opacity: 0.035, fontSize: "120px", color: "#F0B829", transform: "rotate(12deg)" }}
      >
        ♦
      </div>

      {/* Center faint DGM watermark text */}
      <div
        className="absolute inset-0 flex items-center justify-center select-none pointer-events-none"
        aria-hidden="true"
      >
        <span
          className="font-bold font-sans tracking-[0.35em] uppercase"
          style={{ fontSize: "clamp(28px,8vw,72px)", color: "rgba(240,184,41,0.025)", whiteSpace: "nowrap" }}
        >
          DGM Entertainment
        </span>
      </div>

      {/* Vignette edges */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </>
  );
}

// ── Gate variant background layers ────────────────────────────────────────────
function GateBg() {
  const suits = [
    { symbol: "♠", top: "8%",  left: "5%",  size: 96,  rot: -18, op: 0.055 },
    { symbol: "♥", top: "6%",  right: "6%", size: 88,  rot: 14,  op: 0.05  },
    { symbol: "♣", bottom: "12%", left: "4%", size: 80,  rot: -8,  op: 0.04  },
    { symbol: "♦", bottom: "10%", right: "4%", size: 92,  rot: 20,  op: 0.05  },
    { symbol: "♠", top: "38%", left: "-2%", size: 56,  rot: 5,   op: 0.025 },
    { symbol: "♦", top: "42%", right: "-2%", size: 52,  rot: -10, op: 0.025 },
  ];

  return (
    <>
      {/* Deep black-green radial base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 100% 70% at 50% 50%, rgba(8,28,18,0.95) 0%, #03030A 65%)",
        }}
      />

      {/* Spotlight from above */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(240,184,41,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Very faint felt dots */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      {/* Gold top accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(240,184,41,0.4) 25%, rgba(240,184,41,0.75) 50%, rgba(240,184,41,0.4) 75%, transparent 100%)",
        }}
      />

      {/* Floating suit symbols — placeholders for animal artwork */}
      {suits.map((s, i) => (
        <div
          key={i}
          className="dgm-animal-art absolute select-none pointer-events-none"
          aria-hidden="true"
          style={{
            top: s.top,
            bottom: (s as any).bottom,
            left: s.left,
            right: (s as any).right,
            fontSize: s.size,
            color: "#F0B829",
            opacity: s.op,
            transform: `rotate(${s.rot}deg)`,
            lineHeight: 1,
          }}
        >
          {s.symbol}
        </div>
      ))}

      {/* Table oval hint — very faint */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          bottom: "-5%",
          width: "140%",
          height: "220px",
          background: "radial-gradient(ellipse at center, rgba(10,40,22,0.45) 0%, transparent 70%)",
          border: "1px solid rgba(240,184,41,0.04)",
          borderRadius: "50%",
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 40%, rgba(0,0,0,0.72) 100%)",
        }}
      />
    </>
  );
}
