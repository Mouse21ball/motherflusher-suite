import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeroHandValidityBadge } from '../client/src/components/game/HeroHandValidityBadge';
import { getHeroHandValidity } from '../shared/modes/heroHandValidity';
import type { CardType } from '../shared/gameTypes';

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const cards = (ranks: CardType['rank'][]): CardType[] =>
  ranks.map(rank => ({ rank, suit: 'hearts', isHidden: false }));
const community = cards(['2', '4', '6', '8', '10']);

describe('live Box Chevy made-hand warning', () => {
  it.each(['BET_1', 'DRAW_1', 'DRAW_2', 'DRAW_3', 'DECLARE'])('warns in %s, not just after auto-fold', phase => {
    const validity = getHeroHandValidity('boxchevy', phase, cards(['A', '3', '5', '7', '10']), community);
    const html = renderToStaticMarkup(React.createElement(HeroHandValidityBadge, { validity, phase }));
    expect(html).toContain('data-validity="invalid"');
    expect(html).toContain('WILL AUTO-FOLD AT DECLARE');
    expect(html).toContain('aria-live="polite"');
  });
  it('clears the warning as soon as a draw repairs the hand without exposing hidden ranks', () => {
    const made = cards(['A', '3', '5', '7', '9']);
    const validity = getHeroHandValidity('boxchevy', 'DRAW_2', made, community);
    expect(validity.status).toBe('valid');
    expect(renderToStaticMarkup(React.createElement(HeroHandValidityBadge, { validity, phase: 'DRAW_2' })))
      .not.toContain('AUTO-FOLD');
    expect(getHeroHandValidity('boxchevy', 'DRAW_2', made.map(c => ({ ...c, isHidden: true })), community).status).toBe('pending');
  });
});
