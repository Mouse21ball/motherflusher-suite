import { motion } from 'framer-motion';

/**
 * PotStack — visual chip pile that grows in tiers with the pot amount.
 * Ported from the UNO prototype (Detroit 2026-10-13).
 * Like a meter: each tier adds chips. Capped so ridiculous amounts
 * don't render a mountain.
 */
export function PotStack({ amount }: { amount: number }) {
  // Tier thresholds → chip count. Cap at 14 chips + glow.
  const chips = amount <= 0 ? 0
    : amount < 500 ? 3
    : amount < 2000 ? 6
    : amount < 10000 ? 10
    : 14;
  const isMax = amount >= 10000;

  if (chips === 0) return null;

  const colors = ['#F59E0B', '#FBBF24', '#D97706', '#FCD34D'];

  return (
    <div
      className="relative flex items-end justify-center"
      style={{ height: 36, marginTop: 4, marginBottom: 2 }}
      aria-hidden="true"
    >
      {Array.from({ length: chips }).map((_, i) => {
        const layer = Math.floor(i / 4);
        const posInLayer = i % 4;
        const xOff = (posInLayer - 1.5) * 8 + (layer % 2 === 0 ? 2 : -2);
        return (
          <motion.div
            key={`potchip-${i}`}
            initial={{ scale: 0, y: -16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22, delay: i * 0.025 }}
            className="absolute rounded-full"
            style={{
              width: 24,
              height: 24,
              left: `calc(50% - 12px + ${xOff}px)`,
              bottom: `${4 + layer * 7}px`,
              background: `radial-gradient(circle at 35% 30%, ${colors[i % 4]}, #92400E)`,
              border: '2px dashed rgba(255,255,255,0.5)',
              boxShadow: isMax
                ? '0 0 14px rgba(245,158,11,0.9), 0 2px 5px rgba(0,0,0,0.5)'
                : '0 2px 5px rgba(0,0,0,0.5)',
              zIndex: i,
            }}
          />
        );
      })}
      {isMax && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.35) 0%, transparent 70%)' }}
        />
      )}
    </div>
  );
}
