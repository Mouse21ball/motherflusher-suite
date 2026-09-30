export interface BettingContext {
  currentBet: number;
  myBet: number;
  chips: number;
  pot: number;
  minBet: number;
  callAmount: number;
  payableCall: number;
  maxRaiseTo: number;
  minRaiseTo: number;
}

export interface BetSizePreset {
  id: 'quarter-pot' | 'half-pot' | 'pot' | 'two-pot';
  label: string;
  amount: number;
}

function wholeChips(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function createBettingContext(input: {
  currentBet: number;
  myBet: number;
  chips: number;
  pot: number;
  minBet: number;
}): BettingContext {
  const currentBet = wholeChips(input.currentBet);
  const myBet = wholeChips(input.myBet);
  const chips = wholeChips(input.chips);
  const pot = wholeChips(input.pot);
  const minBet = Math.max(1, wholeChips(input.minBet));
  const callAmount = Math.max(0, currentBet - myBet);

  return {
    currentBet,
    myBet,
    chips,
    pot,
    minBet,
    callAmount,
    payableCall: Math.min(callAmount, chips),
    maxRaiseTo: myBet + chips,
    minRaiseTo: currentBet + minBet,
  };
}

export function parseRaiseTo(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function canRaiseTo(amount: number | null, context: BettingContext): amount is number {
  if (amount === null || !Number.isSafeInteger(amount)) return false;
  if (amount <= context.currentBet || amount > context.maxRaiseTo) return false;

  const isAllIn = amount === context.maxRaiseTo;
  return isAllIn || amount - context.currentBet >= context.minBet;
}

export function suggestedRaiseTo(context: BettingContext): number {
  return context.maxRaiseTo < context.minRaiseTo
    ? context.maxRaiseTo
    : context.minRaiseTo;
}

export function getCheckCallAction(context: BettingContext): 'check' | 'call' {
  return context.callAmount === 0 ? 'check' : 'call';
}

export function getBetSizePresets(context: BettingContext): BetSizePreset[] {
  const potAfterCall = context.pot + context.payableCall;
  const fromPot = (fraction: number) => Math.max(
    context.minRaiseTo,
    context.currentBet + Math.round(potAfterCall * fraction),
  );

  return [
    { id: 'quarter-pot', label: '¼ POT', amount: fromPot(0.25) },
    { id: 'half-pot', label: '½ POT', amount: fromPot(0.5) },
    { id: 'pot', label: 'POT', amount: fromPot(1) },
    { id: 'two-pot', label: '2× POT', amount: fromPot(2) },
  ];
}

export function getAllInAction(context: BettingContext): {
  action: 'call' | 'raise';
  amount?: number;
} {
  // Raise actions carry a target street total (not a chip increment). If the
  // stack cannot raise beyond the current wager, an all-in is just a call.
  return context.maxRaiseTo > context.currentBet
    ? { action: 'raise', amount: context.maxRaiseTo }
    : { action: 'call' };
}