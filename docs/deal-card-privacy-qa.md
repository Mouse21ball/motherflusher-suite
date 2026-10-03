# Face-up deal flash: privacy diagnosis

## Classification

Client animation/rendering defect, not a demonstrated opponent hole-card leak.
The flight was showing a **real card belonging to the current player**, not a
generic/placeholder card face. The server intentionally sends owners their own
cards. A real hero card showing over the deck during travel looks like a leak
even though that recipient is authorized to know it.

## Evidence

- `TableDealAnimator` previously passed the hero event's real card to
  `PlayingCard` during flight; opponents were passed `undefined` (card back).
- `deriveTableDealEvents` previously included real card data only for the hero.
- `AnimatedCard` previously used the real resolved card in both its idle and
  deal/draw branches. There is no placeholder red-suit face or lazy-loaded
  card-face sprite in `PlayingCard`: face ranks/suits are rendered directly as
  text and SVG; only backs use an image.
- Both `gameEngine.maskStateForPlayer` and
  `genericEngine.maskStateForPlayer` replace nonpublic opponents' cards with
  `{ isHidden: true }`, without rank/suit, before JSON serialization. The deck
  is empty on the wire. Spectators receive all private cards as backs.
- Regression tests serialize these server views during ANTE, DEAL, and BET_1
  for both owners and spectators, using red-suited real cards. Intentionally
  public cards and showdown reveals remain unchanged.

The original physical-device flash was not captured in a device video or
packet recording. This conclusion identifies and reproduces the face-up
rendering path in current source; it does not claim a comprehensive security
audit of every unrelated message or game mode.

## Correction and coverage

- Table flight events contain no card identities, including the hero's.
- All table flights and shared deal/draw flights render only card backs.
- Deal tracking, destination hiding, and shared animation flags are applied
  before browser paint to avoid a one-frame face flash.
- Authorized card faces appear at their destinations after the animation.
- Browser coverage samples painted flight frames, verifies there are no faces
  or rank text during travel, and confirms the hero face returns afterward.
- Shared cards remain selectable while their animation flags are active.
- Existing interruption, geometry-change, unmount, and same-phase tests remain
  part of the full suite.