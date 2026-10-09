# Lady Luck bot funding

## Decision

Bot stakes use an on-demand, system-funded house float rather than a permanently finite reserve. Bots retain their ledger accounts and normal wagers/payouts; no chips are fabricated only in table state.

When a bot needs its 10,000-chip stake restored and the house cannot cover the allocation, the funding transaction replenishes the house to 100,000,000 chips. This reuses the existing initial float size. Replenishment can repeat whenever required; it is not a one-time recovery or a retry limit.

Every replenishment records a `ladyluck_bot_funding_subsidy` entry with the before/after balances, exact newly generated amount, table, bot ID, and purpose. Economic audits must include these explicit system grants in aggregate chip supply. They must not expect total supply to be constant across bot-funding subsidies.

## Boundaries

- Only bot rebalancing enables replenishment, for a house-to-bot stake allocation of at most 10,000 chips.
- Ordinary `transferLadyLuckChips` calls cannot trigger replenishment, even if they supply the bot-funding source label.
- Real player transfers, insufficient-player-funds checks, wagering, pots, settlement, side bets, and rake are unchanged.
- A depleted balance alone cannot prevent bot funding. Missing accounts, database outages, and other genuine failures still fail explicitly; the existing lobby retry/warning/exit behavior remains necessary.
- Guest-reset recovery remains a separate, idempotent reversal of recorded historical resets. Startup does not silently replenish legitimate losses.

## Atomicity

Rebalancing locks the house and bot rows in database ID order before reading the bot's balance and calculating the required allocation. It holds those locks through replenishment, transfer, and ledger insertion. Competing requests cannot both calculate and allocate the same missing stake.

The system grant and both transfer ledger entries share one database transaction. An insertion failure rolls all account changes and the grant back.

## Public research and limits

- [Governor of Poker 2 — official site](https://www.governorofpoker.com/games/governor-of-poker-2): documents offline play against AI opponents and an in-game chip economy.
- [Zynga Poker — official terms help page](https://zyngasupport.helpshift.com/hc/en/27-zynga-poker/faq/490-terms-of-service): points to Take-Two's current terms and official virtual-currency purchase guidance.
- [Playtika 2024 annual report](https://www.sec.gov/Archives/edgar/data/1828016/000182801625000011/playtika-20241231.htm): discusses virtual currency and its WSOP social game.

These sources do **not** disclose the proprietary bot-bankroll implementation of Zynga Poker or WSOP. This design is our auditable implementation of the requested system-funded bot pattern, not a claim that those games use this exact mechanism or even server-operated bots.

## Verification

Real PostgreSQL rollback fixtures cover empty/low floats, a complete four-bot lobby from 25,000 chips, exact grant accounting, repeat funding, ordinary transfer isolation, bot sweeps/returns, invalid identities, and transaction rollback on ledger failure. Fixtures route profile-backfill writes into the same transaction and leave no persistent test chip allocations.

No production changes or publish are required to develop/test this logic. It only takes effect in production after an explicitly approved backend publish.
