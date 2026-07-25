# SEO Strategy — Chain Gang Poker

## Site overview
Chain Gang Poker is a premium multiplayer poker platform offering five exclusive game modes (Badugi, Dead 7, 15/35, Suits & Poker) with virtual chips, daily rewards, and a VIP tier system. No real money involved.

## In scope
- Public-facing landing / home page (the SPA shell at `/`)
- Any future public marketing pages

## Out of scope
- Authenticated game rooms and dashboards (SPA routes behind login/guest sessions)
- Admin / internal tooling

## Target audience
- Casual and serious poker players looking for unique variants online
- Mobile gamers (Capacitor iOS/Android builds exist)

## Primary keywords
- Badugi poker online
- Dead 7 poker
- Chain Gang Poker
- Multiplayer poker free (virtual chips)

## Rendering strategy
Pure React + Vite SPA. All routes are client-side rendered. The only HTML Googlebot, social bots, and AI crawlers receive is `client/index.html`. No SSR layer exists.

## Dismissed categories
- (None yet)
