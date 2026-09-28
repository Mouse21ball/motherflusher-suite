import type { HeroHandValidity } from '@shared/modes/heroHandValidity';

export function HeroHandValidityBadge({ validity, phase }: {
  validity: HeroHandValidity | null;
  phase: string;
}) {
  if (!validity) return null;
  const colors = validity.status === 'valid'
    ? { background: 'rgba(0,200,150,0.22)', border: 'rgba(0,220,165,0.70)', color: 'rgb(0,240,180)' }
    : validity.status === 'pending'
      ? { background: 'rgba(250,204,21,0.16)', border: 'rgba(250,204,21,0.60)', color: 'rgb(253,224,71)' }
      : { background: 'rgba(220,38,38,0.20)', border: 'rgba(248,113,113,0.75)', color: 'rgb(254,150,150)' };

  return (
    <div
      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-[13px] font-mono font-bold tracking-wide border text-center"
      data-testid="text-hero-made-status"
      data-validity={validity.status}
      style={{
        backgroundColor: colors.background,
        borderColor: colors.border,
        color: colors.color,
        boxShadow: validity.status === 'valid' ? '0 0 14px rgba(0,200,150,0.35)' : '0 0 10px rgba(0,0,0,0.2)',
      }}
    >
      {validity.label}
      {validity.status === 'invalid' && phase === 'DECLARE' && ' · AUTO-FOLD AT DECLARE'}
    </div>
  );
}