import type { TutCard, TutorialSpec } from './tutorialTypes';

/**
 * The four game tutorials (Detroit 2026-10-21, Phase 2). Content is
 * written from the engines, not from generic poker: draw caps 3/2/1,
 * Badugi declaration + auto-fold, Flushed Up suit-count comparison
 * (no flush gate — the last player standing takes the pot), Box
 * Chevy's ten unique ranks with HIGH/LOW/SWING declarations, Lady
 * Luck's first-suit-to-nine race with room wager limits.
 * tests/tutorialSpecs.test.ts pins every example hand to the real
 * evaluators so the lessons cannot drift from the games.
 */

const c = (rank: string, suit: TutCard['suit']): TutCard => ({ rank, suit });
const S = 'spades', H = 'hearts', D = 'diamonds', C = 'clubs';

const BETTING_ACTIONS = [
  { label: 'CHECK', kind: 'neutral' as const, response: 'CHECK: nobody has bet yet, so you stay in for free and the action moves on.' },
  { label: 'CALL', kind: 'neutral' as const, response: 'CALL: match the current bet to stay in the hand. Your chips go into the pot.' },
  { label: 'RAISE', kind: 'gold' as const, response: 'RAISE: match the bet and add more on top — everyone else now has to match your number or fold. In the real game the raise controls open in one compact row.' },
  { label: 'FOLD', kind: 'danger' as const, response: 'FOLD: give up this hand and every chip you already put in. Sometimes folding early is the cheapest win.' },
];

// ─── BADUGI ──────────────────────────────────────────────────────────────────

