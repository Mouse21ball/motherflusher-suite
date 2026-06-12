import { useState } from 'react';

type HowToPlayModeId = 'badugi' | 'dead7' | '1535' | 'suits';

interface HowToPlayProps {
  modeId: HowToPlayModeId;
  onClose: () => void;
}

type CardSuit = '♠' | '♥' | '♦' | '♣';

interface SlideCard {
  rank: string;
  suit: CardSuit;
}

interface Slide {
  icon: string;
  title: string;
  desc: string;
  cards?: SlideCard[][];
  cardLabels?: string[];
}

// ── Visual card component ─────────────────────────────────────────────────────

function CardDisplay({ cards }: { cards: SlideCard[] }) {
  const suitColor = (suit: string) =>
    suit === '♥' || suit === '♦' ? '#e53935' : '#1a1a2e';
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '4px 0' }}>
      {cards.map((c, i) => (
        <div
          key={i}
          style={{
            width:          48,
            height:         68,
            background:     'white',
            borderRadius:   8,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            boxShadow:      '0 2px 8px rgba(0,0,0,0.5)',
            position:       'relative',
          }}
        >
          <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 13, fontWeight: 'bold', color: suitColor(c.suit), lineHeight: 1 }}>
            {c.rank}
          </span>
          <span style={{ fontSize: 22, color: suitColor(c.suit) }}>
            {c.suit}
          </span>
          <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 13, fontWeight: 'bold', color: suitColor(c.suit), lineHeight: 1, transform: 'rotate(180deg)' }}>
            {c.rank}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Slides data ───────────────────────────────────────────────────────────────

