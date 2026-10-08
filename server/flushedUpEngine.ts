import { randomUUID } from 'crypto';
import { FlushedUpMode, evaluateFlushedUpHand } from '../shared/modes/flushedUp';
import type { GamePhase } from '../shared/gameTypes';
import type { GenericTable } from './genericEngine';
import type { BotFillHost, ModeEngine } from './modeEngine';
import { makeBotPlayer } from './utils/botPlayer';

const FLUSHED_UP_BOT_NAMES = ['Slick', 'Vega', 'Rosie', 'Duke', 'Nyx', 'Bones', 'Cleo', 'Remy'];

export const FlushedUpEngine: ModeEngine = {
  mode: FlushedUpMode,
  drawCap: phase => ({ DRAW_1: 3, DRAW_2: 2, DRAW_3: 1 } as Record<string, number>)[phase] ?? null,
  canWinUncontested: player => evaluateFlushedUpHand(player.cards.map(card => ({ ...card, isHidden: false }))).isFlush,
  resolveUncontested(state, winner, netPot) {
      const result = FlushedUpMode.resolveShowdown(state.players, netPot, '__server__', state.communityCards);
      const rolloverMessage = `No qualifying hands — $${netPot} rolls over!`;
      return {
        ...state,
        players: result.players,
        // Flushed Up's showdown resolver builds pot tiers from totalBet; keep
        // this fold-only rollover at the post-rake amount used by showdown.
        pot: netPot,
        phase: 'SHOWDOWN' as GamePhase,
        activePlayerId: winner.id,
        currentBet: 0,
        messages: [
          ...state.messages,
          ...result.messages.map(text => ({
            id: randomUUID(),
            text: text.startsWith('No qualifying hands') ? rolloverMessage : text,
            time: Date.now(),
            isResolution: true,
          })),
        ].slice(-10),
      };
  },
  scheduleBotFill: scheduleFlushedUpBotFill,
};

function scheduleFlushedUpBotFill(key: string, host: BotFillHost): void {
  const t0 = host.getTable(key);
  if (!t0) return;
  if (t0.botFillTimer) clearTimeout(t0.botFillTimer);

  console.log('[FlushedUp] Bot fill timer scheduled — key:', key, 'tableId:', t0.tableId);

  const fillOne = () => {
    const t = host.getTable(key);
    if (!t || t.state.phase !== 'WAITING' || t.crewId || !t.botsEnabled) {
      console.log('[FlushedUp] fillOne early-exit — key:', key, 'phase:', t?.state.phase ?? 'TABLE_GONE', 'botsEnabled:', t?.botsEnabled, 'crewId:', t?.crewId);
      return;
    }

    const reserved = t.state.players.filter(p => p.presence === 'reserved');
    const active   = t.state.players.filter(p => p.presence === 'bot' || p.presence === 'human');

    if (reserved.length === 0) {
      if (active.length >= 2) {
        console.log('[FlushedUp] All seats filled — scheduling auto-start in 3 s, key:', key);
        t.botFillTimer = setTimeout(() => {
          const t2 = host.getTable(key);
          if (!t2 || t2.state.phase !== 'WAITING') return;
          t2.botFillTimer = undefined;
          host.startHand(t2);
        }, 3_000);
      }
      return;
    }

    // Seat one bot with a Flushed Up name
    const first = reserved[0];
    const usedNames = t.state.players.filter(p => p.presence === 'bot').map(p => p.name);
    const botName = FLUSHED_UP_BOT_NAMES.find(n => !usedNames.includes(n))
      ?? FLUSHED_UP_BOT_NAMES[Math.floor(Math.random() * FLUSHED_UP_BOT_NAMES.length)];
    console.log('[FlushedUp] Seating bot', botName, 'in seat', first.id, '— key:', key, 'reserved remaining:', reserved.length - 1);
    t.state = {
      ...t.state,
      players: t.state.players.map(p =>
        p.id === first.id
          ? makeBotPlayer(p, botName, 'active')
          : p,
      ),
    };
    host.broadcast(t);

    const reservedNow = t.state.players.filter(p => p.presence === 'reserved');
    const activeNow   = t.state.players.filter(p => p.presence === 'bot' || p.presence === 'human');

    if (reservedNow.length > 0) {
      t.botFillTimer = setTimeout(fillOne, 2_000);
    } else if (activeNow.length >= 2) {
      console.log('[FlushedUp] Table full — scheduling auto-start in 3 s, key:', key);
      t.botFillTimer = setTimeout(() => {
        const t2 = host.getTable(key);
        if (!t2 || t2.state.phase !== 'WAITING') return;
        t2.botFillTimer = undefined;
        host.startHand(t2);
      }, 3_000);
    }
  };

  t0.botFillTimer = setTimeout(() => {
    const t = host.getTable(key);
    console.log('[FlushedUp] Bot fill timer FIRED — key:', key, 'phase:', t?.state.phase ?? 'TABLE_GONE', 'active:', t?.state.players.filter(p => p.presence === 'bot' || p.presence === 'human').length);
    if (!t || t.state.phase !== 'WAITING') return;
    const active = t.state.players.filter(p => p.presence === 'bot' || p.presence === 'human');
    if (active.length >= 2) {
      console.log('[FlushedUp] 2+ players already present — scheduling auto-start in 3 s, key:', key);
      t.botFillTimer = setTimeout(() => {
        const t2 = host.getTable(key);
        if (!t2 || t2.state.phase !== 'WAITING') return;
        t2.botFillTimer = undefined;
        host.startHand(t2);
      }, 3_000);
    } else {
      fillOne();
    }
  }, 10_000);
}

