// ─── Pure result-classification utility ──────────────────────────────────────
// Extracted from ResolutionOverlay so it can be unit-tested without React.
// No browser APIs, no hooks — safe to import in server-side test scripts.

export type ResultType = 'win' | 'loss' | 'split' | 'fold';

export interface ResolutionMessage {
  id: string;
  text: string;
  time: number;
  isResolution?: boolean;
}

export interface ClassifiedResult {
  type: ResultType;
  primary: string;
  secondary: string;
  handName: string;
  winnerName: string;
  details: string[];
}

export interface HeroPlayerLike {
  status?: string;
  isWinner?: boolean;
  isLoser?: boolean;
  score?: {
    description?: string;
    highEval?: { description?: string };
    lowEval?: { description?: string };
  };
}

export function classifyResult(
  messages: ResolutionMessage[],
  heroPlayer?: HeroPlayerLike | null,
  heroChipChange?: number,
): ClassifiedResult {
  const texts = messages.map(m => m.text);
  const isSplit = texts.some(t => /Split Pot/i.test(t));
  const net = heroChipChange ?? 0;
  const absNet = Math.abs(net);
  const amountStr = absNet > 0 ? `$${absNet}` : '';

  const handName = heroPlayer?.score?.description
    ?? heroPlayer?.score?.highEval?.description
    ?? heroPlayer?.score?.lowEval?.description
    ?? '';

  let winnerName = '';
  const winMsg = texts.find(t => /wins with|scoops with|wins the|takes the/i.test(t));
  if (winMsg) {
    const m = winMsg.match(/^(.+?)\s+(wins|scoops|takes)/i);
    if (m) winnerName = m[1].trim();
  }

  // ── 1. Hero folded ──
  if (heroPlayer?.status === 'folded') {
    return {
      type: 'fold',
      primary: 'You folded',
      secondary: amountStr ? `−${amountStr}` : '',
      handName: '',
      winnerName,
      details: winnerName ? [`Pot goes to ${winnerName}`] : texts,
    };
  }

  // ── 2. Hero won outright ──
  if (heroPlayer?.isWinner) {
    return {
      type: 'win',
      primary: net >= 0 ? 'You Win' : 'You Split',
      secondary: net > 0 ? `+${amountStr}` : amountStr ? `+${amountStr}` : '+$0',
      handName,
      winnerName: '',
      details: texts.filter(t => !/^You\s+(win|scoop|receive)/i.test(t)),
    };
  }

  // ── 3. Pot split ──
  if (isSplit) {
    return {
      type: net > 0 ? 'win' : net < 0 ? 'loss' : 'split',
      primary: 'Pot Split',
      secondary: net > 0 ? `+${amountStr}` : net < 0 ? `−${amountStr}` : '$0',
      handName,
      winnerName,
      details: texts.filter(t => !/^Split Pot/i.test(t)),
    };
  }

  // ── 4. Hero lost ──
  if (heroPlayer?.isLoser || net < 0) {
    return {
      type: 'loss',
      primary: 'Hand Lost',
      secondary: amountStr ? `−${amountStr}` : '−$0',
      handName,
      winnerName,
      details: texts,
    };
  }

  // ── 5. Net positive but no winner flag ──
  if (net > 0) {
    return {
      type: 'win',
      primary: 'You Win',
      secondary: `+${amountStr}`,
      handName,
      winnerName: '',
      details: texts,
    };
  }

  // ── 6. Hand settled (no chip change) ──
  return {
    type: 'loss',
    primary: 'Hand Settled',
    secondary: '$0',
    handName,
    winnerName,
    details: texts,
  };
}
