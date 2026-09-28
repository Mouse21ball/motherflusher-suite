import type { ChatMessage, Player } from '../../shared/gameTypes';

const BOT_BANTER_WIN = [
  "That's what I'm talking about.",
  'Easy money.',
  'Next.',
  'You see that? Classic.',
  "Don't blink.",
  "Read 'em and weep.",
  'Prison rules pay off.',
];
const BOT_BANTER_LOSE = [
  'Shake it off.',
  'Variance is a beast.',
  "I'll get it back.",
  'Patience.',
  'That hurt. Moving on.',
  'One hand at a time.',
];
const BOT_BANTER_NEUTRAL = [
  'Eyes on the pot.',
  'Stay focused.',
  "It's a long game.",
  'No mercy out here.',
  'Ante up.',
  "Who's scared?",
  'Stack up or pack up.',
  'Prison rules. No mercy.',
];

interface BanterTable {
  state: {
    phase: string;
    players: Player[];
    chatMessages: ChatMessage[];
  };
}

/** Schedule the shared post-showdown bot chat, fenced to the current SHOWDOWN phase. */
export function scheduleBotBanter(
  table: BanterTable,
  winnerIds: string[],
  broadcast: () => void,
): void {
  if (Math.random() > 0.55) return;

  const bots = table.state.players.filter(p => p.presence === 'bot' && p.status !== 'folded');
  if (bots.length === 0) return;

  const bot = bots[Math.floor(Math.random() * bots.length)];
  const isWinner = winnerIds.includes(bot.id);
  const pool = isWinner
    ? BOT_BANTER_WIN
    : Math.random() > 0.45 ? BOT_BANTER_LOSE : BOT_BANTER_NEUTRAL;
  const text = pool[Math.floor(Math.random() * pool.length)];
  const delay = 400 + Math.random() * 700;

  setTimeout(() => {
    if (table.state.phase !== 'SHOWDOWN') return;
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2, 10),
      senderId: bot.id,
      senderName: bot.name,
      text,
      time: Date.now(),
    };
    table.state = { ...table.state, chatMessages: [...table.state.chatMessages.slice(-49), msg] };
    broadcast();
  }, delay);
}