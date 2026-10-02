import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BustOutModal } from '@/components/game/BustOutModal';

function BustOutRebuyBrowserHarness() {
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState('');
  const [submissions, setSubmissions] = useState(0);
  const outcome = new URLSearchParams(window.location.search).get('outcome') ?? 'success';

  const completeRebuy = async (kind: 'free' | 'reserve' | 'borrow', amount?: number) => {
    setSubmissions(count => count + 1);
    await new Promise(resolve => window.setTimeout(resolve, 450));
    if (outcome === 'fail') throw new Error(`${kind} rebuy was rejected; no chips were credited.`);
    setResult(`${kind}:${amount ?? 1000}`);
    setOpen(false);
  };

  return (
    <div>
      <output data-testid="rebuy-result">{result}</output>
      <output data-testid="rebuy-submissions">{submissions}</output>
      <BustOutModal
        open={open}
        lifetimeBusts={1}
        sessionBusts={0}
        hasNeverPurchased
        onStarterPack={() => completeRebuy('free')}
        onRebuy={amount => completeRebuy('reserve', amount)}
        onBorrowChips={() => completeRebuy('borrow', 1000)}
        onLeaveTable={() => {}}
        onSpectate={() => {}}
        tableId="QA"
        modeId="badugi"
        bankrollAvailable={30000}
        bigBlind={50}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<BustOutRebuyBrowserHarness />);