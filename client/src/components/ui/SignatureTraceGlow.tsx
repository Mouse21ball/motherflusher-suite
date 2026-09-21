import type { CSSProperties, ReactNode } from 'react';
import './SignatureTraceGlow.css';

export type SignatureTraceGlowVariant = 'trace' | 'scoop' | 'pulse';

interface SignatureTraceGlowProps {
  children: ReactNode;
  variant?: SignatureTraceGlowVariant;
  durationMs?: number;
  className?: string;
  style?: CSSProperties;
}

/** A small, reusable perimeter trace for high-signal reward moments. */
export function SignatureTraceGlow({
  children,
  variant = 'trace',
  durationMs,
  className = '',
  style,
}: SignatureTraceGlowProps) {
  const duration = durationMs ?? (variant === 'scoop' ? 2000 : variant === 'pulse' ? 720 : 1600);
  return (
    <div
      className={`cgp-signature-trace cgp-signature-trace--${variant} ${className}`}
      style={{ ...style, '--cgp-trace-duration': `${duration}ms` } as CSSProperties}
    >
      <svg className="cgp-signature-trace__svg" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <rect className="cgp-signature-trace__rail" x="1.5" y="1.5" width="97" height="37" rx="10" pathLength="100" />
        {variant !== 'pulse' && (
          <rect className="cgp-signature-trace__comet" x="1.5" y="1.5" width="97" height="37" rx="10" pathLength="100" />
        )}
      </svg>
      <div className="cgp-signature-trace__content">{children}</div>
    </div>
  );
}