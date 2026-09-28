import type { GameState } from './gameTypes';

export type PracticeGuideStatus = 'your-turn' | 'waiting' | 'complete';

export interface BadugiPracticeGuide {
  mode: 'Badugi';
  phase: string;
  title: string;
  instruction: string;
  detail: string;
  actions: string[];
  status: PracticeGuideStatus;
  statusText: string;
  maxPicks?: number;
  selectedCount?: number;
}

/**
 * Returns live, phase-aware Badugi guidance. Pure by design so the wording and
 * action math can be tested without rendering the table or changing game state.
 */
export function getBadugiPracticeGuide(
  state: GameState,
  myId: string,
  selectedCount: number,
): BadugiPracticeGuide {
  const me = state.players.find(player => player.id === myId);
  const activePlayer = state.players.find(player => player.id === state.activePlayerId);
  const isMyTurn = state.activePlayerId === myId;
  const status: PracticeGuideStatus =
    state.phase === 'SHOWDOWN' ? 'complete' : isMyTurn ? 'your-turn' : 'waiting';
  const statusText = state.phase === 'WAITING'
    ? 'Ready to start'
    : status === 'complete'
    ? 'Hand complete'
    : isMyTurn
      ? 'Your turn'
      : activePlayer
        ? `Waiting for ${activePlayer.presence === 'bot' ? 'bot ' : ''}${activePlayer.name}`
        : 'Waiting for the table';

  const guide: BadugiPracticeGuide = {
    mode: 'Badugi',
    phase: state.phase.replaceAll('_', ' '),
    title: '',
    instruction: '',
    detail: '',
    actions: [],
    status,
    statusText,
  };

  switch (state.phase) {
    case 'WAITING':
      guide.title = 'Ready to start';
      guide.instruction = 'Three bots are already seated. Tap “Start one-hand practice” to begin.';
      guide.detail = 'This is a single-hand walkthrough with virtual practice chips only; no real money is used.';
      guide.actions = ['Start one-hand practice begins the ante.'];
      break;
    case 'ANTE':
      guide.title = 'Ante';
      guide.instruction = 'Tap “Post 25 practice-chip ante” to have each player post the ante.';
      guide.detail = 'The ante is paid from your simulated practice stack; it is not real money.';
      guide.actions = ['After the ante is posted, tap Deal four cards.'];
      break;
    case 'DEAL':
      guide.title = 'Deal';
      guide.instruction = 'Tap “Deal four cards” to receive your private hand.';
      guide.detail = 'Then build a Badugi by keeping cards with different ranks and different suits.';
      guide.actions = ['The first draw round begins after you deal.'];
      break;
    case 'DRAW_1':
    case 'DRAW_2':
    case 'DRAW_3': {
      const maxPicks = state.phase === 'DRAW_1' ? 3 : state.phase === 'DRAW_2' ? 2 : 1;
      guide.maxPicks = maxPicks;
      guide.selectedCount = selectedCount;
      guide.title = `Draw ${state.phase.slice(-1)}`;
      guide.instruction = `Select up to ${maxPicks} card${maxPicks === 1 ? '' : 's'} to replace, or stand pat with 0.`;
      guide.detail = `${Math.max(0, maxPicks - selectedCount)} selection${maxPicks - selectedCount === 1 ? '' : 's'} remaining. A valid Badugi has four different ranks and four different suits.`;
      guide.actions = [`Pick 0–${maxPicks} cards, then confirm the draw.`, 'Choose no cards to stand pat.'];
      break;
    }
    case 'BET_1':
    case 'BET_2':
    case 'BET_3': {
      const owes = Math.max(0, state.currentBet - (me?.bet ?? 0));
      guide.title = state.phase === 'BET_3' ? 'Final bet after declaration' : 'Betting round';
      guide.instruction = state.phase === 'BET_3'
        ? 'Your declaration is set; this is the final betting round.'
        : 'Choose whether to continue before the next draw.';
      guide.detail = owes === 0
        ? 'You have no outstanding amount to call. Check continues without adding chips.'
        : `You owe ${owes} practice chips to call (current bet ${state.currentBet} − your bet ${me?.bet ?? 0}).`;
      guide.actions = owes === 0
        ? ['Check: tap Check to continue without adding chips.', `Bet: enter at least ${state.minBet} practice chips. You can only bet what remains in your stack.`]
        : [`Call: tap Call ${owes} to add ${owes} practice chips (or commit your remaining stack if it is smaller).`, `Raise: the amount field is chips to add. Enter at least ${owes + state.minBet} to call and raise by the ${state.minBet}-chip minimum, if your stack allows.`];
      if (state.phase === 'BET_3') guide.actions.unshift('Your HIGH or LOW declaration remains in effect if you continue.');
      break;
    }
    case 'DECLARE':
      guide.title = 'Declare HIGH or LOW';
      guide.instruction = 'Choose the side your Badugi will compete on.';
      guide.detail = 'Only a complete four-card Badugi—four distinct ranks and four distinct suits—qualifies. HIGH wants the strongest/highest Badugi; LOW wants the weakest/lowest.';
      guide.actions = ['Tap Declare High to compete for the High half.', 'Tap Declare Low to compete for the Low half.'];
      break;
    case 'SHOWDOWN': {
      const winners = state.players.filter(player => player.isWinner);
      const winnerText = winners.length
        ? ` Winner${winners.length === 1 ? '' : 's'}: ${winners.map(player => player.name).join(', ')}.`
        : '';
      const qualifierText = me?.score?.isValidBadugi
        ? ' Your hand qualified as a four-card Badugi.'
        : ' A hand must have four distinct ranks and suits to qualify.';
      guide.title = 'Showdown';
      guide.instruction = 'Eligible HIGH and LOW declarations are compared and the pot is awarded to the qualifying winner(s).';
      guide.detail = `${qualifierText}${me?.declaration === 'HIGH' || me?.declaration === 'LOW' ? ` You declared ${me.declaration}.` : ''}${winnerText}`;
      guide.actions = ['Review the result, then tap “Practice another hand” to restart or Exit to return to the lobby.'];
      break;
    }
    default:
      guide.title = 'Badugi practice';
      guide.instruction = `The table is in ${state.phase.replaceAll('_', ' ')}.`;
      guide.detail = 'Follow the live table controls; guidance is provided for Badugi phases.';
      guide.actions = [];
  }

  return guide;
}