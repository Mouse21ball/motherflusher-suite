// ─── Shared bot utility functions ────────────────────────────────────────────
// Pure functions — no browser APIs, no Node-only APIs.
// Used by both the client-side engine and the server-authoritative engine.

export interface BetDecision {
  action: 'fold' | 'check' | 'call' | 'raise';
  raiseAmount?: number;
}

export function decideBet(
  strength: number,
  pot: number,
  currentBet: number,
  myBet: number,
  chips: number,
  options?: {
    bluffFreq?: number;
    passiveExtra?: number;
    heroWeak?: boolean;
    largePot?: boolean;
    earlyPressure?: boolean;
  }
): BetDecision {
  const callAmount = currentBet - myBet;
  const bluffFreq  = options?.bluffFreq   ?? 0.09;
  const passive    = options?.passiveExtra ?? 0;

  // ── Human imperfection jitter ─────────────────────────────────────────────
  // ±0.05 variance per call so threshold crossings feel natural and bots
  // don't cluster around a single strategy line.
  const jitter = (Math.random() - 0.5) * 0.10;
  const s = Math.max(0, Math.min(1, strength + jitter));

  // ── Context pressure modifiers ────────────────────────────────────────────
  // largePot: a big pot raises the stakes — bots raise more, check less.
  // heroWeak: hero looks unmade/drawing — punish with extra aggression.
  // earlyPressure: early betting round — bots apply position pressure.
  const aggBonus = (options?.largePot ? 0.07 : 0) + (options?.heroWeak ? 0.09 : 0);
  const earlyBoost = options?.earlyPressure ? 0.13 : 0;

  // ── Dead-hand absolute fold: don't call/raise with a truly dead hand ──────
  if (callAmount > 0 && s < 0.07) {
    return { action: 'fold' };
  }

  if (callAmount >= chips) {
    return s > 0.3 ? { action: 'call' } : { action: 'fold' };
  }

  // Occasional overbet sizing — adds unpredictability
  const useOverbet = Math.random() < 0.18;
  const sizeMult = useOverbet ? (0.65 + s * 0.85) : (0.3 + s * 0.5);

  if (callAmount === 0) {
    // Open-raise gate: aggBonus (pot/hero pressure) + earlyBoost (early-round initiative).
    // Gate lowered by passive penalty so losing bots slow down naturally.
    const gate = 0.45 - passive * 0.12 - earlyBoost;
    if (s + aggBonus > gate && Math.random() < 0.42 + s * 0.45 + earlyBoost * 0.25) {
      const size = clampRaise(Math.floor(pot * sizeMult), chips);
      return { action: 'raise', raiseAmount: size };
    }
    if (s < 0.22 && Math.random() < bluffFreq) {
      const size = clampRaise(Math.floor(pot * (useOverbet ? 0.6 : 0.4)), chips);
      return { action: 'raise', raiseAmount: size };
    }
    return { action: 'check' };
  }

  const potOdds = callAmount / (pot + callAmount);

  // Re-raise gate also lowered by aggBonus.
  if (s + aggBonus > 0.55 - passive * 0.1 && Math.random() < 0.38 + s * 0.45) {
    const size = clampRaise(Math.max(callAmount * 2, Math.floor(pot * sizeMult)), chips);
    return { action: 'raise', raiseAmount: size };
  }

  if (s > potOdds * 0.65) {
    return { action: 'call' };
  }

  // Cheap-call gate: requires meaningful strength — dead/near-dead hands fold.
  if (potOdds < 0.22 && s > 0.16) {
    return { action: 'call' };
  }

  if (Math.random() < bluffFreq && s < 0.18 && chips > callAmount * 3) {
    const size = clampRaise(callAmount * 2 + 2, chips);
    return { action: 'raise', raiseAmount: size };
  }

  return { action: 'fold' };
}

function clampRaise(amount: number, chips: number): number {
  return Math.min(Math.max(amount, 2), chips);
}

export function applyBetDecision(
  decision: BetDecision,
  bot: { name: string; chips: number; bet: number; status: string; hasActed?: boolean },
  currentBet: number,
  pot: number
): { chips: number; bet: number; status: string; hasActed: true; pot: number; currentBet: number; message: string } {
  const callAmount = currentBet - bot.bet;

  if (decision.action === 'fold') {
    return { chips: bot.chips, bet: bot.bet, status: 'folded', hasActed: true, pot, currentBet, message: `${bot.name} folded` };
  }

  if (decision.action === 'check') {
    return { chips: bot.chips, bet: bot.bet, status: bot.status, hasActed: true, pot, currentBet, message: `${bot.name} checked` };
  }

  if (decision.action === 'call') {
    const pay = Math.min(callAmount, bot.chips);
    return {
      chips: bot.chips - pay, bet: bot.bet + pay, status: bot.status, hasActed: true,
      pot: pot + pay, currentBet,
      message: pay === 0 ? `${bot.name} checked` : `${bot.name} called $${pay}`
    };
  }

  const raiseTotal = Math.min(decision.raiseAmount || currentBet + 2, bot.chips + bot.bet);
  const toPay = raiseTotal - bot.bet;
  const actualPay = Math.min(toPay, bot.chips);
  const newBet = bot.bet + actualPay;

  return {
    chips: bot.chips - actualPay, bet: newBet, status: bot.status, hasActed: true,
    pot: pot + actualPay, currentBet: Math.max(currentBet, newBet),
    message: `${bot.name} raised to $${newBet}`
  };
}
