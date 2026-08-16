---
name: Unit test design gotchas for Chain Gang modes
description: Non-obvious constraints discovered while writing Vitest tests for Bonecrusher, BoxChevy, Kamikaze, SuitsPoker.
---

## Kamikaze — Ace is 1 for low
`lowRv('A')` returns 1, not 14. A-K-Q hand has lowRanks=[1,12,13] and wins LOW over 2-3-4 (lowRanks=[2,3,4]) because Ace=1 < 2. Tests expecting "2-3-4 wins low over A-K-Q" will fail.

## Bonecrusher — sole LOW declarer wins FULL pot
When `hasHigh === false` (no HIGH or SWING declarers at all), the code's `else` branch awards the entire pot to the LOW winner — NOT just the LOW half. If there is exactly one active declarer, they hit the "last one standing" path and also win everything. Tests expecting a 50/50 split when only LOW is contested will fail.

## Bonecrusher / BoxChevy — best-5-from-10 low evaluation wipes out "pair" advantage
The low evaluator picks the optimal 5-card ace-to-five low from ALL available cards. A hand like A-A-2-3-4-5 can always pick A-2-3-4-5 (wheel) by dropping one Ace — same as a pure A-2-3-4-5 hand. Use cards with no low ranks at all (e.g. K-Q-J-10-9-8) as the "weak low" comparator.

## SuitsPoker PATH isolation — center suit diversity
Both PATH_A and PATH_B include ALL center cards (indices 6–14). If center has ≥5 cards of the same suit, BOTH paths qualify for that suit, breaking the "Side A only / Side B only" isolation test. Keep each suit's center count ≤3. Put differentiating cards only in Side A (indices 0–2) or Side B (indices 3–5).

## SuitsPoker — community with face-card hearts enables royal flush for any player
If community contains A♥ K♥ Q♥ J♥ 10♥, any player with 0 hole cards or any suit of hole cards can combine community cards to form a Royal Flush in hearts. Use low hearts (2♥–6♥) in community if you want only a suits qualification signal without polluting poker hand strengths.

## SuitsPoker — full rollover is essentially unreachable in normal play
The `!pokerW.length && !suitsW.length` rollover path after SWING removal requires all non-SWING POKER declarers to have `pokerValue=0`. With 15 community cards, every player always evaluates a valid poker hand. The only practical rollover is the early-exit `active.length === 0` path (no declarations at all).
