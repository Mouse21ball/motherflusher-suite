/**
 * ChainMark — THE CGP brand chain mark (P4, 2026-11-08).
 *
 * One vector, used everywhere the brand needs a chain: logo tiles, header
 * ornaments, kickers, the felt print. Extracted from P1's TableFelt
 * center-felt mark so the felt and the UI carry the identical chain.
 * Replaces the ⛓ OS emoji, which rendered as a different stock glyph on
 * every platform. Purely presentational — no state reads it.
 */
interface ChainMarkProps {
  /** Rendered width in px; height follows the 64×36 viewBox. */
  width?: number;
  /** Stroke color (any CSS color). Defaults to brand gold. */
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function ChainMark({
  width = 46,
  color = 'rgba(240,184,41,0.90)',
  strokeWidth = 5,
  style,
  className,
}: ChainMarkProps) {
  return (
    <svg
      width={width}
      height={Math.round((width * 36) / 64)}
      viewBox="0 0 64 36"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      <rect x="4" y="9" width="32" height="18" rx="9" transform="rotate(-28 20 18)" stroke={color} strokeWidth={strokeWidth} />
      <rect x="28" y="9" width="32" height="18" rx="9" transform="rotate(-28 44 18)" stroke={color} strokeWidth={strokeWidth} />
    </svg>
  );
}