const SLIDES: Record<HowToPlayModeId, Slide[]> = {
  badugi: [
    {
      icon: '🃏',
      title: 'What is Badugi?',
      desc: 'Build a valid 4-card Badugi — all 4 cards must have different suits AND different ranks. The pot splits between the best HIGH Badugi and best LOW Badugi.',
    },
    {
      icon: '✅',
      title: 'Valid Badugi',
      desc: 'All 4 cards — different suits, different ranks. This is a valid Badugi:',
      cards: [
        [
          { rank: '7', suit: '♠' },
          { rank: '3', suit: '♥' },
          { rank: 'J', suit: '♦' },
          { rank: '5', suit: '♣' },
        ],
      ],
      cardLabels: ['Valid Badugi ✓'],
    },
    {
      icon: '❌',
      title: 'Invalid Hands',
      desc: 'Duplicate suit = INVALID. Duplicate rank = INVALID.',
      cards: [
        [
          { rank: '7', suit: '♠' },
          { rank: '3', suit: '♠' },
          { rank: 'J', suit: '♦' },
          { rank: '5', suit: '♣' },
        ],
        [
          { rank: '7', suit: '♠' },
          { rank: '7', suit: '♥' },
          { rank: 'J', suit: '♦' },
          { rank: '5', suit: '♣' },
        ],
      ],
      cardLabels: ['Duplicate suit ❌', 'Duplicate rank ❌'],
    },
    {
      icon: '⬇️',
      title: 'Best LOW Badugi',
      desc: 'Going LOW you want the smallest cards. Best possible LOW Badugi:',
      cards: [
        [
          { rank: 'A', suit: '♠' },
          { rank: '2', suit: '♥' },
          { rank: '3', suit: '♦' },
          { rank: '4', suit: '♣' },
        ],
      ],
      cardLabels: ['Best LOW — A-2-3-4'],
    },
    {
      icon: '⬆️',
      title: 'Best HIGH Badugi',
      desc: 'Going HIGH you want the biggest cards. Best possible HIGH Badugi:',
      cards: [
        [
          { rank: 'K',  suit: '♠' },
          { rank: 'Q',  suit: '♥' },
          { rank: 'J',  suit: '♦' },
          { rank: '10', suit: '♣' },
        ],
      ],
      cardLabels: ['Best HIGH — K-Q-J-10'],
    },
    {
      icon: '🔄',
      title: 'Draw Rounds',
      desc: 'You get 3 draw rounds. Discard cards to improve your Badugi. If you already have a valid Badugi consider staying pat.',
    },
    {
      icon: '⬆️⬇️',
      title: 'Declare HIGH or LOW',
      desc: 'At showdown declare HIGH or LOW. Same hand value = pot splits. Only valid 4-card Badugis compete.',
    },
    {
      icon: '💡',
      title: 'Pro Tip',
      desc: 'Watch how many cards opponents discard. Discarding 3 cards means no Badugi yet. Standing pat means a strong hand. Bluff accordingly.',
    },
  ],
  dead7: [
    {
      icon: '💀',
      title: 'What is Dead 7?',
      desc: 'Build a qualifying 4-card hand with NO 7s and NO duplicate ranks. Any 7 in your hand = DEAD — you are out of the pot.',
    },
    {
      icon: '🏆',
      title: 'Hand Rankings',
      desc: 'Hands rank in this order — all must be HIGH (8-King) or LOW (Ace-6):\n\n1. Flush — all 4 same suit (splits if both HIGH and LOW flush exist)\n2. Badugi — all 4 different suits (splits if both HIGH and LOW Badugi exist)\n3. High Ball vs Low Ball — always splits\n\nCards must ALL be high OR all be low. Never mix. Any 7 = DEAD.',
    },
    {
      icon: '♠️',
      title: 'Flush — Scoops All',
      desc: 'All 4 cards same suit AND all HIGH or all LOW. HIGH and LOW flush split the pot.',
      cards: [
        [
          { rank: 'A',  suit: '♠' },
          { rank: '3',  suit: '♠' },
          { rank: '5',  suit: '♠' },
          { rank: '6',  suit: '♠' },
        ],
        [
          { rank: '8',  suit: '♥' },
          { rank: '10', suit: '♥' },
          { rank: 'Q',  suit: '♥' },
          { rank: 'K',  suit: '♥' },
        ],
      ],
      cardLabels: ['LOW Flush — Ace through 6 same suit', 'HIGH Flush — 8 through King same suit'],
    },
    {
      icon: '🃏',
      title: 'Badugi — HIGH and LOW',
      desc: 'All 4 different suits AND all HIGH or all LOW. Scoops against plain ball hands.',
      cards: [
        [
          { rank: 'A', suit: '♠' },
          { rank: '3', suit: '♥' },
          { rank: '5', suit: '♦' },
          { rank: '6', suit: '♣' },
        ],
        [
          { rank: '8',  suit: '♠' },
          { rank: '10', suit: '♥' },
          { rank: 'Q',  suit: '♦' },
          { rank: 'K',  suit: '♣' },
        ],
      ],
      cardLabels: ['LOW Badugi — Ace through 6', 'HIGH Badugi — 8 through King'],
    },
    {
      icon: '⬆️',
      title: 'High Ball',
      desc: 'All 4 cards must be 8 or higher — no 7s, no duplicate ranks:',
      cards: [
        [
          { rank: '8',  suit: '♠' },
          { rank: '10', suit: '♥' },
          { rank: 'Q',  suit: '♦' },
          { rank: 'K',  suit: '♣' },
        ],
      ],
      cardLabels: ['Valid HIGH Ball — 8 through King'],
    },
    {
      icon: '⬇️',
      title: 'Low Ball',
      desc: 'All 4 cards must be 6 or lower — no 7s, no duplicate ranks. Ace counts as LOW:',
      cards: [
        [
          { rank: 'A', suit: '♠' },
          { rank: '3', suit: '♥' },
          { rank: '5', suit: '♦' },
          { rank: '6', suit: '♣' },
        ],
      ],
      cardLabels: ['Valid LOW Ball — Ace through 6'],
    },
    {
      icon: '❌',
      title: 'Dead Hands — Fold These',
      desc: 'These hands do NOT qualify:',
      cards: [
        [
          { rank: '7', suit: '♠' },
          { rank: '3', suit: '♥' },
          { rank: '9', suit: '♦' },
          { rank: 'K', suit: '♣' },
        ],
        [
          { rank: '8', suit: '♠' },
          { rank: '8', suit: '♥' },
          { rank: 'Q', suit: '♦' },
          { rank: 'K', suit: '♣' },
        ],
        [
          { rank: '4', suit: '♠' },
          { rank: 'K', suit: '♥' },
          { rank: '9', suit: '♦' },
          { rank: '2', suit: '♣' },
        ],
      ],
      cardLabels: ['Has a 7 = DEAD ❌', 'Duplicate rank = INVALID ❌', 'Mixed high and low = INVALID ❌'],
    },
    {
      icon: '🔄',
      title: 'Draw Rounds',
      desc: 'You get 3 draw rounds. Always discard 7s first. Then discard duplicates. Then build toward HIGH or LOW — do not mix.',
    },
    {
      icon: '💡',
      title: 'Pro Tip',
      desc: 'Never hold a 7. Never mix high and low cards — a hand with both 4s and Kings qualifies for nothing. Pick a side and commit.',
    },
  ],
  '1535': [
    {
      icon: '🎲',
      title: 'What is 15/35?',
      desc: 'Get your card total as close to 15 or 35 as possible without going over 35. Pot splits between the closest LOW (13-15) and HIGH (33-35).',
    },
    {
      icon: '🃏',
      title: 'Card Values',
      desc: 'Face cards J Q K are worth 0.5 each. Ace is worth 11 or 1 to avoid busting. Cards 2-10 are face value.',
      cards: [
        [{ rank: 'J', suit: '♠' }, { rank: 'Q', suit: '♥' }, { rank: 'K', suit: '♦' }],
        [{ rank: 'A', suit: '♠' }],
        [{ rank: '7', suit: '♣' }],
      ],
      cardLabels: ['J Q K = 0.5 each', 'Ace = 11 (or 1)', '7 = 7'],
    },
    {
      icon: '👆',
      title: 'Hit or Stay',
      desc: 'Each round choose HIT to take another card or STAY to hold your total. Start with 2 cards and keep hitting to qualify.',
      cards: [
        [{ rank: '4', suit: '♠' }, { rank: '8', suit: '♥' }],
        [{ rank: '4', suit: '♠' }, { rank: '8', suit: '♥' }, { rank: '3', suit: '♦' }],
      ],
      cardLabels: ['4+8=12 too low — HIT', '4+8+3=15 ✓ QUALIFY LOW'],
    },
    {
      icon: '🏆',
      title: 'Qualifying Totals',
      desc: 'LOW qualifies at 13-15. HIGH qualifies at 33-35. Closest to 15 wins LOW. Closest to 35 wins HIGH. Same total = split pot.',
    },
    {
      icon: '❌',
      title: 'Non-Qualifying Hands',
      desc: 'These totals do NOT qualify — keep hitting or you lose that side:',
      cards: [
        [{ rank: '5', suit: '♠' }, { rank: '4', suit: '♥' }, { rank: '2', suit: '♦' }],
        [{ rank: '2', suit: '♠' }, { rank: '3', suit: '♥' }],
      ],
      cardLabels: ['5+4+2=11 too low — keep hitting', '2+3=5 way too low — keep hitting'],
    },
    {
      icon: '💥',
      title: 'Busting',
      desc: 'Go over 35 and you BUST — you lose your chips for that hand. Know when to stay.',
      cards: [
        [
          { rank: '9', suit: '♠' },
          { rank: '8', suit: '♥' },
          { rank: '7', suit: '♦' },
          { rank: '7', suit: '♣' },
          { rank: '6', suit: '♦' },
        ],
      ],
      cardLabels: ['9+8+7+7+6=37 BUST ❌'],
    },
    {
      icon: '💡',
      title: 'Pro Tip',
      desc: 'Face cards worth 0.5 each are your best friends — they barely move your total. Stack them to creep toward 15 or 35 without busting.',
    },
  ],
  suits: [
    {
      icon: '♠️♥️',
      title: 'What is Suits & Poker?',
      desc: 'Two ways to win — POKER (best 5-card hand) or SUITS (highest single-suit score of 40+). Pot splits 50/50 between best poker hand and best suits score.',
    },
    {
      icon: '🃏',
      title: 'How SUITS Scoring Works',
      desc: 'Add up all cards of your strongest suit. Need 40 or more to qualify. Ace=11 face cards=10 others face value.',
      cards: [
        [
          { rank: 'A', suit: '♥' },
          { rank: 'K', suit: '♥' },
          { rank: 'Q', suit: '♥' },
          { rank: 'J', suit: '♥' },
        ],
      ],
      cardLabels: ['A(11)+K(10)+Q(10)+J(10)=41 ✓ Qualifies'],
    },
    {
      icon: '❌',
      title: 'SUITS Not Qualifying',
      desc: 'Score below 40 = does not qualify. Declare POKER instead.',
      cards: [
        [
          { rank: '5', suit: '♥' },
          { rank: '3', suit: '♥' },
          { rank: '2', suit: '♥' },
          { rank: 'A', suit: '♥' },
        ],
      ],
      cardLabels: ['5+3+2+11=21 ✗ Does not qualify'],
    },
    {
      icon: '🃏',
      title: 'Poker Hand Rankings',
      desc: 'Best 5-card hand from your hole cards and community cards:\n\n1. Royal Flush\n2. Straight Flush\n3. Four of a Kind\n4. Full House\n5. Flush\n6. Straight\n7. Three of a Kind\n8. Two Pair\n9. Pair\n10. High Card',
    },
    {
      icon: '👑',
      title: 'Royal Flush — Best Hand',
      desc: 'Royal Flush is the best poker hand AND scores 51 suit points — the perfect SWING hand.',
      cards: [
        [
          { rank: 'A',  suit: '♠' },
          { rank: 'K',  suit: '♠' },
          { rank: 'Q',  suit: '♠' },
          { rank: 'J',  suit: '♠' },
          { rank: '10', suit: '♠' },
        ],
      ],
      cardLabels: ['Royal Flush — A+K+Q+J+10 = 51 suit points'],
    },
    {
      icon: '🎯',
      title: 'SWING Declaration',
      desc: 'Declare SWING to compete for BOTH sides. You must have the highest suit score AND the best poker hand to scoop the entire pot. Fail either side — you win nothing.',
    },
    {
      icon: '⚠️',
      title: 'SWING Risk',
      desc: 'Failed SWING = you get nothing even if your poker hand would have won. Only SWING when you have a strong poker hand AND a suits score of 40 or higher.',
    },
    {
      icon: '🔄',
      title: 'Draw Phase',
      desc: 'You can swap up to 2 hole cards before betting begins. Use the draw to improve your poker hand or build a stronger suit score.',
    },
    {
      icon: '💡',
      title: 'Pro Tip',
      desc: 'A Royal Flush scores 51 suit points and is the best poker hand. If you have one always SWING — it is the strongest possible hand in the entire game.',
    },
  ],
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MODE_COLORS: Record<HowToPlayModeId, string> = {
  badugi: '#4CAF50',
  dead7:  '#f44336',
  '1535': '#C9A227',
  suits:  '#2196F3',
};

const MODE_NAMES: Record<HowToPlayModeId, string> = {
  badugi: 'BADUGI',
  dead7:  'DEAD 7',
  '1535': '15 / 35',
  suits:  'SUITS & POKER',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function HowToPlay({ modeId, onClose }: HowToPlayProps) {
  const [slide, setSlide] = useState(0);
  const slides  = SLIDES[modeId];
  const color   = MODE_COLORS[modeId];
  const name    = MODE_NAMES[modeId];
  const total   = slides.length;
  const current = slides[slide];
  const isLast  = slide === total - 1;
  const hasCards = !!(current.cards && current.cards.length > 0);

  return (
    <div
      data-testid="modal-how-to-play"
      style={{
        position:      'fixed',
        inset:         0,
        background:    'rgba(0,0,0,0.92)',
        zIndex:        100,
        display:       'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
          <span
            data-testid="text-how-to-play-mode-name"
            style={{ fontFamily: 'Anton, Impact, "Arial Narrow Bold", sans-serif', fontSize: 20, color, letterSpacing: '1px' }}
          >
            {name}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            data-testid="text-slide-counter"
            style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}
          >
            {slide + 1} of {total}
          </span>
          <button
            data-testid="button-how-to-play-skip"
            onClick={onClose}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 20, padding: '5px 14px', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.55)', cursor: 'pointer', letterSpacing: '0.06em' }}
          >
            SKIP
          </button>
        </div>
      </div>

      {/* Slide dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px 0 0' }}>
        {slides.map((_, i) => (
          <div
            key={i}
            style={{
              width:        i === slide ? 18 : 6,
              height:       6,
              borderRadius: 3,
              background:   i === slide ? color : 'rgba(255,255,255,0.18)',
              transition:   'all 0.25s',
            }}
          />
        ))}
      </div>

      {/* Slide content */}
      <div
        style={{
          flex:           1,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '16px 24px 8px',
          textAlign:      'center',
          overflowY:      'auto',
        }}
      >
        {/* Icon — smaller when cards are present */}
        <div
          data-testid="text-slide-icon"
          style={{
            fontSize:     hasCards ? 44 : 64,
            marginBottom: hasCards ? 10 : 16,
            lineHeight:   1,
            filter:       `drop-shadow(0 0 24px ${color}66)`,
          }}
        >
          {current.icon}
        </div>

        {/* Title */}
        <div
          data-testid="text-slide-title"
          style={{
            fontFamily:    'Anton, Impact, "Arial Narrow Bold", sans-serif',
            fontSize:      22,
            fontWeight:    'bold',
            color:         'white',
            marginBottom:  10,
            letterSpacing: '0.5px',
          }}
        >
          {current.title}
        </div>

        {/* Description */}
        <div
          data-testid="text-slide-desc"
          style={{
            fontSize:   15,
            color:      'rgba(255,255,255,0.80)',
            lineHeight: 1.6,
            maxWidth:   320,
            whiteSpace: 'pre-line',
            marginBottom: hasCards ? 10 : 0,
          }}
        >
          {current.desc}
        </div>

        {/* Card hands */}
        {current.cards && current.cards.map((hand, i) => (
          <div key={i} style={{ width: '100%', maxWidth: 320 }}>
            {current.cardLabels?.[i] && (
              <div style={{
                fontFamily:    'monospace',
                fontSize:      11,
                color:         'rgba(255,255,255,0.50)',
                letterSpacing: '0.06em',
                marginTop:     i === 0 ? 0 : 14,
                marginBottom:  6,
              }}>
                {current.cardLabels[i]}
              </div>
            )}
            <CardDisplay cards={hand} />
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div
        style={{
          display:        'flex',
          flexDirection:  'row',
          justifyContent: 'space-between',
          alignItems:     'center',
          padding:        '0 24px 40px',
          gap:            16,
        }}
      >
        <button
          data-testid="button-how-to-play-back"
          onClick={() => setSlide(s => Math.max(0, s - 1))}
          disabled={slide === 0}
          style={{
            background:    'none',
            border:        `1px solid ${slide === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)'}`,
            borderRadius:  24,
            padding:       '12px 32px',
            fontFamily:    'monospace',
            fontWeight:    800,
            fontSize:      13,
            color:         slide === 0 ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)',
            cursor:        slide === 0 ? 'default' : 'pointer',
            letterSpacing: '0.04em',
            transition:    'all 0.15s',
          }}
        >
          ← BACK
        </button>

        <button
          data-testid={isLast ? 'button-how-to-play-finish' : 'button-how-to-play-next'}
          onClick={() => isLast ? onClose() : setSlide(s => s + 1)}
          style={{
            background:    color,
            border:        'none',
            borderRadius:  24,
            padding:       '12px 32px',
            fontFamily:    'monospace',
            fontWeight:    800,
            fontSize:      13,
            color:         'white',
            cursor:        'pointer',
            letterSpacing: '0.04em',
            boxShadow:     `0 0 20px ${color}66`,
            transition:    'all 0.15s',
          }}
        >
          {isLast ? "LET'S PLAY →" : 'NEXT →'}
        </button>
      </div>
    </div>
  );
}
