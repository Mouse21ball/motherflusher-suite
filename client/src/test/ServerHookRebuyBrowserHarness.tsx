import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GameState } from '@shared/gameTypes';
import { BustOutModal } from '@/components/game/BustOutModal';
import { useServerBadugi } from '@/lib/poker/engine/useServerGame';
import { useServerMode } from '@/lib/poker/engine/useServerMode';
import { useServerProfile, ServerProfileProvider } from '@/lib/useServerProfile';

type RebuyKind = 'free' | 'reserve' | 'borrow';
interface HookApi {
  state: GameState;
  myId: string;
  requestRebuy: (kind: RebuyKind, amount?: number) => Promise<void>;
}

function RebuyModalHarness({ modeId, hook }: { modeId: string; hook: HookApi }) {
  const { profile } = useServerProfile();
  const [dismissed, setDismissed] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const player = hook.state.players.find(item => item.id === hook.myId);

  const requestRebuy = async (kind: RebuyKind, amount?: number) => {
    setRequesting(true);
    try {
      await hook.requestRebuy(kind, amount);
      setDismissed(true);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <main>
      <output data-testid="hook-mode">{modeId}</output>
      <output data-testid="hook-seat">{hook.myId}</output>
      <output data-testid="hook-stack">{player?.chips ?? 'waiting'}</output>
      <output data-testid="hook-wallet">{profile?.chipBalance ?? 'waiting'}</output>
      <button data-testid="hook-double-submit" onClick={() => {
        void hook.requestRebuy('free').catch(() => {});
        void hook.requestRebuy('free').catch(() => {});
      }}>Submit twice in one tick</button>
      <BustOutModal
        open={!dismissed && !!player && (player.chips === 0 || requesting)}
        lifetimeBusts={1}
        sessionBusts={0}
        hasNeverPurchased
        onStarterPack={() => requestRebuy('free')}
        onRebuy={amount => requestRebuy('reserve', amount)}
        onBorrowChips={() => requestRebuy('borrow', 1000)}
        onLeaveTable={() => {}}
        onSpectate={() => {}}
        tableId="QA"
        modeId={modeId}
        bankrollAvailable={profile?.chipBalance ?? 30_000}
        bigBlind={50}
      />
    </main>
  );
}

function BadugiHookHarness() {
  const hook = useServerBadugi('QA');
  return <RebuyModalHarness modeId="badugi" hook={hook} />;
}

function GenericModeHookHarness() {
  const hook = useServerMode('QA', 'dead7');
  return <RebuyModalHarness modeId="dead7" hook={hook} />;
}

function ServerHookRebuyBrowserHarness() {
  const modeId = new URLSearchParams(window.location.search).get('mode') ?? 'badugi';
  return modeId === 'dead7' ? <GenericModeHookHarness /> : <BadugiHookHarness />;
}

createRoot(document.getElementById('root')!).render(
  <ServerProfileProvider>
    <ServerHookRebuyBrowserHarness />
  </ServerProfileProvider>,
);