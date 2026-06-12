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
      desc: 'Build the best 4-card hand with all different suits AND all different ranks. The pot splits between the best HIGH and LOW Badugi.',
    },
    {
      icon: '🃏',
      title: 'Valid Badugi Example',
      desc: 'All 4 different suits ✓  All 4 different ranks ✓',
      cards: [
        [
          { rank: '2',  suit: '♠' },
          { rank: '5',  suit: '♥' },
          { rank: '9',  suit: '♦' },
          { rank: 'K',  suit: '♣' },
        ],
      ],
    },
    {
      icon: '⬆️⬇️',
      title: 'HIGH vs LOW Badugi',
      desc: 'Declare HIGH for big cards or LOW for small cards at showdown.',
      cards: [
        [
          { rank: 'A',  suit: '♠' },
          { rank: '2',  suit: '♥' },
          { rank: '3',  suit: '♦' },
          { rank: '4',  suit: '♣' },
        ],
        [
          { rank: 'J',  suit: '♠' },
          { rank: 'Q',  suit: '♥' },
          { rank: 'K',  suit: '♦' },
          { rank: '10', suit: '♣' },
        ],
      ],
      cardLabels: ['LOW Hand — small cards:', 'HIGH Hand — big cards:'],
    },
    {
      icon: '🔄',
      title: 'Draw Rounds',
      desc: 'You get 3 draw rounds. Discard cards to try to improve your hand. The fewer cards you discard the stronger your position looks.',
    },
    {
      icon: '🏆',
      title: 'Winning',
      desc: 'Pot splits 50/50 between the best HIGH Badugi and best LOW Badugi. No valid Badugi on either side — pot rolls over to the next hand.',
    },
    {
      icon: '💡',
      title: 'Pro Tip',
      desc: 'Watch what other players discard. If everyone is drawing many cards nobody has a strong Badugi yet. Bluffing is powerful here.',
    },
  ],
  dead7: [
    {
      icon: '💀',
      title: 'What is Dead 7?',
      desc: 'Build a qualifying 4-card hand with NO 7s and NO duplicate ranks. Any 7 in your hand means you are DEAD — out of the pot.',
    },
    {
      icon: '⬆️',
      title: 'Hand Rankings',
      desc: 'Hands rank in this order:\n\n1. Flush — scoops ENTIRE pot\n2. Badugi — scoops if others only have balls\n3. High Ball (all cards 8-King)\n4. Low Ball (all cards Ace-6)\n\nAny 7 = DEAD. Pot splits between HIGH and LOW if no flush or Badugi.',
    },
    {
      icon: '⬇️',
      title: 'LOW Ball Hand',
      desc: 'All 4 cards must be 6 or lower — no 7s, no duplicate ranks.',
      cards: [
        [
          { rank: 'A',  suit: '♠' },
          { rank: '3',  suit: '♥' },
          { rank: '5',  suit: '♦' },
          { rank: '6',  suit: '♣' },
        ],
      ],
      cardLabels: ['Valid LOW Ball:'],
    },
    {
      icon: '♠️',
      title: 'Flush Scoops All',
      desc: 'A Flush (all same suit) beats everything and wins the whole pot. A Badugi (all different suits) beats a plain ball.',
      cards: [
        [
          { rank: '2',  suit: '♠' },
          { rank: '5',  suit: '♠' },
          { rank: '9',  suit: '♠' },
          { rank: 'K',  suit: '♠' },
        ],
        [
          { rank: '2',  suit: '♠' },
          { rank: '5',  suit: '♥' },
          { rank: '9',  suit: '♦' },
          { rank: 'K',  suit: '♣' },
        ],
      ],
      cardLabels: ['Flush (scoops entire pot):', 'Badugi (beats plain ball):'],
    },
    {
      icon: '🏆',
      title: 'Winning',
      desc: 'Declare HIGH or LOW at showdown. Pot splits between the best HIGH and best LOW hand. No qualifiers on a side — that half rolls over.',
    },
    {
      icon: '💡',
      title: 'Pro Tip',
      desc: 'Never hold a 7. Discard it immediately every time. Then focus on building all HIGH or all LOW — mixing ranks from both sides leaves you with nothing.',
    },
  ],
  '1535': [
    {
      icon: '🎲',
      title: 'What is 15/35?',
      desc: 'Get your card total as close to 15 or 35 as possible without going over 35. The pot splits between the closest LOW (13-15) and HIGH (33-35).',
    },
    {
      icon: '🃏',
      title: 'Card Values',
      desc: 'Face cards are only worth 0.5 each — great for not busting. Ace = 11 (or 1 to avoid busting). All others are face value.',
      cards: [
        [{ rank: 'J', suit: '♠' }, { rank: 'Q', suit: '♥' }, { rank: 'K', suit: '♦' }],
        [{ rank: 'A', suit: '♠' }],
        [{ rank: '7', suit: '♣' }],
      ],
      cardLabels: ['J, Q, K = 0.5 each', 'Ace = 11 (or 1)', '7 = 7'],
    },
    {
      icon: '👆',
      title: 'Hitting Toward LOW (15)',
      desc: 'Start with 2 cards. Keep hitting to reach 13-15. Going over 35 means you BUST.',
      cards: [
        [{ rank: '4', suit: '♠' }, { rank: '8', suit: '♥' }],
        [{ rank: '4', suit: '♠' }, { rank: '8', suit: '♥' }, { rank: '3', suit: '♦' }],
      ],
      cardLabels: ['Start: 4 + 8 = 12 (too low, HIT)', 'After HIT: 4 + 8 + 3 = 15 ✓ QUALIFY LOW'],
    },
    {
      icon: '💥',
      title: 'The Ace is Special',
      desc: 'Ace counts as 11 normally but switches to 1 automatically if it saves you from busting.',
      cards: [
        [{ rank: 'A', suit: '♠' }, { rank: 'K', suit: '♥' }, { rank: 'Q', suit: '♦' }],
        [{ rank: 'A', suit: '♠' }, { rank: '9', suit: '♥' }, { rank: '8', suit: '♦' }, { rank: '7', suit: '♣' }],
      ],
      cardLabels: ['A(11) + K(0.5) + Q(0.5) = 12 — HIT safely', 'A(1) + 9 + 8 + 7 = 25 — Ace saved you from busting'],
    },
    {
      icon: '🏆',
      title: 'Qualifying',
      desc: 'LOW qualifies at total 13-15. HIGH qualifies at total 33-35. Pot splits between the best LOW and best HIGH. No qualifiers — pot rolls over.',
    },
    {
      icon: '💡',
      title: 'Pro Tip',
      desc: 'Face cards (0.5 each) are your best friends — they barely move your total. Stack them to creep toward 15 or 35 without busting.',
    },
  ],
  suits: [
    {
      icon: '♠️♥️',
      title: 'What is Suits & Poker?',
      desc: 'Two paths to win — POKER (best standard hand) or SUITS (highest single-suit score). The pot splits 50/50 between the best of each.',
    },
    {
      icon: '🃏',
      title: 'Community Cards',
      desc: 'You get 5 hole cards. Community cards are revealed in stages across two paths — Side A and Side B. You combine your hole cards with either path.',
    },
    {
      icon: '♠️',
      title: 'SUITS Path',
      desc: 'Add up all cards of your strongest suit. Need a score of 40 or higher to qualify. Ace=11, face cards=10, others face value.',
    },
    {
      icon: '🃏',
      title: 'POKER Path',
      desc: 'Best standard 5-card poker hand wins — Royal Flush down to High Card. Use your hole cards plus either community path.',
    },
    {
      icon: '🎯',
      title: 'SWING Declaration',
      desc: 'Declare SWING to compete for BOTH paths at once. Win both the POKER and SUITS comparison and you scoop the entire pot. Fail either side and you lose everything.',
    },
    {
      icon: '💡',
      title: 'Pro Tip',
      desc: 'SWING is high risk high reward. Only declare SWING if you have both a strong poker hand AND a qualifying suit score of 40+. Otherwise pick the path you are stronger in.',
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