export const BADUGI_SPEC: TutorialSpec = {
  modeId: 'badugi',
  name: 'BADUGI',
  color: '#4CAF50',
  cardVariant: 'premium',
  tagline: 'Four cards. All different ranks, all different suits.',
  steps: [
    {
      id: 'goal', phase: 'THE GOAL', title: 'Build a Badugi',
      body: 'A Badugi is four cards with every rank different AND every suit different. This is the perfect one — the lowest cards there are, one of each suit.',
      heroCards: [c('A', S), c('2', H), c('3', D), c('4', C)],
      heroLabel: 'YOUR HAND — A PERFECT BADUGI',
      verdict: 'A-2-3-4, FOUR SUITS — THE BEST LOW THERE IS', verdictKind: 'win',
      note: 'In Badugi the Ace always counts as 1 — that is why A-2-3-4 is the perfect low, and why the biggest HIGH is K-Q-J-10. The same hand can play HIGH or LOW; you pick your side at declaration time.',
    },
    {
      id: 'valid-invalid', phase: 'GOOD VS BROKEN', title: 'A Pair Breaks It',
      body: 'Your King-high is a real Badugi. Their pair of Kings is not one at all — this game is all or nothing: four different ranks AND four different suits, or the hand does not count. Reach declaration holding that pair and you are folded automatically.',
      heroCards: [c('K', S), c('Q', H), c('J', D), c('9', C)],
      heroLabel: 'YOUR HAND — A REAL BADUGI',
      rivalCards: [c('K', H), c('K', D), c('J', C), c('9', S)],
      rivalLabel: 'OPPONENT — NOT A BADUGI',
      rivalNote: 'Pair of Kings: no Badugi, no showdown.',
      verdict: 'A BADUGI BEATS NO BADUGI', verdictKind: 'win',
    },
    {
      id: 'deal', phase: 'THE DEAL', title: 'Four Cards, One Problem',
      body: 'Every hand starts with a $25 ante into the pot, then four cards. Look at yours: the ranks are all different, but the 9♦ and K♦ share a suit — right now this is not a Badugi.',
      heroCards: [c('4', S), c('7', H), c('9', D), c('K', D)],
      heroLabel: 'YOUR HAND — TWO DIAMONDS',
      note: 'You get three draw rounds to fix it. The swap limits shrink every round: 3, then 2, then 1.',
    },
    {
      id: 'draw1', phase: 'DRAW 1 OF 3', title: 'Swap the Problem Card',
      body: 'First draw: swap up to 3 cards. One of the diamonds has to go — tap a card to mark it, then hit SWAP. Swapping zero is legal too; that is called standing pat.',
      draw: {
        max: 3,
        replacements: [c('3', C), c('2', D), c('A', C)],
        buttonLabel: 'SWAP CARDS',
        afterText: 'Count it now: if every rank and every suit is different, that is a Badugi. The cards you kept never moved — only the ones you picked were replaced.',
      },
    },
    {
      id: 'betting', phase: 'BETTING', title: 'Betting Between Draws',
      body: 'After every draw comes a betting round. Try the buttons — this is a simulation, no chips move. In the real game you have a 30-second clock, plus a +20 second time bank once per turn.',
      actions: BETTING_ACTIONS,
    },
    {
      id: 'draws23', phase: 'DRAWS 2 AND 3', title: 'The Caps Shrink: 3, 2, 1',
      body: 'Draw two lets you swap at most 2 cards. Draw three, at most 1. Plan early — by the last draw you can only fix a single card, and standing pat tells the table you are already made.',
      note: 'Bots and players follow the same caps. A swap the server did not accept never changes your hand.',
    },
    {
      id: 'declare', phase: 'DECLARE', title: 'Call Your Side',
      body: 'After the last draw, declare. Your hand reads 3-4-7-9. HIGH plays it as a 9-high; LOW plays it as a 9-low. Which side is stronger?',
      heroCards: [c('3', C), c('4', S), c('7', H), c('9', D)],
      heroLabel: 'YOUR HAND — DECLARE',
      actions: [
        { label: 'DECLARE HIGH', kind: 'gold', response: 'HIGH works, but a 9-high is weak — plenty of Badugis are higher. LOW is the better side for this hand.' },
        { label: 'DECLARE LOW', kind: 'sky', correct: true, response: 'Right call. As a 9-low it beats any low whose top card is a 10, Jack, Queen or King — lows are compared from the highest card down.', },
        { label: 'FOLD', kind: 'danger', response: 'Folding is always available — but with a made Badugi and no bet to face, folding here just gives the pot away.' },
      ],
      note: 'No valid Badugi at declaration? The game folds you automatically and your pod shows NO BADUGI — that is a rule, not a bug.',
    },
    {
      id: 'showdown-win', phase: 'SHOWDOWN', title: 'Why This Hand Wins',
      body: 'Both declared LOW. Lows compare from the highest card down: your top card is a 9, theirs is a Jack. Lower top card wins — the rest never even gets compared.',
      heroCards: [c('3', C), c('4', S), c('7', H), c('9', D)],
      heroLabel: 'YOUR HAND — DECLARED LOW',
      rivalCards: [c('2', S), c('5', H), c('8', D), c('J', C)],
      rivalLabel: 'OPPONENT — DECLARED LOW',
      rivalNote: 'Jack-low: their top card is higher than yours.',
      verdict: 'YOU WIN — 9-LOW BEATS JACK-LOW', verdictKind: 'win',
    },
    {
      id: 'showdown-lose', phase: 'SHOWDOWN', title: 'Why This Hand Loses',
      body: 'Both declared HIGH with King-high Badugis — the biggest high there is, because in Badugi the Ace counts as 1, never high. The hands tie card for card until the very last one: their 10 beats your 9. A made hand is not always a winning hand.',
      heroCards: [c('K', S), c('Q', H), c('J', D), c('9', C)],
      heroLabel: 'YOUR HAND — DECLARED HIGH',
      rivalCards: [c('K', H), c('Q', D), c('J', C), c('10', S)],
      rivalLabel: 'OPPONENT — DECLARED HIGH',
      rivalNote: 'Same King-high — better last card.',
      verdict: 'YOU LOSE — LAST CARD DECIDES IT', verdictKind: 'lose',
    },
    {
      id: 'recap', phase: 'RECAP', title: 'Badugi in One Breath',
      body: 'Four cards, all ranks and suits different. Swap up to 3, then 2, then 1. Bet between draws. Declare HIGH or LOW — the two sides can split the pot between them. No Badugi at declaration means an automatic fold. Lowest top card wins LOW; highest top card wins HIGH.',
      verdict: 'NOW YOU KNOW THE GAME', verdictKind: 'info',
    },
  ],
};

