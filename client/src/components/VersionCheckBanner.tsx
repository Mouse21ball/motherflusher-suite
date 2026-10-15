import { motion, AnimatePresence } from 'framer-motion';
import { useVersionCheck } from '@/lib/useVersionCheck';

/**
 * VersionCheckBanner — "new version available" prompt.
 * Detroit 2026-10-15: Shows when the server has a newer build than the
 * client's loaded version. Non-intrusive top banner, tap to refresh.
 */
export function VersionCheckBanner() {
  const { updateAvailable, refresh } = useVersionCheck();

  return (
    <AnimatePresence>
      {updateAvailable && (
        <motion.button
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          onClick={refresh}
          data-testid="button-version-refresh"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            padding: '12px 16px',
            background: 'linear-gradient(135deg, #C9A227, #8a6a00)',
            color: '#0a0800',
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.08em',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span>⟳</span>
          <span>NEW VERSION AVAILABLE — TAP TO UPDATE</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
