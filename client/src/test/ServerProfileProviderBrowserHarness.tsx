import { createRoot } from 'react-dom/client';
import { ServerProfileProvider, useServerProfile } from '@/lib/useServerProfile';

function Consumer({ name }: { name: string }) {
  const { profile, loading, refetch } = useServerProfile();
  return (
    <section data-testid={`consumer-${name}`}>
      <span data-testid={`profile-${name}`}>{profile?.displayName ?? 'none'}</span>
      <span data-testid={`loading-${name}`}>{String(loading)}</span>
      <button data-testid={`refetch-${name}`} onClick={refetch}>Refetch</button>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <ServerProfileProvider>
    <Consumer name="first" />
    <Consumer name="second" />
  </ServerProfileProvider>,
);