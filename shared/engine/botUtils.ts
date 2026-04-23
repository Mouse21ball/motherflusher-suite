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
    activeOpponents?: number;  // live opponents excluding this bot (1 = heads-up)
    stackRisk?: number;        // callAmount / chips, 0..1
    slowPlay?: boolean;        // this hand: check strong hand to trap
  }
): BetDecision {
  const callAmount = currentBet - myBet;
  const bluffFreq  = options?.bluffFreq   ?? 0.09;
  const passive    = options?.passiveExtra ?? 0;

  // ── Human imperfection jitter ─────────────────────────────────────────────
  const jitter = (Math.random() - 0.5) * 0.10;
  const s = Math.max(0, Math.min(1, strength + jitter));

  // ── Positional / table-shape modifiers ───────────────────────────────────
  // heads-up: more aggressive (one opponent to push around)
  // multiway: tighter (more callers → need stronger hand to bet/call)
  const opponents = options?.activeOpponents ?? 1;
  const headsUp   = opponents === 1;
  const multiway  = opponents >= 3;
  const posBonus  = headsUp ? 0.10 : (multiway ? -0.06 : 0);

  const aggBonus   = (options?.largePot ? 0.07 : 0) + (options?.heroWeak ? 0.09 : 0) + posBonus;
  const earlyBoost = options?.earlyPressure ? 0.13 : 0;

  // ── Dead-hand absolute fold ───────────────────────────────────────────────
  if (callAmount > 0 && s < 0.07) {
    return { action: 'fold' };
  }

  if (callAmount >= chips) {
    return s > 0.3 ? { action: 'call' } : { action: 'fold' };
  }

  const useOverbet = Math.random() < 0.18;
  const sizeMult = useOverbet ? (0.65 + s * 0.85) : (0.3 + s * 0.5);

  // ── Slow-play: check strong hand to induce action ─────────────────────────
  if (callAmount === 0 && options?.slowPlay) {
    return { action: 'check' };
  }

  if (callAmount === 0) {
    // Open-raise gate: lower it by earlyBoost (initiative round) and raise it
    // back by passive penalty and multiway caution.
    const gate     = 0.45 - passive * 0.12 - earlyBoost;
    const raiseChance = 0.42 + s * 0.45 + earlyBoost * 0.25 - (multiway ? 0.10 : 0);
    if (s + aggBonus > gate && Math.random() < raiseChance) {
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

  // ── Stack-risk call multiplier: the more stack the call risks, the tighter ─
  // Low risk (<22%): standard 0.65 threshold
  // Medium risk (22-40%): 0.78 (need better equity to call)
  // High risk (>40%): 0.90 (only strong hands justify risking this much)
  const stackRisk = options?.stackRisk ?? 0;
  const callMult  = stackRisk > 0.40 ? 0.90 : (stackRisk > 0.22 ? 0.78 : 0.65);

  // Re-raise gate
  if (s + aggBonus > 0.55 - passive * 0.1 && Math.random() < 0.38 + s * 0.45) {
    const size = clampRaise(Math.max(callAmount * 2, Math.floor(pot * sizeMult)), chips);
    return { action: 'raise', raiseAmount: size };
  }

  if (s > potOdds * callMult) {
    return { action: 'call' };
  }

  // Cheap-call gate: still requires meaningful strength
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
