import { useCallback, useState } from 'react';
import {
  getSelectedBackground,
  setSelectedBackgroundId,
  type TableBackground,
} from './tableBackgrounds';

/**
 * useTableBackground — the player's chosen table backdrop.
 * Persisted to localStorage; server-side equipped state can replace this later.
 */
export function useTableBackground(): {
  background: TableBackground;
  selectBackground: (id: string) => void;
} {
  const [background, setBackground] = useState<TableBackground>(() => getSelectedBackground());

  const selectBackground = useCallback((id: string) => {
    setSelectedBackgroundId(id);
    setBackground(getSelectedBackground());
  }, []);

  return { background, selectBackground };
}
