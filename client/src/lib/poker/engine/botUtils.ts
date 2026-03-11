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
  options?: { bluffFreq?: number; passiveExtra?: number }
): BetDecision {
  const callAmount = currentBet - myBet;
  const bluffFreq = options?.bluffFreq ?? 0.08;
  const passive = options?.passiveExtra ?? 0;

  if (callAmount >= chips) {
    return strength > 0.35 ? { action: 'call' } : { action: 'fold' };
  }

  if (callAmount === 0) {
    if (strength > 0.6 - passive * 0.15 && Math.random() < 0.35 + strength * 0.35) {
      const size = clampRaise(Math.floor(pot * (0.3 + strength * 0.5)), chips);
      return { action: 'raise', raiseAmount: size };
    }
    if (strength < 0.2 && Math.random() < bluffFreq) {
      const size = clampRaise(Math.floor(pot * 0.4), chips);
      return { action: 'raise', raiseAmount: size };
    }
    return { action: 'check' };
  }

  const potOdds = callAmount / (pot + callAmount);

  if (strength > 0.7 - passive * 0.1 && Math.random() < 0.3 + strength * 0.4) {
    const size = clampRaise(Math.max(callAmount * 2, Math.floor(pot * (0.3 + strength * 0.4))), chips);
    return { action: 'raise', raiseAmount: size };
  }

  if (strength > potOdds * 0.7) {
    return { action: 'call' };
  }

  if (potOdds < 0.2 && strength > 0.12) {
    return { action: 'call' };
  }

  if (Math.random() < bluffFreq && strength < 0.15 && chips > callAmount * 3) {
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
    return {
      chips: bot.chips,
      bet: bot.bet,
      status: 'folded',
      hasActed: true,
      pot,
      currentBet,
      message: `${bot.name} folded`
    };
  }

  if (decision.action === 'check') {
    return {
      chips: bot.chips,
      bet: bot.bet,
      status: bot.status,
      hasActed: true,
      pot,
      currentBet,
      message: `${bot.name} checked`
    };
  }

  if (decision.action === 'call') {
    const pay = Math.min(callAmount, bot.chips);
    return {
      chips: bot.chips - pay,
      bet: bot.bet + pay,
      status: bot.status,
      hasActed: true,
      pot: pot + pay,
      currentBet,
      message: pay === 0 ? `${bot.name} checked` : `${bot.name} called $${pay}`
    };
  }

  const raiseTotal = Math.min(decision.raiseAmount || currentBet + 2, bot.chips + bot.bet);
  const toPay = raiseTotal - bot.bet;
  const actualPay = Math.min(toPay, bot.chips);
  const newBet = bot.bet + actualPay;

  return {
    chips: bot.chips - actualPay,
    bet: newBet,
    status: bot.status,
    hasActed: true,
    pot: pot + actualPay,
    currentBet: Math.max(currentBet, newBet),
    message: `${bot.name} raised to $${newBet}`
  };
}
