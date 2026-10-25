// Bot seat funding pins (chipstrace MVJEJZ7F, 2026-10-22): a bot
// converting onto seat p1 inherited the template's chips: 0 and
// broadcast 0 for the whole pre-hand window until the hand-start sync
// restocked it. The fix funds bots at LOBBY conversion with the same
// 10,000 the sync guarantees — value-neutral by construction. The
// mid-hand takeover conversions must NOT be funded: a bot inheriting
// a live seat keeps its real stack, including a legitimate all-in 0.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const engine = readFileSync('server/genericEngine.ts', 'utf8');

describe('Bot seat funding (generic engine)', () => {
  it('the funded-conversion wrapper exists and floors only a 0 stack', () => {
    expect(engine).toContain('function makeFundedBotPlayer(');
    expect(engine).toContain('return bot.chips > 0 ? bot : { ...bot, chips: 10000 };');
  });

  it('all three lobby conversions use the funded wrapper', () => {
    expect(engine.match(/makeFundedBotPlayer\(p, getBotName/g)?.length).toBe(3);
  });

  it('mid-hand takeovers still use the raw conversion (stack preserved)', () => {
    // Leave handoff + disconnect handoff: exactly the two remaining
    // raw makeBotPlayer calls ('makeFundedBotPlayer' does not contain
    // the substring 'makeBotPlayer', so this counts raw sites only).
    expect(engine.match(/makeBotPlayer\(p, getBotName/g)?.length).toBe(2);
  });

  it('the seat template still starts p1 unfunded (human wallet path owns it)', () => {
    expect(engine).toContain("{ id: 'p1', name: 'Open', presence: empty,   chips: 0,");
  });
});
