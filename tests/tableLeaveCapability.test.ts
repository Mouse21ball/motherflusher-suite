import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const clientEngineFiles = [
  '../client/src/lib/poker/engine/useServerGame.ts',
  '../client/src/lib/poker/engine/useServerMode.ts',
];

describe('server-authoritative table leave capability guard', () => {
  it.each(clientEngineFiles)('%s checks backend support before sending an acknowledged leave', file => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const leaveBody = source.match(
      /const leaveAndSettle = useCallback\(\(\): Promise<void> => \{([\s\S]*?)\n  \}, \[\]\);/,
    )?.[1];

    expect(leaveBody, 'leaveAndSettle must remain explicit and inspectable').toBeDefined();
    expect(leaveBody).toContain("if (leaveStartRef.current) return leaveStartRef.current;");

    const capabilityCheck = leaveBody!.indexOf("await assertTableProtocolCapability('leave')");
    const socketSend = leaveBody!.indexOf('ws.send(JSON.stringify({');
    expect(capabilityCheck).toBeGreaterThanOrEqual(0);
    expect(socketSend).toBeGreaterThan(capabilityCheck);
    expect(leaveBody).toContain("throw new Error('Table connection is unavailable. Your balance was not confirmed.')");
  });
});