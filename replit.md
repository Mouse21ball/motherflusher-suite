# Chain Gang Poker

Chain Gang Poker is a premium poker platform offering five exclusive multiplayer game modes with virtual chips.

## Run & Operate

- **Run**: `npm run dev` (frontend) / `npm run start` (backend)
- **Build**: `npm run build`
- **Typecheck**: `npm run typecheck`
- **DB Push**: `npm run db:push` (for schema changes)

**Required Environment Variables**:
- `BADUGI_ALPHA_ENABLED=true` (enables server-authoritative mode for all games)
- `VITE_API_BASE_URL` (for mobile builds, absolute backend URL)
- `VITE_SHARE_ORIGIN` (for mobile builds, base URL for invite links)

## Stack

- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui, wouter
- **Backend**: Express, WebSocket (ws)
- **Database**: PostgreSQL (via Prisma ORM)
- **ORM**: Prisma
- **Validation**: _Populate as you build_
- **Build Tool**: Vite

## Where things live

- `client/` - Frontend React application
- `server/` - Backend Express and WebSocket server
- `shared/` - Shared types, utilities, and game mode definitions
- `prisma/schema.prisma` - Database schema definition
- `shared/gameTypes.ts` - All TypeScript types (GameState, Player, GameMode, etc.)
- `shared/modes/` - Server-side game mode logic
- `client/src/lib/dailyReward.ts` - Daily reward logic
- `client/src/lib/retention.ts` - Hourly bonus, starter pack, VIP logic
- `client/src/pages/BonusCenter.tsx` - Bonus center UI
- `client/src/pages/AuthModal.tsx` - Authentication UI
- `client/src/lib/sounds.ts` - Sound effects
- `client/src/lib/apiConfig.ts` - API URL helpers for Capacitor
- `index.css` - Core styling, including CSS 3D and premium visual polish

## Architecture decisions

- **Server-authoritative game engines**: Critical game logic for all modes runs on the server to prevent cheating and ensure fair play, with client-only fallbacks for development.
- **Unified 3D table**: A single `ThreeDTableScene.tsx` component renders all game modes in a consistent 3D environment, simplifying UI development and maintenance.
- **Guest-first authentication with optional upgrade**: Players can start as guests with persistence via `localStorage` and later link their progress to an email/password account.
- **Shared bankroll across modes**: A single chip balance persists for a player across all game modes, stored in the database.
- **App Store Compliance Focus**: Extensive measures implemented for "virtual chips only," no real money, age gating, privacy, and account deletion to meet App Store requirements.

## Product

Chain Gang Poker offers four distinct poker game modes: Badugi, Dead 7, 15 / 35, and Suits & Poker. It includes a comprehensive retention system with daily rewards, hourly bonuses, a starter pack, and a VIP tier system, all utilizing virtual chips. Players can track their progress, achievements, and statistics, and interact via chat and reactions. The game also features a cosmetic merch shop (without payment integration) and comprehensive App Store compliance.

## User preferences

- _Populate as you build_

## Gotchas

- **Raise Cap**: A hard cap of 3 raises per betting round (4 heads-up) is enforced for both bots and human players.
- **Chip Synchronization**: Player chips are synced to the database at the end of every hand and upon disconnection. `lastChipSyncHand` is seeded to `table.handId` at join-time so a pre-hand-end disconnect never overwrites the DB with a placeholder 1000.
- **Bonus Chips**: Daily reward, hourly bonus, and starter pack all call `POST /api/players/:id/bonus-chips` to persist the DB bankroll in addition to `localStorage`. Without this, bonuses were silently lost on refresh.
- **Server-Restart Reconnects**: On reconnect where `sessionStats` are absent (server restarted), chips are reloaded from DB if the table phase is `WAITING` or `ANTE`. Mid-hand reconnects trust live table chips.
- **Mobile Invite Links**: Ensure `VITE_SHARE_ORIGIN` is correctly set for Capacitor builds to prevent broken invite links.
- **Server Mode**: `BADUGI_ALPHA_ENABLED=true` must be set to enable server-authoritative multiplayer for all game modes.
- **Mother Flusher**: The Mother Flusher (Swing Poker) game mode has been removed and is not accessible, though some related code files remain.
- **Emote Unlock Badge**: `cgp_emotes_just_unlocked` localStorage key is written by StarterPackModal and consumed once by ReactionBar to show a "Emotes unlocked" tooltip.

## Pointers

- **React Docs**: `https://react.dev/`
- **Tailwind CSS Docs**: `https://tailwindcss.com/docs`
- **Prisma Docs**: `https://www.prisma.io/docs/`
- **Capacitor Docs**: `https://capacitorjs.com/docs`
- **WebSocket (ws) Docs**: `https://github.com/websockets/ws`
- **shadcn/ui Docs**: `https://ui.shadcn.com/docs`