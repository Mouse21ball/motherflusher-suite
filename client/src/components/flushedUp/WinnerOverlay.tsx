import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useEffect } from 'react';
import { ChipBurst } from './ChipBurst';

interface WinnerOverlayProps {
  show: boolean;
  winnerName: string;
  potAmount: number;
  isHeroWinner: boolean;
  onDone?: () => void;
}

export function WinnerOverlay({ show, winnerName, potAmount, isHeroWinner, onDone }: WinnerOverlayProps) {
  const shakeControls = useAnimation();

  useEffect(() => {
    if (!show) return;
    const doShake = async () => {
      await shakeControls.start({
        x: [0, -6, 8, -8, 6, -4, 4, -2, 0],
        transition: { duration: 0.55, ease: 'easeOut', times: [0, 0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.85, 1] },
      });
    };
    const t = setTimeout(doShake, 200);
    return () => clearTimeout(t);
  }, [show, shakeControls]);

  useEffect(() => {
    if (!show) return;
    if (onDone) {
      const t = setTimeout(onDone, 5500);
      return () => clearTimeout(t);
    }
  }, [show, onDone]);

  return (
    <motion.div animate={shakeControls} style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none' }}>
      <AnimatePresence>
        {show && (
          <>
            <motion.div
              key="table-glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.35, 0.15, 0.3, 0] }}
              transition={{ duration: 2.5, times: [0, 0.15, 0.4, 0.6, 1] }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at center, rgba(201,162,39,0.5) 0%, transparent 70%)',
                borderRadius: '50%',
              }}
            />

            <motion.div
              key="banner"
              initial={{ opacity: 0, scale: 0.5, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -30 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.1 }}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
                zIndex: 60,
              }}
            >
              <div style={{
                background: 'linear-gradient(135deg, rgba(12,10,8,0.96) 0%, rgba(18,14,6,0.96) 100%)',
                border: '1.5px solid rgba(201,162,39,0.7)',
                borderRadius: '16px',
                padding: '20px 36px',
                boxShadow: '0 0 40px rgba(201,162,39,0.4), 0 8px 32px rgba(0,0,0,0.8)',
                minWidth: '220px',
              }}>
                <motion.div
                  animate={{ opacity: [1, 0.7, 1] }}
                  transition={{ duration: 1.2, repeat: 2, ease: 'easeInOut' }}
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.2em',
                    color: 'rgba(201,162,39,0.8)',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}
                >
                  {isHeroWinner ? '★ Winner ★' : 'Winner'}
                </motion.div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#FFFFFF',
                  fontFamily: 'monospace',
                  marginBottom: '6px',
                  letterSpacing: '0.05em',
                }}>
                  {winnerName}
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#C9A227',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  letterSpacing: '0.1em',
                }}>
                  +{potAmount.toLocaleString()} chips
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {show && isHeroWinner && (
        <ChipBurst active={show} originX={0.5} originY={0.45} />
      )}
    </motion.div>
  );
}