// ─── FLUSHED UP ──────────────────────────────────────────────────────────────

export const FLUSHED_UP_SPEC: TutorialSpec = {
  modeId: 'flushedup',
  name: 'FLUSHED UP',
  color: '#8b5cf6',
  cardVariant: 'classic',
  tagline: 'Five cards. One suit rules everything.',
  steps: [
    {
      id: 'goal', phase: 'THE GOAL', title: 'Count the Suit',
      body: 'Forget pairs and straights — only suits matter. Your hand is scored by your biggest suit group. Four hearts is strong; five of a suit is a flush, the best there is.',
      heroCards: [c('A', H), c('K', H), c('9', H), c('6', H), c('2', D)],
      heroLabel: 'YOUR HAND — FOUR HEARTS',
      verdict: '4-CARD HEARTS: A-K-9-6', verdictKind: 'info',
      note: 'There is no declaration in Flushed Up. Your best suit plays automatically at showdown.',
    },
    {
      id: 'valid-invalid', phase: 'FLUSH VS RAINBOW', title: 'Five of a Suit Is a Flush',
      body: 'Your five spades are a made flush. Their hand is a rainbow — the best they can claim is the two hearts. At showdown, the bigger suit group wins before ranks are even looked at.',
      heroCards: [c('A', S), c('K', S), c('Q', S), c('9', S), c('4', S)],
      heroLabel: 'YOUR HAND — FLUSH',
      rivalCards: [c('A', H), c('K', D), c('Q', C), c('J', H), c('10', S)],
      rivalLabel: 'OPPONENT — RAINBOW',
      rivalNote: 'Best group: just 2 hearts.',
      verdict: 'FLUSH BEATS EVERYTHING SMALLER', verdictKind: 'win',
    },
    {
      id: 'deal', phase: 'THE DEAL', title: 'Three Hearts to Build On',
      body: 'Ante is $25, you get five cards. Three hearts already — the J♦ and 4♣ are dead weight. Your whole game is turning this into four or five hearts.',
      heroCards: [c('3', H), c('7', H), c('J', D), c('4', C), c('K', H)],
      heroLabel: 'YOUR HAND — THREE HEARTS',
      note: 'Flushed Up bets BEFORE each draw: you price the hand as dealt, then improve it. Three draws, swapping up to 3 cards, then 2, then 1.',
    },
    {
      id: 'betting', phase: 'BETTING', title: 'Bet First, Then Draw',
      body: 'First betting round happens on the hand exactly as dealt — three hearts and hope. Try the buttons — simulation only, no chips move. Then the draws start.',
      actions: BETTING_ACTIONS,
    },
    {
      id: 'draw1', phase: 'DRAW 1 OF 3', title: 'Feed the Suit',
      body: 'Tap the cards that are NOT hearts — those are the ones to swap. Keep every heart, even the little 3. In this game a low card in your suit beats a King off-suit.',
      draw: {
        max: 3,
        replacements: [c('Q', H), c('5', H), c('8', D)],
        buttonLabel: 'SWAP CARDS',
        afterText: 'Every heart you add makes the group bigger. Five of a suit is a flush — the strongest hand at this table.',
      },
    },
    {
      id: 'draws23', phase: 'DRAWS 2 AND 3', title: 'Caps Shrink: 3, 2, 1',
      body: 'Second draw swaps at most 2, last draw at most 1. If you are already holding a flush, stand pat — swapping a flush card away to chase a higher one is how flushes die.',
      note: 'If every opponent folds, the last player standing takes the pot — no flush required. Staying in has value even with a small group.',
    },
    {
      id: 'showdown-win', phase: 'SHOWDOWN', title: 'Why This Hand Wins',
      body: 'Your five hearts are a flush. Their best group is four diamonds. Showdown compares group size first — five beats four, and the ranks inside never come into it.',
      heroCards: [c('A', H), c('K', H), c('9', H), c('6', H), c('3', H)],
      heroLabel: 'YOUR HAND — FLUSH',
      rivalCards: [c('K', D), c('Q', D), c('8', D), c('5', D), c('2', C)],
      rivalLabel: 'OPPONENT — FOUR DIAMONDS',
      verdict: 'YOU WIN — 5 HEARTS BEAT 4 DIAMONDS', verdictKind: 'win',
    },
    {
      id: 'showdown-lose', phase: 'SHOWDOWN', title: 'Why This Hand Loses',
      body: 'Both hold four hearts vs four diamonds — the groups tie at four, so the tiebreak is the ranks inside the group, high to low: Ace, King… then their Queen beats your 9 at the third card. That is the whole hand.',
      heroCards: [c('A', H), c('K', H), c('9', H), c('6', H), c('2', D)],
      heroLabel: 'YOUR HAND — FOUR HEARTS',
      rivalCards: [c('A', D), c('K', D), c('Q', D), c('J', D), c('3', C)],
      rivalLabel: 'OPPONENT — FOUR DIAMONDS',
      rivalNote: 'Queen at the third spot beats your 9.',
      verdict: 'YOU LOSE — THIRD CARD DECIDES IT', verdictKind: 'lose',
    },
    {
      id: 'recap', phase: 'RECAP', title: 'Flushed Up in One Breath',
      body: 'Five cards — biggest suit group wins, five of a suit is a flush. Swap up to 3, then 2, then 1, feeding your best suit. No declaration. Ties on group size break by the ranks inside the group, high to low.',
      verdict: 'NOW YOU KNOW THE GAME', verdictKind: 'info',
    },
  ],
};

