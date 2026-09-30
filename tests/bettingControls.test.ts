import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BadugiActionBar } from '../client/src/components/badugi/BadugiActionBar';
import { Dead7ActionBar } from '../client/src/components/dead7/Dead7ActionBar';
import { KamikazeActionBar } from '../client/src/components/kamikaze/KamikazeActionBar';
import {
  canRaiseTo,
  createBettingContext,
  getAllInAction,
  getBetSizePresets,
  getCheckCallAction,
  parseRaiseTo,
  suggestedRaiseTo,
} from '../client/src/components/game/bettingMath';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe('shared betting math', () => {
  it('uses the server raise-to amount and the live stake-tier minimum', () => {
    const context = createBettingContext({
      currentBet: 500,
      myBet: 300,
      chips: 900,
      pot: 1600,
      minBet: 250,
    });

    expect(context).toMatchObject({
      callAmount: 200,
      payableCall: 200,
      minRaiseTo: 750,
      maxRaiseTo: 1200,
    });
    expect(suggestedRaiseTo(context)).toBe(750);
    expect(canRaiseTo(749, context)).toBe(false);
    expect(canRaiseTo(750, context)).toBe(true);
    expect(canRaiseTo(1201, context)).toBe(false);
  });

  it('does not block a short-stack all-in below the ordinary minimum raise', () => {
    const context = createBettingContext({
      currentBet: 500,
      myBet: 300,
      chips: 350,
      pot: 1000,
      minBet: 250,
    });

    expect(context.maxRaiseTo).toBe(650);
    expect(canRaiseTo(650, context)).toBe(true);
    expect(getAllInAction(context)).toEqual({ action: 'raise', amount: 650 });
  });

  it('treats an all-in no larger than the outstanding wager as a call', () => {
    const context = createBettingContext({
      currentBet: 700,
      myBet: 300,
      chips: 250,
      pot: 1000,
      minBet: 50,
    });

    expect(getAllInAction(context)).toEqual({ action: 'call' });
    expect(context.payableCall).toBe(250);
  });

  it('offers quarter-pot, half-pot, pot and two-pot targets, bounded by affordability without a hidden amount cap', () => {
    const context = createBettingContext({
      currentBet: 500,
      myBet: 500,
      chips: 20_000,
      pot: 1000,
      minBet: 50,
    });

    expect(getBetSizePresets(context)).toEqual([
      { id: 'quarter-pot', label: '¼ POT', amount: 750 },
      { id: 'half-pot', label: '½ POT', amount: 1000 },
      { id: 'pot', label: 'POT', amount: 1500 },
      { id: 'two-pot', label: '2× POT', amount: 2500 },
    ]);
    expect(context.maxRaiseTo).toBe(20_500);
    expect(parseRaiseTo('5000')).toBe(5000);
  });

  it('only accepts positive whole-chip custom amounts', () => {
    expect(parseRaiseTo('1250')).toBe(1250);
    expect(parseRaiseTo('')).toBeNull();
    expect(parseRaiseTo('1.5')).toBeNull();
    expect(parseRaiseTo('-1')).toBeNull();
    expect(parseRaiseTo('Infinity')).toBeNull();
  });

  it('chooses check versus call from the outstanding amount', () => {
    const even = createBettingContext({ currentBet: 500, myBet: 500, chips: 1000, pot: 200, minBet: 50 });
    const behind = createBettingContext({ currentBet: 500, myBet: 300, chips: 1000, pot: 200, minBet: 50 });

    expect(getCheckCallAction(even)).toBe('check');
    expect(getCheckCallAction(behind)).toBe('call');
  });
});

const actionBars = [
  ['Dead 7', Dead7ActionBar, { onStandPat: () => {}, onDraw: () => {} }],
  ['Badugi', BadugiActionBar, { onStandPat: () => {}, onDraw: () => {} }],
  ['Kamikaze', KamikazeActionBar, { onStay: () => {}, onDraw: () => {} }],
] as const;

describe.each(actionBars)('%s shared betting controls integration', (_mode, ActionBar, modeActions) => {
  it('renders the same custom bet, pot sizing, call/fold/raise and all-in controls using the live minBet', () => {
    const props = {
      phase: 'BET_1',
      isDrawPhase: false,
      selectedCount: 0,
      drawLimit: 3,
      isMyTurn: true,
      chips: 1000,
      currentBet: 500,
      myBet: 500,
      pot: 1000,
      minBet: 250,
      ante: 25,
      humanCount: 2,
      openSeatsCount: 0,
      activeCount: 2,
      isClubTable: false,
      locked: false,
      myDeclaration: null,
      myHasActed: false,
      onAction: () => {},
      onRebuy: () => {},
      ...modeActions,
    };
    const html = renderToStaticMarkup(createElement(ActionBar, props));
    const callHtml = renderToStaticMarkup(createElement(ActionBar, { ...props, currentBet: 600 }));

    expect(html).toContain('data-testid="betting-controls"');
    expect(html).toContain('data-testid="input-bet-amount"');
    expect(html).toContain('value="750"');
    expect(html).toContain('data-testid="button-bet-quarter-pot"');
    expect(html).toContain('data-testid="button-bet-half-pot"');
    expect(html).toContain('data-testid="button-bet-pot"');
    expect(html).toContain('data-testid="button-bet-two-pot"');
    expect(html).toContain('data-testid="button-fold"');
    expect(html).toContain('data-testid="button-check"');
    expect(callHtml).toContain('data-testid="button-call"');
    expect(html).toContain('data-testid="button-raise"');
    expect(html).toContain('data-testid="button-all-in"');
  });
});