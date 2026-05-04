// ─── Shared bot utility functions ────────────────────────────────────────────
// Pure functions — no browser APIs, no Node-only APIs.
// Used by both the client-side engine and the server-authoritative engine.

export interface BetDecision {
  action: 'fold' | 'check' | 'call' | 'raise';
  raiseAmount?: number;
}

// ── Personality types ────────────────────────────────────────────────────────
// Each bot seat is assigned a stable archetype derived from its ID.
// tight:      folds more, calls less, rarely bluffs
// loose:      calls wider, bluffs more, lower fold threshold
// aggressive: raises frequently, large sizing, high bluff rate
// passive:    prefers checks and calls, avoids large raises
export type BotPersonality = 'tight' | 'loose' | 'aggressive' | 'passive';

export function botPersonality(botId: string): BotPersonality {
  const sum = botId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const v = sum % 4;
  if (v === 0) return 'tight';
  if (v === 1) return 'aggressive';
  if (v === 2) return 'loose';
  return 'passive';
}

interface DecideBetOptions {
  bluffFreq?: number;
  passiveExtra?: number;
  heroWeak?: boolean;
  largePot?: boolean;
  earlyPressure?: boolean;
  activeOpponents?: number;   // live opponents excluding this bot (1 = heads-up)
  stackRisk?: number;         // callAmount / chips, 0..1
  slowPlay?: boolean;         // this hand: check strong hand to trap
  heroAggression?: number;    // 0..1 — recent hero raise-rate (0.3 = neutral)
  potControl?: boolean;       // medium-strength mode: smaller sizing, more checks
  bluffLine?: boolean;        // committed bluff this hand: continue pressure
  personality?: BotPersonality;
  momentum?: number;          // positive = winning streak, negative = losing streak
  heroFoldsOften?: boolean;   // hero has folded to pressure ≥2× recently
  focusTarget?: boolean;      // bot is actively targeting / hunting the hero
  heroEscalating?: boolean;   // hero raised in 2+ consecutive betting rounds
  stackMode?: 'bully' | 'normal' | 'survival' | 'critical';
  handVariance?: number;      // -0.08..+0.08 per-hand shift to break repetition
  facingBigStack?: boolean;   // an opponent holds >130% of this bot's chips
  shortStackPresent?: boolean; // a weak player at the table to apply pressure on
  tableDrift?: number;        // per-seat hot/cold permanent bias -0.05..+0.05
  rivalryMode?: boolean;      // hero raised 3+ times — active rivalry
  raisesThisRound?: number;   // raises already made this betting round (cap enforcement)
  raiseCap?: number;          // hard cap of raises per round (default 3, heads-up 4)
}