// ─── BOX CHEVY ───────────────────────────────────────────────────────────────

const BC_BOARD = [c('2', C), c('5', S), c('7', H), c('9', D), c('J', C)];

export const BOX_CHEVY_SPEC: TutorialSpec = {
  modeId: 'box_chevy',
  name: 'BOX CHEVY',
  color: '#3b82f6',
  cardVariant: 'classic',
  tagline: 'Ten cards. Every rank different, or nothing.',
  steps: [
    {
      id: 'goal', phase: 'THE GOAL', title: 'Ten Cards, No Pairs',
      body: 'Your five hole cards plus the five shared board cards make one ten-card hand. EVERY rank across all ten must be different. One pair anywhere — even with the board — and the hand cannot win either side.',
      boardCards: BC_BOARD, boardLabel: 'THE BOARD — SHARED BY EVERYONE',
      heroCards: [c('A', S), c('3', H), c('4', D), c('8', C), c('10', S)],
      heroLabel: 'YOUR FIVE HOLE CARDS',
      verdict: 'ALL TEN RANKS DIFFERENT — A MADE HAND', verdictKind: 'win',
      note: 'The board is dealt face-up with the hand and never changes. Only your five hole cards are yours to swap.',
    },
    {
      id: 'broken', phase: 'GOOD VS BROKEN', title: 'One Pair Kills All Ten',
      body: 'Their hole cards hold a 5 — and the board already has a 5. That single duplicated rank breaks the whole ten-card hand. It does not matter how pretty the other nine cards are.',
      boardCards: BC_BOARD, boardLabel: 'THE BOARD — NOTE THE 5',
      heroCards: [c('A', S), c('3', H), c('4', D), c('8', C), c('10', S)],
      heroLabel: 'YOUR HAND — MADE',
      rivalCards: [c('5', H), c('K', S), c('Q', D), c('6', C), c('3', S)],
      rivalLabel: 'OPPONENT — BROKEN',
      rivalNote: 'Their 5 pairs the board 5. Dead on both sides.',
      verdict: 'MADE HAND BEATS BROKEN HAND', verdictKind: 'win',
    },
    {
      id: 'deal', phase: 'THE DEAL', title: 'Spot the Collision',
      body: 'Ante $25. Your five arrive with the board already showing. Check this hand: your 9♠ pairs the board 9♦ by rank. Right now you are broken — the draw rounds are how you fix it.',
      boardCards: BC_BOARD, boardLabel: 'THE BOARD',
      heroCards: [c('A', S), c('3', H), c('4', D), c('8', C), c('9', S)],
      heroLabel: 'YOUR HAND — THE 9 COLLIDES',
      note: 'The made-hand indicator on the real table tracks this for you as your cards change.',
    },
    {
      id: 'draw1', phase: 'DRAW 1 OF 3', title: 'Fix Your Five',
      body: 'You only ever swap your own hole cards — the board is locked. Tap the colliding 9 (and anything else you want gone), then swap. Limits: 3 cards, then 2, then 1.',
      boardCards: BC_BOARD, boardLabel: 'THE BOARD — NEVER MOVES',
      draw: {
        max: 3,
        replacements: [c('10', D), c('6', S), c('K', H)],
        buttonLabel: 'SWAP CARDS',
        afterText: 'After every swap, re-check all ten ranks together — a replacement can fix one collision and cause another.',
      },
    },
    {
      id: 'betting', phase: 'BETTING', title: 'Betting Between Draws',
      body: 'Betting rounds sit between the three draws. Try the buttons — simulation only, no chips move.',
      boardCards: BC_BOARD, boardLabel: 'THE BOARD',
      actions: BETTING_ACTIONS,
    },
    {
      id: 'declare', phase: 'DECLARE', title: 'High, Low, or Swing',
      body: 'After the last draw you declare a side. HIGH plays your ten cards big, LOW plays them small — and SWING means you claim BOTH sides at once. Your hand below is made: A-2-3-4-5-6-7-8-9-10 across the ten.',
      boardCards: [c('2', C), c('5', S), c('7', H), c('9', D), c('10', C)],
      boardLabel: 'THE BOARD',
      heroCards: [c('A', S), c('3', H), c('4', D), c('6', C), c('8', S)],
      heroLabel: 'YOUR HAND — MADE',
      actions: [
        { label: 'HIGH', kind: 'gold', response: 'HIGH: your ten cards play big — the sequence runs  A up to 10. Strong, but another made hand can still out-run it.' },
        { label: 'LOW', kind: 'sky', correct: true, response: 'LOW is this hand\u2019s best side: A-2-3-4-5-6-7-8-9-10 is the lowest ten-card run the game allows — nothing beats it at LOW.' },
        { label: 'SWING', kind: 'neutral', response: 'SWING claims HIGH and LOW together. It only pays if you win BOTH sides outright — no ties. Greedy, and it usually fails on one side.' },
        { label: 'FOLD', kind: 'danger', response: 'FOLD gives up the hand. With a made hand this strong, folding throws away a real chance at the pot.' },
      ],
      note: 'Declaring with a duplicated rank cannot win — the hand is not made, and a made hand beats it on either side.',
    },
    {
      id: 'showdown-win', phase: 'SHOWDOWN', title: 'Why This Hand Wins Low',
      body: 'Both hands are made, both declared LOW. LOW compares from the top card down: your highest card across the ten is a 10, theirs is a Queen. Lowest top card takes it.',
      boardCards: [c('2', C), c('5', S), c('7', H), c('9', D), c('10', C)],
      boardLabel: 'THE BOARD',
      heroCards: [c('A', S), c('3', H), c('4', D), c('6', C), c('8', S)],
      heroLabel: 'YOUR HAND — DECLARED LOW',
      rivalCards: [c('Q', H), c('J', D), c('8', H), c('6', S), c('4', C)],
      rivalLabel: 'OPPONENT — DECLARED LOW',
      rivalNote: 'Their top card is a Queen — too big for LOW.',
      verdict: 'YOU WIN LOW — 10-TOP BEATS QUEEN-TOP', verdictKind: 'win',
    },
    {
      id: 'swing-lose', phase: 'SHOWDOWN', title: 'Why Swing Gets Nothing',
      body: 'You declared SWING and your LOW was the best low at the table — but their HIGH out-ran yours. Swing has to win both sides outright; win one, lose one, and the swing takes nothing. Declare the side you can actually win.',
      boardCards: [c('2', C), c('5', S), c('7', H), c('9', D), c('10', C)],
      boardLabel: 'THE BOARD',
      heroCards: [c('A', S), c('3', H), c('4', D), c('6', C), c('8', S)],
      heroLabel: 'YOUR HAND — DECLARED SWING',
      rivalCards: [c('K', H), c('Q', D), c('J', S), c('8', H), c('6', D)],
      rivalLabel: 'OPPONENT — DECLARED HIGH',
      rivalNote: 'Their high run tops yours.',
      verdict: 'SWING FAILS — BOTH SIDES OR NOTHING', verdictKind: 'lose',
    },
    {
      id: 'recap', phase: 'RECAP', title: 'Box Chevy in One Breath',
      body: 'Five hole cards plus a five-card board: all ten ranks must be different or the hand is dead. Swap only your hole cards, up to 3, then 2, then 1 — the board never moves. Declare HIGH, LOW, or SWING, and remember swing needs both sides outright.',
      verdict: 'NOW YOU KNOW THE GAME', verdictKind: 'info',
    },
  ],
};

