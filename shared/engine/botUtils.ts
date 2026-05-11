// ─── Shared bot utility functions ────────────────────────────────────────────
// Pure functions — no browser APIs, no Node-only APIs.
// Used by both the client-side engine and the server-authoritative engine.

export interface BetDecision {
  action: 'fold' | 'check' | 'call' | 'raise';
  raiseAmount?: number;
}

// ── Bot tier system ───────────────────────────────────────────────────────────
// Each bot is deterministically assigned a skill tier from its ID.
// Distribution target: 40% Fish, 40% Casual, 20% Shark.
export type BotTier = 'fish' | 'casual' | 'shark';

// Deterministic tier assignment based on bot ID — same bot always gets same tier
// across reconnects but varies per-bot across the table.
export function botTier(botId: string): BotTier {
  let h = 2166136261;
  for (let i = 0; i < botId.length; i++) {
    h ^= botId.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  const tierBucket = h % 100;
  if (tierBucket < 40) return 'fish';
  if (tierBucket < 80) return 'casual';
  return 'shark';
}

// ── Personality traits ────────────────────────────────────────────────────────
// Numeric traits replace the legacy BotPersonality string enum.
// All values are deterministic per bot ID and scoped within [0, 1].
export interface BotPersonalityTraits {
  aggression:   number;  // 0 = passive, 1 = hyper-aggressive
  looseness:    number;  // 0 = tight, 1 = plays any two cards
  callStation:  number;  // 0 = disciplined, 1 = never folds to a bet
  bluffer:      number;  // 0 = honest, 1 = bluffs constantly
  tier:         BotTier;
}

// Legacy string type — kept for any residual imports; do not use in new code.
export type BotPersonality = 'tight' | 'loose' | 'aggressive' | 'passive';

export function botPersonality(botId: string): BotPersonalityTraits {
  const tier = botTier(botId);

  // Generate base traits using a deterministic hash (stable per bot ID)
  let h = 5381;
  for (let i = 0; i < botId.length; i++) {
    h = ((h * 33) + botId.charCodeAt(i)) >>> 0;
  }

  // Decompose into four independent trait values in [0, 1]
  const r1 = ((h >> 0)  & 0xFF) / 255;
  const r2 = ((h >> 8)  & 0xFF) / 255;
  const r3 = ((h >> 16) & 0xFF) / 255;
  const r4 = ((h >> 24) & 0xFF) / 255;

  let aggression:  number;
  let looseness:   number;
  let callStation: number;
  let bluffer:     number;

  if (tier === 'fish') {
    // Fish: LOOSE not AGGRESSIVE — calls too much, rarely raises.
    // High looseness, very low aggression, high call station.
    aggression  = 0.10 + r1 * 0.15;  // 0.10 – 0.25
    looseness   = 0.70 + r2 * 0.25;  // 0.70 – 0.95
    callStation = 0.65 + r3 * 0.30;  // 0.65 – 0.95
    bluffer     = 0.05 + r4 * 0.10;  // 0.05 – 0.15
  } else if (tier === 'casual') {
    // Casual: balanced — calls/folds in proportion, only raises occasionally
    aggression  = 0.30 + r1 * 0.20;  // 0.30 – 0.50
    looseness   = 0.40 + r2 * 0.25;  // 0.40 – 0.65
    callStation = 0.30 + r3 * 0.25;  // 0.30 – 0.55
    bluffer     = 0.15 + r4 * 0.15;  // 0.15 – 0.30
  } else {
    // Shark: aggressive strategic range — re-raises frequently, wide reads
    aggression  = 0.45 + r1 * 0.30;  // 0.45 – 0.75
    looseness   = 0.30 + r2 * 0.25;  // 0.30 – 0.55
    callStation = 0.15 + r3 * 0.45;  // 0.15 – 0.60
    bluffer     = 0.20 + r4 * 0.40;  // 0.20 – 0.60
  }

  return { aggression, looseness, callStation, bluffer, tier };
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
  personality?: BotPersonalityTraits;
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

  // ── Personality modifiers (numeric traits → decision adjustments) ─────────
  const pers = options?.personality;

  const aggression    = pers?.aggression   ?? 0.50;
  const looseness     = pers?.looseness    ?? 0.45;
  const callStation   = pers?.callStation  ?? 0.30;
  const blufferTrait  = pers?.bluffer      ?? 0.09;

  // persRaiseAdj: centered at 0.5 → roughly [-0.12, +0.12]
  const persRaiseAdj  = (aggression - 0.5) * 0.24;
  // persCallAdj: high callStation + high looseness both lower the call bar
  const persCallAdj   = (0.5 - looseness) * 0.10 + (0.3 - callStation) * 0.08;
  // persBluffMult: bluffer trait [0, 1] → multiplier [0.4, 2.0]
  const persBluffMult = 0.4 + blufferTrait * 1.6;

  // Style flags replacing old string-enum checks
  const isPassiveStyle    = aggression < 0.45;
  const isAggressiveStyle = aggression > 0.55;

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
  const foldBoostMult  = options?.heroFoldsOften ? 1.35 : 1.0;
  const focusAggBonus  = options?.focusTarget  ? 0.08 : 0;
  const focusGateDrop  = options?.focusTarget  ? 0.05 : 0;
  const escalFold      = options?.heroEscalating && isPassiveStyle     ? 0.12 : 0;
  const escalFire      = options?.heroEscalating && isAggressiveStyle  ? 0.08 : 0;
  const rivalryFire    = options?.rivalryMode    && isAggressiveStyle  ? 0.06 : 0;
  // stackMode: relative chip position vs table average
  const sm             = options?.stackMode ?? 'normal';
  const stackBullyGate = sm === 'bully'    ? -0.05 : 0;
  const stackBullyRaise= sm === 'bully'    ?  0.07 : 0;
  const stackSurvCall  = sm === 'survival' ?  0.08 : (sm === 'critical' ? 0.18 : 0);
  const stackSurvRaise = sm === 'survival' ? -0.10 : (sm === 'critical' ? -0.18 : 0);
  const hv             = options?.handVariance ?? 0;
  const bigStackCaution  = options?.facingBigStack    ? 0.08 : 0;
  const bigStackGateUp   = options?.facingBigStack    ? 0.04 : 0;
  const shortStackBonus  = options?.shortStackPresent ? 0.06 : 0;
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
  const callAmount  = currentBet - myBet;
  const raisesSoFar = options?.raisesThisRound ?? 0;
  const tier        = options?.personality?.tier;

  // ── Fold bias: marginal hands fold more when facing heavy aggression ──────
  // Fish 60%, Casual 50%, Shark 25% fold on borderline holdings after 2+ raises.
  if (callAmount > 0 && raisesSoFar >= 2 && strength >= 0.30 && strength <= 0.55) {
    const foldProb = tier === 'fish' ? 0.60 : tier === 'casual' ? 0.50 : 0.25;
    if (Math.random() < foldProb) return { action: 'fold' };
  }

  const raw = _decideBetRaw(strength, pot, currentBet, myBet, chips, options);

  // ── Re-raise dampener: after any raise this round, bots are 75% less ─────
  // likely to add another raise. Prevents runaway re-raise spirals.
  if (raw.action === 'raise' && raisesSoFar >= 1) {
    if (Math.random() > 0.25) {
      return callAmount > 0 ? { action: 'call' } : { action: 'check' };
    }
  }

  // ── Raise cap (WSOP/social-poker style) ──────────────────────────────────
  // Hard ceiling on raises per betting round to prevent runaway re-raise spirals.
  // Default 3 raises/round, 4 heads-up.
  const raiseCap    = options?.raiseCap ?? 3;

  // Tier-based effective raise cap: Fish ≤1, Casual ≤2, Shark = full cap
  const effectiveRaiseCap = tier === 'fish'
    ? Math.min(raiseCap, 1)
    : tier === 'casual'
      ? Math.min(raiseCap, 2)
      : raiseCap;
  const atCap = raisesSoFar >= effectiveRaiseCap;

  // ── Controlled chaos — combined <3% frequency, partitioned roll ───────────
  // Introduces rare unpredictable moments that remove the last traces of
  // mechanical predictability. Each branch is mutually exclusive.
  const chaosRoll = Math.random();
  if (chaosRoll < 0.010 && !atCap) {
    const chaosSize = clampRaise(Math.floor(pot * 0.5) + callAmount, chips);
    return { action: 'raise', raiseAmount: chaosSize };
  } else if (chaosRoll < 0.022 && callAmount > 0) {
    return { action: 'call' };
  } else if (chaosRoll < 0.027 && chips > 200 && callAmount > 0 && !atCap) {
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

  // === Tier-based action adjustments ==========================================
  // Applied after all other logic; targets the normal (non-chaos) decision path.
  if (tier === 'fish') {
    // Fish downgrades raises to calls 70% of the time
    if (raw.action === 'raise' && Math.random() > 0.30) {
      return callAmount > 0 ? { action: 'call' } : { action: 'check' };
    }
    // Fish folds less — converts marginal folds to calls on tiny bets
    if (raw.action === 'fold' && callAmount <= 4 && strength >= 0.20) {
      return { action: 'call' };
    }
  }
  // Casual: personality trait multipliers already encode TAG behavior — no
  //         extra action overrides needed.
  // Shark:  full strategic logic applies — no overrides.

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