// ── Core decision logic ───────────────────────────────────────────────────────
// Called by the public wrapper. Contains all situational logic.
function _decideBetRaw(
  strength: number,
  pot: number,
  currentBet: number,
  myBet: number,
  chips: number,
  options?: DecideBetOptions
): BetDecision {
  const callAmount = currentBet - myBet;
  const passive    = options?.passiveExtra ?? 0;

  // ── Personality modifiers ─────────────────────────────────────────────────
  const pers = options?.personality;
  const persRaiseAdj  = pers === 'aggressive' ?  0.12
                      : pers === 'loose'      ?  0.05
                      : pers === 'passive'    ? -0.12
                      : pers === 'tight'      ? -0.07
                      : 0;
  const persCallAdj   = pers === 'tight'      ?  0.08
                      : pers === 'loose'      ? -0.07
                      : pers === 'passive'    ?  0.04
                      : pers === 'aggressive' ? -0.02
                      : 0;
  const persBluffMult = pers === 'aggressive' ? 1.80
                      : pers === 'loose'      ? 1.50
                      : pers === 'tight'      ? 0.40
                      : pers === 'passive'    ? 0.50
                      : 1.0;

  // ── Momentum modifiers ────────────────────────────────────────────────────
  const momentum     = options?.momentum ?? 0;
  const momentumGate  = momentum > 0 ? -0.03 : 0;  // winning → lower raise gate
  const momentumTight = momentum < 0 ?  0.04 : 0;  // losing  → tighter calls

  // ── Jitter ───────────────────────────────────────────────────────────────
  const jitter = (Math.random() - 0.5) * 0.10;
  const s = Math.max(0, Math.min(1, strength + jitter));

  // ── Positional / table-shape modifiers ───────────────────────────────────
  const opponents = options?.activeOpponents ?? 1;
  const headsUp   = opponents === 1;
  const multiway  = opponents >= 3;
  const posBonus  = headsUp ? 0.10 : (multiway ? -0.06 : 0);

  const aggBonus   = (options?.largePot ? 0.07 : 0) + (options?.heroWeak ? 0.09 : 0) + posBonus;
  const earlyBoost = options?.earlyPressure ? 0.13 : 0;

  // ── Hero-read adjustment ──────────────────────────────────────────────────
  const heroAgg        = options?.heroAggression ?? 0.3;
  const passiveHeroGap = heroAgg < 0.20 ? 0.05 : 0;
  const aggHeroTighten = heroAgg > 0.65 ? 0.08 : 0;

  // ── Session-level read modifiers ──────────────────────────────────────────
  // heroFoldsOften: hero folds to pressure ≥2× this session → lower bluff bar
  const foldBoostMult  = options?.heroFoldsOften ? 1.35 : 1.0;
  // focusTarget: bot has decided to hunt this hero → extra aggression
  const focusAggBonus  = options?.focusTarget  ? 0.08 : 0;
  const focusGateDrop  = options?.focusTarget  ? 0.05 : 0;
  // heroEscalating: hero raised in multiple rounds — personality determines response
  const escalFold      = options?.heroEscalating && (pers === 'tight' || pers === 'passive')  ? 0.12 : 0;
  const escalFire      = options?.heroEscalating && (pers === 'aggressive' || pers === 'loose') ? 0.08 : 0;
  // rivalryMode: hero raised 3+ times — active rivalry, aggressive seats push back harder
  const rivalryFire    = options?.rivalryMode && (pers === 'aggressive' || pers === 'loose') ? 0.06 : 0;
  // stackMode: relative chip position vs table average
  const sm             = options?.stackMode ?? 'normal';
  const stackBullyGate = sm === 'bully'    ? -0.05 : 0;
  const stackBullyRaise= sm === 'bully'    ?  0.07 : 0;
  const stackSurvCall  = sm === 'survival' ?  0.08 : (sm === 'critical' ? 0.18 : 0);
  const stackSurvRaise = sm === 'survival' ? -0.10 : (sm === 'critical' ? -0.18 : 0);
  // handVariance: per-hand ±0.08 shift to break structural repetition
  const hv             = options?.handVariance ?? 0;
  // Bot vs bot awareness: avoid big stacks, apply pressure to short stacks
  const bigStackCaution  = options?.facingBigStack    ? 0.08 : 0; // tighter calls
  const bigStackGateUp   = options?.facingBigStack    ? 0.04 : 0; // harder to open-raise into big stack
  const shortStackBonus  = options?.shortStackPresent ? 0.06 : 0; // extra aggBonus vs weak stacks
  // tableDrift: per-seat permanent hot/cold bias
  const drift            = options?.tableDrift ?? 0;

  // ── Scared money: high stack risk suppresses all bluffing ─────────────────
  const stackRisk         = options?.stackRisk ?? 0;
  const scaredMoney       = stackRisk > 0.35;
  const baseBluffFreq     = (options?.bluffFreq ?? 0.09) * persBluffMult * foldBoostMult;
  const effectiveBluffFreq = scaredMoney ? 0 : baseBluffFreq;

  // ── Bluff-line gate boost (gate checks only, not call/fold equity) ─────────
  const gateS = (options?.bluffLine && s < 0.28) ? Math.min(s + 0.18, 0.42) : s;

  // ── Dead-hand absolute fold ────────────────────────────────────────────────
  if (callAmount > 0 && s < 0.07) {
    return { action: 'fold' };
  }
  // Critical stack: fold everything marginal immediately
  if (sm === 'critical' && callAmount > 0 && s < 0.18) {
    return { action: 'fold' };
  }

  if (callAmount >= chips) {
    return s > 0.3 ? { action: 'call' } : { action: 'fold' };
  }

  // ── Sizing ────────────────────────────────────────────────────────────────
  const potControl = options?.potControl ?? false;
  const useOverbet = !potControl && Math.random() < 0.18;
  const sizeMult   = potControl
    ? 0.22 + s * 0.22
    : useOverbet
      ? 0.65 + s * 0.85
      : 0.30 + s * 0.50;

  // ── Slow-play: check strong hand to induce action ─────────────────────────
  if (callAmount === 0 && options?.slowPlay) {
    return { action: 'check' };
  }

  if (callAmount === 0) {
    const gate = 0.55 - passive * 0.12 - earlyBoost - passiveHeroGap - focusGateDrop
                      + momentumGate + stackBullyGate + bigStackGateUp;
    const raiseChance = 0.42 + s * 0.45 + earlyBoost * 0.25
                       - (multiway   ? 0.10 : 0)
                       - (potControl ? 0.15 : 0)
                       + persRaiseAdj + stackBullyRaise + stackSurvRaise + hv + drift;

    if (gateS + aggBonus + focusAggBonus + shortStackBonus > gate && Math.random() < raiseChance) {
      const size = clampRaise(Math.floor(pot * sizeMult), chips);
      return { action: 'raise', raiseAmount: size };
    }
    if (s < 0.22 && Math.random() < effectiveBluffFreq) {
      const size = clampRaise(Math.floor(pot * (useOverbet ? 0.6 : 0.4)), chips);
      return { action: 'raise', raiseAmount: size };
    }
    return { action: 'check' };
  }

  const potOdds = callAmount / (pot + callAmount);

  // ── Call multiplier: stack risk + hero read + personality + momentum + session reads + table
  const baseMult = stackRisk > 0.40 ? 0.90 : (stackRisk > 0.22 ? 0.78 : 0.65);
  const callMult = baseMult + aggHeroTighten + persCallAdj + momentumTight
                            + escalFold + stackSurvCall + bigStackCaution;

  // ── Re-raise gate — lowers when focused / escalating / rivalry / hunting ──
  const reraiseGate = 0.62 - passive * 0.1 - focusGateDrop - escalFire - rivalryFire;
  if (gateS + aggBonus + focusAggBonus + shortStackBonus > reraiseGate &&
      Math.random() < 0.38 + s * 0.45 + persRaiseAdj * 0.5 + stackBullyRaise + drift) {
    const size = clampRaise(Math.max(callAmount * 2, Math.floor(pot * sizeMult)), chips);
    return { action: 'raise', raiseAmount: size };
  }

  if (s > potOdds * callMult) {
    return { action: 'call' };
  }

  if (potOdds < 0.22 && s > 0.16 && !scaredMoney) {
    return { action: 'call' };
  }

  if (!scaredMoney && !potControl && Math.random() < effectiveBluffFreq && s < 0.18 && chips > callAmount * 3) {
    const size = clampRaise(callAmount * 2 + 2, chips);
    return { action: 'raise', raiseAmount: size };
  }

  return { action: 'fold' };
}

