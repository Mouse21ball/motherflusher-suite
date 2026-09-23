import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ladyLuckSource = readFileSync(
  new URL('../client/src/pages/LadyLuck.tsx', import.meta.url),
  'utf8',
);

describe('Lady Luck platform-aware API routing', () => {
  it('routes table creation through apiUrl before authenticated fetch', () => {
    expect(ladyLuckSource).toContain(
      "apiFetch(apiUrl('/api/ladyluck/tables'), {",
    );
    expect(ladyLuckSource).not.toContain(
      "apiFetch('/api/ladyluck/tables', {",
    );
  });

  it('routes the WebSocket ticket request through apiUrl', () => {
    expect(ladyLuckSource).toContain(
      "apiFetch(apiUrl('/api/auth/ws-ticket'))",
    );
    expect(ladyLuckSource).not.toContain(
      "apiFetch('/api/auth/ws-ticket')",
    );
  });
});