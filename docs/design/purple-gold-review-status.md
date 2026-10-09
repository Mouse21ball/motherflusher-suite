# Purple + gold reskin — review status

Branch: `design/purple-gold-yard-reskin`. Do not merge or publish automatically.

## Implemented
- Four illustrated Home cards, bundled fonts and yard backdrop.
- Shared translucent, chained TableBoard for Badugi, Flushed Up and Box Chevy.
- Missions presentation using the existing daily and career data and claim handlers.
- My Chips presentation, inline existing daily calendar, hourly banner and approved Stripes products.
- Four decorative pack images; no new consumable products or billing changes.
- Lady Luck race UI is unchanged.

## Verification and remaining blockers
- Typecheck and production build pass.
- Full unit suite: 578 passed, 2 integration tests skipped.
- Phone/iPad-width surface and shared-table browser checks pass.
- Existing zero-wallet viewing, paid-all-in draw/declare, Box Chevy validity, card selection, reward analytics and betting-control checks passed.
- **Not ready for sign-off:** four checks in `tests/browser/tableDealAnimations.spec.ts` failed in the latest full browser run: destination geometry, animator unmount, same-phase updates and seat removal. Flight elements disappeared before those checks completed. The precise cause is not confirmed; do not assume it is only runner timing.
- Phone table spacing was separated visually; narrow-phone card hit areas must remain a release gate, not just card-container visibility.
- Actual iOS/Android device QA has not been performed in this Linux workspace.

## Data constraints
- The existing API supplies daily quests and career milestones, not weekly missions. The weekly section honestly shows an empty state; no reset or reward logic was invented.
- The existing state does not supply a distinct opponent-offline deadline. No disconnected-player timer or socket protocol was fabricated.
- Preserve the iOS release hold and all backend publishing restrictions.
