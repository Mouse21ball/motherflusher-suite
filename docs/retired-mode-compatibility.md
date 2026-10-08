# Retired-mode compatibility and publication hold

## Server contract

The five retired games are rejected without restoring game mechanics:
`dead7`, `fifteen35`, `suitspoker`, `kamikaze`, `bonecrusher`.
The old Suits Poker engine wire alias `suits_poker` is rejected too.
Unrelated unknown IDs retain their existing handling.

The player-facing text is:

> This game mode has been retired. Please update the app to continue.

HTTP table creation, public matching and buy-in requests return status **410**
with `code: "MODE_RETIRED"`, `reason: "mode-retired"`, `modeId`,
`message`, `error` (both containing that text), and `updateRequired: true`.

Authenticated WebSocket joins receive two frames, in order:

1. `mode:init`, with `accepted: false`, the retirement metadata, the requesting
   player's session ID, role `player`, and an empty WAITING state.
2. `error`, with the retirement metadata and readable message.

The first frame is strictly a display-only compatibility handshake. Old iOS
`useServerMode` discards error text before initialization. Sending only a new
error code or `mode:error` does not solve that problem. Role `player` is needed
because the old generic UI suppresses its error banner for spectators.

No room, seat, bot, betting timer, hand or active-table record is created, and
no wallet balance is read or modified. Subsequent actions on the rejected socket
receive the same error. An acknowledged leave succeeds without settling funds.
The generic engine entry point also rejects retired IDs when called directly.

## Verified behavior and remaining limitation

Real WebSocket handler tests cover all five IDs and the Suits Poker alias,
including no wallet/seat side effects, rejected rebuys, and leaving.
HTTP tests cover all three request paths. Existing rebuy and buy-in tests remain
part of the verification.

The optional Playwright archived-bundle test renders the locally copied native
web assets, not recreated approximations. It does not invoke `cap sync`.
These native assets are not proof of the exact binaries currently distributed
as Android vc28 and iOS build 13.

- Archived iOS UI: all five game screens can show the retirement error banner
  after the rejection handshake, tested at an iPad-sized browser viewport.
- Archived Android UI: Bonecrusher forwards and displays the error. Dead 7,
  Fifteen-Thirty-Five, Suits Poker and Kamikaze omit forwarding `actionError`
  to their rendered screens. Those screens receive the rejection but cannot
  display its error banner. This cannot be fixed solely by changing error
  payloads on the server.

The tests explicitly verify both the working banners and the archived Android
limitation; passing tests do **not** mean all installed clients are covered.
If archived assets are absent, these optional bundle tests skip.

## Release gate

**Do not publish yet.** Verify the exact vc28/build-13 packages before treating
this shim as safe for every installed client. If vc28 has the same missing error
propagation, decide on an app update or another rollout strategy with the owner.
Do not send fake showdown/payout state or reintroduce retired games to force a
banner onto a client that does not render errors.

The additive analytics migration and production test-event write remain
unperformed until the owner authorizes publication.
