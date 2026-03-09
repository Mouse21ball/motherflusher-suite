import { GameMode } from '../engine/types';
import { Player, CardType } from '../types';

export const Mode2Placeholder: GameMode = {
  id: 'mode_2',
  name: 'Mode 2 (Coming Soon)',
  phases: ['WAITING', 'DEAL', 'SHOWDOWN'],
  
  deal: (deck: CardType[], players: Player[], myId: string) => {
    return { players, communityCards: [], deck };
  },
  
  botAction: () => null,
  getAutoTransition: () => null,
  evaluateHand: () => undefined,
  
  resolveShowdown: (players: Player[], pot: number) => {
    return { players, pot, messages: ["Showdown!"] };
  }
};