// ─── LADY LUCK ───────────────────────────────────────────────────────────────

export const LADY_LUCK_SPEC: TutorialSpec = {
  modeId: 'ladyluck',
  name: 'LADY LUCK',
  color: '#e53935',
  cardVariant: 'classic',
  tagline: 'No hand. Just a suit, a wager, and a race to nine.',
  steps: [
    {
      id: 'race', phase: 'THE RACE', title: 'First Suit to Nine Wins',
      body: 'Lady Luck deals no hand. Cards flip one at a time from the deck, and every flip moves that card\u2019s suit one step forward. The first suit to appear nine times wins the race — and pays everyone who backed it.',
      boardCards: [c('7', H), c('3', S), c('Q', H), c('5', D), c('9', C), c('2', H)],
      boardLabel: 'FLIPPED SO FAR — HEARTS LEAD 3',
      verdict: 'HEARTS 3 · SPADES 1 · DIAMONDS 1 · CLUBS 1', verdictKind: 'info',
    },
    {
      id: 'pick', phase: 'STEP 1 — PICK', title: 'Claim Your Suit',
      body: 'When your turn to pick comes, tap a suit to claim it. Each suit can only be claimed by one player at the table — once hearts are taken, they are gone. Try one:',
      actions: [
        { label: '♠ SPADES', kind: 'suit-dark', response: 'Spades claimed. If spades reach nine first, your wager pays.' },
        { label: '♥ HEARTS', kind: 'suit-red', response: 'Hearts claimed. If hearts reach nine first, your wager pays.' },
        { label: '♦ DIAMONDS', kind: 'suit-red', response: 'Diamonds claimed. If diamonds reach nine first, your wager pays.' },
        { label: '♣ CLUBS', kind: 'suit-dark', response: 'Clubs claimed. If clubs reach nine first, your wager pays.' },
      ],
      note: 'Queens are ordinary race cards — there is no queen suit to pick. The pick order rotates around the table.',
    },
    {
      id: 'wager', phase: 'STEP 2 — WAGER', title: 'Set Your Stake',
      body: 'Every room has its own wager limits. Pony: $100–$500. Thoroughbred: $500–$2,000. Champion: $2,000–$5,000. This table is Pony — pick a wager:',
      actions: [
        { label: '$100', kind: 'neutral', response: '$100 down on your suit. Smallest Pony stake — a cheap seat for the race.' },
        { label: '$300', kind: 'neutral', response: '$300 down. Mid-range Pony stake.' },
        { label: '$500', kind: 'gold', response: '$500 down — the Pony maximum. Full conviction, full sweat.' },
      ],
      note: 'Your wager goes into the pot. Back the winning suit and you get paid from it; lose and the wager is gone.',
    },
    {
      id: 'flips', phase: 'STEP 3 — RACE', title: 'Watch the Flips',
      body: 'Cards turn one at a time and the counts climb in public. Nothing is hidden and there is nothing left to decide — once the race starts, your money rides. Hearts are closing in here.',
      boardCards: [c('7', H), c('3', S), c('Q', H), c('5', D), c('9', C), c('2', H), c('K', S), c('4', H), c('8', C), c('6', H), c('J', D), c('10', H)],
      boardLabel: 'FLIPPED — HEARTS 6 · CLUBS 2 · SPADES 2 · DIAMONDS 2',
      verdict: 'HEARTS NEED 3 MORE', verdictKind: 'info',
    },
    {
      id: 'sidebet', phase: 'SIDE BETS', title: 'A Second Ticket',
      body: 'Side bets are separate from your main wager: bet on ANY suit — even one somebody else claimed — with a smaller cap (Pony max $200). If that suit wins the race, the side bet pays even when your own suit loses.',
      note: 'Main wager first, side bet second. They settle independently at the end of the race.',
    },
    {
      id: 'win', phase: 'RESULTS', title: 'Why You Win',
      body: 'Hearts just flipped their ninth card. The race ends the moment a suit reaches nine — hearts backers get paid from the pot, and a side bet on hearts would have paid too.',
      boardCards: [c('7', H), c('3', S), c('Q', H), c('5', D), c('9', C), c('2', H), c('K', S), c('4', H), c('8', C), c('6', H), c('J', D), c('10', H), c('A', H), c('5', H), c('9', H)],
      boardLabel: 'FINAL — HEARTS 9 · CLUBS 2 · SPADES 2 · DIAMONDS 2',
      verdict: 'HEARTS WIN THE RACE — BACKERS PAID', verdictKind: 'win',
    },
    {
      id: 'lose', phase: 'RESULTS', title: 'Why You Lose',
      body: 'This time clubs sprinted home while hearts stalled at seven. Close does not pay — only the suit that reaches nine first settles up. Your main wager is gone; a side bet on clubs would have saved the race.',
      boardCards: [c('7', H), c('3', C), c('Q', H), c('5', C), c('9', C), c('2', H), c('K', C), c('4', H), c('8', C), c('6', H), c('J', C), c('10', H), c('A', C), c('5', H), c('7', C), c('4', C)],
      boardLabel: 'FINAL — CLUBS 9 · HEARTS 7 · SPADES 0 · DIAMONDS 0',
      verdict: 'CLUBS WIN — HEARTS BACKERS LOSE', verdictKind: 'lose',
    },
    {
      id: 'recap', phase: 'RECAP', title: 'Lady Luck in One Breath',
      body: 'Claim a suit, set a wager inside your room\u2019s limits, then watch cards flip until one suit reaches nine. Optional side bets give you a second suit to root for. No draws, no declarations, no bluffing — just the race.',
      verdict: 'NOW YOU KNOW THE GAME', verdictKind: 'info',
    },
  ],
};

export const TUTORIAL_SPECS: Record<TutorialSpec['modeId'], TutorialSpec> = {
  badugi: BADUGI_SPEC,
  flushedup: FLUSHED_UP_SPEC,
  box_chevy: BOX_CHEVY_SPEC,
  ladyluck: LADY_LUCK_SPEC,
};
