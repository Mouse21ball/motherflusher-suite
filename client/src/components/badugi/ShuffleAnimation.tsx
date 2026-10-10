import { motion } from 'framer-motion';
import '@/yard-reskin.css';

/**
 * Shuffle animation (Detroit 2026-10-10).
 * Shows at hand start: cards shuffling in center for 3 seconds,
 * then hero cards deal out. Retention pacing.
 */
export function ShuffleAnimation({ onComplete }: { onComplete?: () => void }) {
  return (
    <motion.div
      className="shuffle-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={() => {
        // Auto-dismiss after 3 seconds
        setTimeout(() => onComplete?.(), 3000);
      }}
    >
      <div className="shuffle-cards">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <motion.div
            key={i}
            className="shuffle-card"
            animate={{
              x: [0, (i % 2 === 0 ? 1 : -1) * (20 + i * 8), 0],
              y: [0, (i % 3 === 0 ? -1 : 1) * (15 + i * 5), 0],
              rotate: [0, (i % 2 === 0 ? 15 : -15), 0],
            }}
            transition={{
              duration: 1.5,
              repeat: 1, // 3 seconds total
              delay: i * 0.1,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      <div className="shuffle-text">SHUFFLING</div>
    </motion.div>
  );
}