// ── Public entrypoint ─────────────────────────────────────────────────────────
// Applies a light imperfection layer after the core decision:
//   6% chance to miss a raise (downgrade to check or call)
//   5% chance to make a loose call on a very cheap bet
// Keeps bots from feeling "optimally correct" every single hand.
export function decideBet(
  strength: number,
  pot: number,
  currentBet: number,
  myBet: number,
  chips: number,
  options?: DecideBetOptions
): BetDecision {
  const callAmount = currentBet - myBet;
  const raw = _decideBetRaw(strength, pot, currentBet, myBet, chips, options);

  // ── Raise cap (WSOP/social-poker style) ──────────────────────────────────
  // Hard ceiling on raises per betting round to prevent runaway re-raise spirals.
  // Default 3 raises/round, 4 heads-up. When at cap, downgrade any raise to
  // call (if facing a bet) or check (if first to act).
  const raiseCap = options?.raiseCap ?? 3;
  const raisesSoFar = options?.raisesThisRound ?? 0;
  const atCap = raisesSoFar >= raiseCap;

  // ── Controlled chaos — combined <3% frequency, partitioned roll ───────────
  // Introduces rare unpredictable moments that remove the last traces of
  // mechanical predictability. Each branch is mutually exclusive.
  const chaosRoll = Math.random();
  if (chaosRoll < 0.010 && !atCap) {
    // 1.0%: spontaneous aggression — raise regardless of hand strength
    const chaosSize = clampRaise(Math.floor(pot * 0.5) + callAmount, chips);
    return { action: 'raise', raiseAmount: chaosSize };
  } else if (chaosRoll < 0.022 && callAmount > 0) {
    // 1.2%: unexpected call — call a bet we should fold
    return { action: 'call' };
  } else if (chaosRoll < 0.027 && chips > 200 && callAmount > 0 && !atCap) {
    // 0.5%: loose all-in — only when meaningful chips remain
    return { action: 'raise', raiseAmount: chips };
  }

  // Missed raise: occasionally skip a raise we clearly had
  if (raw.action === 'raise' && Math.random() < 0.06) {
    return callAmount === 0 ? { action: 'check' } : { action: 'call' };
  }
  // Loose call: occasionally hero-call on small bets we should fold
  if (raw.action === 'fold' && callAmount > 0 && callAmount < pot * 0.18 && Math.random() < 0.05) {
    return { action: 'call' };
  }

  // Final cap enforcement — never let a raise through past the cap.
  if (atCap && raw.action === 'raise') {
    return callAmount === 0 ? { action: 'check' } : { action: 'call' };
  }
  return raw;
}

