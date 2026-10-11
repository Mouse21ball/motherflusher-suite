import type { HeroHandValidity } from '@shared/modes/heroHandValidity';

export function HeroHandValidityBadge({ validity, phase }: {
  validity: HeroHandValidity | null;
  phase: string;
}) {
  if (!validity) return null;
  // No box, no border, no background — polished text with icon (Detroit: no boxes)
  const color = validity.status === 'valid'
    ? 'rgb(0,240,180)'
    : validity.status === 'pending'
      ? 'rgb(253,224,71)'
      : 'rgb(254,150,150)';

  const icon = validity.status === 'valid' ? '✓ ' : validity.status === 'pending' ? '◷ ' : '✕ ';

  return (
    <div
      className="flex flex-col items-center justify-center px-2 py-1 text-center"
      data-testid="text-hero-made-status"
      data-validity={validity.status}
      role="status"
      aria-live="polite"
    >
      <div
        className="text-xs sm:text-[13px] font-mono font-bold tracking-[0.14em]"
        style={{ color, textShadow: `0 0 12px ${color}` }}
      >
        {icon}{validity.label}
      </div>
      {validity.status === 'invalid' && (
        <div
          className="text-[10px] font-mono tracking-[0.18em] mt-0.5 opacity-80"
          style={{ color }}
        >
          WILL AUTO-FOLD AT DECLARE
        </div>
      )}
    </div>
  );
}
