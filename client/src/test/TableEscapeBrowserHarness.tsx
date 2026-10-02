import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocation } from 'wouter';
import { TableEscapeGuard } from '@/components/game/TableEscapeGuard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { reportTableConnection } from '@/lib/tableConnectionHealth';
import '../index.css';
function Broken() { throw new Error('Broken table snapshot'); return null; }
function Harness() {
  const [, navigate] = useLocation();
  const [broken, setBroken] = useState(false);
  return <>
    <button onClick={() => { navigate('/badugi'); reportTableConnection('connecting'); }}>Start connecting</button>
    <button onClick={() => reportTableConnection('connecting')}>Retry connection</button>
    <button onClick={() => reportTableConnection('ready')}>Receive init</button>
    <button onClick={() => reportTableConnection('failed')}>Reject join</button>
    <button onClick={() => setBroken(true)}>Break table render</button>
    <ErrorBoundary>{broken ? <Broken /> : <p>Table loading</p>}</ErrorBoundary>
    <TableEscapeGuard />
  </>;
}
createRoot(document.getElementById('root')!).render(<Harness />);