import type { HeroHandValidity } from '@shared/modes/heroHandValidity';

export function HeroHandValidityBadge({ validity, phase }: {
  validity: HeroHandValidity | null;
  phase: string;
}) {
  if (!validity) return null;
  // No box, no border, no background — just colored text (Detroit: no boxes)
  const color = validity.status === 'valid'
    ? 'rgb(0,240,180)'
    : validity.status === 'pending'
      ? 'rgb(253,224,71)'
      : 'rgb(254,150,150)';

  return (
    <div
      className="inline-flex items-center justify-center gap-1.5 px-2 py-1 text-xs sm:text-[13px] font-mono font-bold tracking-wide text-center"
      data-testid="text-hero-made-status"
      data-validity={validity.status}
      role="status"
      aria-live="polite"
      style={{ color }}
    >
      {validity.status === 'invalid' ? '✕ ' : ''}
      {validity.label}
      {validity.status === 'invalid' && ' · WILL AUTO-FOLD AT DECLARE'}
    </div>
  );
}