function clampRaise(amount: number, chips: number): number {
  return Math.min(Math.max(amount, 2), chips);
}

export function applyBetDecision(
  decision: BetDecision,
  bot: { name: string; chips: number; bet: number; status: string; hasActed?: boolean },
  currentBet: number,
  pot: number,
  raisesThisRound: number = 0
): { chips: number; bet: number; status: string; hasActed: true; pot: number; currentBet: number; raisesThisRound: number; message: string } {
  const callAmount = currentBet - bot.bet;

  if (decision.action === 'fold') {
    return { chips: bot.chips, bet: bot.bet, status: 'folded', hasActed: true, pot, currentBet, raisesThisRound, message: `${bot.name} folded` };
  }

  if (decision.action === 'check') {
    return { chips: bot.chips, bet: bot.bet, status: bot.status, hasActed: true, pot, currentBet, raisesThisRound, message: `${bot.name} checked` };
  }

  if (decision.action === 'call') {
    // Guard: chips must be >= 0 before computing pay to prevent negative pot.
    const availChips = Math.max(0, bot.chips);
    const pay = Math.min(callAmount, availChips);
    return {
      chips: availChips - pay, bet: bot.bet + pay, status: bot.status, hasActed: true,
      pot: pot + pay, currentBet, raisesThisRound,
      message: pay === 0 ? `${bot.name} checked` : `${bot.name} called $${pay}`
    };
  }

  const availChips = Math.max(0, bot.chips);
  const raiseTotal = Math.min(decision.raiseAmount || currentBet + 2, availChips + bot.bet);
  const toPay = raiseTotal - bot.bet;
  const actualPay = Math.max(0, Math.min(toPay, availChips));
  const newBet = bot.bet + actualPay;

  return {
    chips: availChips - actualPay, bet: newBet, status: bot.status, hasActed: true,
    pot: pot + actualPay, currentBet: Math.max(currentBet, newBet),
    raisesThisRound: raisesThisRound + 1,
    message: `${bot.name} raised to $${newBet}`
  };
}
