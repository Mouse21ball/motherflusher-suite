import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { SpectatorBanner } from '../components/game/SpectatorBanner';
import { isForfeitConfirmationRequired } from '../components/game/spectatorExit';

describe('spectator clarity', () => {
  it('SSR renders the exact watch-only message and a real shop link', () => {
    const markup = renderToStaticMarkup(createElement(Router, {
      hook: () => ['/table', () => {}] as [string, (path: string) => void],
      children: createElement(SpectatorBanner),
    }));
    expect(markup).toContain('Watching only — get chips to play.');
    expect(markup).toContain('href="/shop"');
    expect(markup).toContain('Get chips');
  });

  it('does not require forfeit confirmation for a spectator leaving mid-hand', () => {
    expect(isForfeitConfirmationRequired(true, true)).toBe(false);
    expect(isForfeitConfirmationRequired(true, false)).toBe(true);
  });
});