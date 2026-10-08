import { useEffect, useState } from 'react';
import { useServerBadugi } from '@/lib/poker/engine/useServerGame';
import { FEATURES } from '@/lib/featureFlags';
import { generateTableCode, saveRecentTable } from '@/lib/tableSession';
import { trackModePlay } from '@/lib/analytics';
import { BadugiFullPage } from '@/components/badugi/BadugiFullPage';

function useBadugiTableId() {
  const [tableId] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('t')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(fromUrl)) return fromUrl;
    const code = generateTableCode();
    window.history.replaceState(null, '', `/badugi?t=${code}`);
    return code;
  });
  return tableId;
}

function BadugiServerGame() {
  const tableId = useBadugiTableId();
  useEffect(() => {
    trackModePlay('badugi');
    saveRecentTable(tableId);
  }, [tableId]);

  const {
    state,
    handleAction,
    actionError,
    requestRebuy,
    myId,
    role,
    sessionStats,
    lastWsAt,
    lastWsType,
    hostId,
    tableSettings,
    isClubTable,
    sendHostAction,
    kickedByHost,
    leaveAndSettle,
  } = useServerBadugi(tableId);

  return (
    <BadugiFullPage
      state={state}
      handleAction={handleAction}
      actionError={actionError}
      requestRebuy={requestRebuy}
      myId={myId}
      modeId="badugi"
      tableId={tableId}
      role={role}
      sessionStats={sessionStats}
      lastWsAt={lastWsAt}
      lastWsType={lastWsType}
      hostId={hostId}
      tableSettings={tableSettings}
      isClubTable={isClubTable}
      sendHostAction={sendHostAction}
      kickedByHost={kickedByHost}
      leaveAndSettle={leaveAndSettle}
    />
  );
}

export function UnifiedGamePage() {
  if (!FEATURES.SERVER_AUTHORITATIVE_BADUGI && import.meta.env.VITE_BADUGI_ALPHA !== 'true') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-white/60 font-mono text-sm">Server mode required. Set VITE_BADUGI_ALPHA=true</p>
      </div>
    );
  }
  return <BadugiServerGame />;
}
