import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BustOutModal } from '@/components/game/BustOutModal';
import { BuyInSlider } from '@/components/game/BuyInSlider';
import { ServerProfileProvider, useServerProfile } from '@/lib/useServerProfile';

function RewardWallet() {
  const { profile, refetch } = useServerProfile();
  return <>
    <output data-testid="ad-wallet-balance" data-profile-ready={!!profile} data-profile-name={profile?.displayName}>{profile?.chipBalance ?? 0}</output>
    <button data-testid="ad-refresh-profile" onClick={() => { void refetch(); }}>Refresh profile</button>
  </>;
}

function BustOutRebuyBrowserHarness() {
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState('');
  const [submissions, setSubmissions] = useState(0);
  const params = new URLSearchParams(window.location.search);
  const outcome = params.get('outcome') ?? 'success';
  const tier = Number(params.get('tier') ?? 1);
  const sliderOnly = params.get('slider') === '1';
  const [bankroll, setBankroll] = useState(Number(params.get('balance') ?? 10000));
  const [bigBlind, setBigBlind] = useState(Number(params.get('blind') ?? 50));

  const completeRebuy = async (kind: 'free' | 'reserve' | 'borrow', amount?: number) => {
    setSubmissions(count => count + 1);
    await new Promise(resolve => window.setTimeout(resolve, 450));
    if (outcome === 'fail') throw new Error(`${kind} rebuy was rejected; no chips were credited.`);
    setResult(`${kind}:${amount ?? 1000}`);
    setOpen(false);
  };

  return (
    <div>
      {params.get('ad') === '1' && <RewardWallet />}
      <output data-testid="rebuy-result">{result}</output>
      <output data-testid="rebuy-submissions">{submissions}</output>
      <button type="button" data-testid="harness-bankroll-decrease" onClick={() => setBankroll(2000)}>Set bankroll to 2,000</button>
      <button type="button" data-testid="harness-stakes-change" onClick={() => setBigBlind(250)}>Change blind to 250</button>
      {sliderOnly ? (
        <BuyInSlider
          tableId="QA"
          modeId="badugi"
          chipBalance={bankroll}
          currentStack={Number(params.get('stack') ?? 0)}
          bigBlind={bigBlind}
          purpose="rebuy"
          onConfirm={amount => completeRebuy('reserve', amount)}
          onCancel={() => {}}
        />
      ) : (
        <BustOutModal
          open={open}
          lifetimeBusts={tier === 1 ? 1 : 0}
          sessionBusts={tier === 2 || tier === 3 ? 2 : 0}
          hasNeverPurchased={tier === 1 || tier === 3}
          onStarterPack={() => completeRebuy('free')}
          onRebuy={amount => completeRebuy('reserve', amount)}
          onBorrowChips={() => completeRebuy('borrow', 1000)}
          onLeaveTable={() => {}}
          onSpectate={() => {}}
          tableId="QA"
          modeId="badugi"
          bankrollAvailable={bankroll}
          bigBlind={bigBlind}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  new URLSearchParams(window.location.search).get('ad') === '1'
    ? <ServerProfileProvider><BustOutRebuyBrowserHarness /></ServerProfileProvider>
    : <BustOutRebuyBrowserHarness />,
);