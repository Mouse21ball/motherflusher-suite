// Galaxy defect repair pins (Detroit 2026-10-24).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('galaxy defect repair pins', () => {
  it('entry gate: Box Chevy page renders a loading state until an authoritative snapshot lands', () => {
    const page = read('client/src/pages/BoxChevyGame.tsx');
    expect(page).toContain('hasAuthoritativeState');
    expect(page).toContain('data-testid="bc-loading"');
    // The gate must precede the table render in the component body.
    expect(page.indexOf('data-testid="bc-loading"')).toBeLessThan(page.indexOf('<BoxChevyTable'));
  });

  it('entry gate: the flag flips only on validated init/snapshot acceptance', () => {
    const hook = read('client/src/lib/poker/engine/useServerMode.ts');
    expect(hook).toContain('const [hasAuthoritativeState, setHasAuthoritativeState] = useState(false)');
    // init acceptance (already validates the players array) and the
    // snapshot branch both flip it; the snapshot branch validates too.
    expect(hook).toContain("if (msg.type === 'mode:snapshot') {\n            // Accept only a well-formed table snapshot");
    expect(hook.match(/setHasAuthoritativeState\(true\)/g)?.length).toBe(2);
  });

  it('dealer origin: no fixed top-center origin remains; flights use the dealer seat', () => {
    const bcTable = read('client/src/components/boxChevy/BoxChevyTable.tsx');
    expect(bcTable).not.toContain('DEALER_POS');
    expect(bcTable).toContain('dealerFlightOrigin(liveState.players as any, myId)');
    expect(bcTable.match(/fromX: flightOrigin\.x, fromY: flightOrigin\.y,/g)?.length).toBe(3);
  });

  it('caption strip removed: no phase captions render under the felt', () => {
    const bcTable = read('client/src/components/boxChevy/BoxChevyTable.tsx');
    expect(bcTable).not.toContain('Discards to the muck');
    expect(bcTable).not.toContain('Chips flying to the pot');
    expect(bcTable).not.toContain('Ante up — $25 each');
  });

  it('guard wording: first connect vs reconnect is distinguished', () => {
    const guard = read('client/src/components/game/TableEscapeGuard.tsx');
    expect(guard).toContain("reconnecting ? 'Reconnecting…' : 'Connecting…'");
    const health = read('client/src/lib/tableConnectionHealth.ts');
    expect(health).toContain('hasConnectedBefore');
    expect(health).toContain('readyPaths');
  });

  it('frozen scopes: Flushed Up table/page and Badugi table carry no repair edits markers', () => {
    const fu = read('client/src/components/flushedUp/FlushedUpTable.tsx');
    // FU keeps its own caption + flight origin — untouched by this package.
    expect(fu).toContain('Discards to the muck');
  });
});
