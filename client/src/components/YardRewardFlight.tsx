import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Crown } from 'lucide-react';

export function YardRewardFlight({ amount }: { amount: number }) {
  const reduced = useReducedMotion();
  const target = document.querySelector('[data-yard-balance="stripes"]')?.getBoundingClientRect();
  if (!target || reduced) return null;
  return createPortal(
    <motion.span className="yard-reward-flight" aria-hidden="true"
      initial={{ left: window.innerWidth / 2, top: window.innerHeight / 2, opacity: 0, scale: .8 }}
      animate={{ left: target.left + target.width / 2, top: target.top + target.height / 2, opacity: [0, 1, 1, 0], scale: [.8, 1.2, .5] }}
      transition={{ duration: .9, ease: 'easeInOut' }}>
      <Crown size={22} fill="currentColor" />+{amount}
    </motion.span>, document.body,
  );
}
