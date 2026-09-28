# CLAUDE.md

Chain Gang Poker (repo: motherflusher-suite): a multiplayer poker app that uses virtual chips only. It ships on the web and as iOS/Android apps through Capacitor.

## Stack

- **Language:** TypeScript (Node 20 in CI, `"type": "module"`)
- **Frontend:** React 19, Vite 7, Tailwind CSS 4, shadcn/ui (Radix), wouter, TanStack Query, framer-motion (`client/`)
- **Backend:** Express 5 + WebSocket (`ws`), server-authoritative game engines (`server/`)
- **Shared code:** game types, mode logic, evaluator, DB schema (`shared/`, alias `@shared`)
- **Database:** PostgreSQL with **Drizzle ORM** (`shared/schema.ts`, `drizzle.config.ts`, `migrations/`). Note: `replit.md` says Prisma. That is out of date.
- **Mobile:** Capacitor (`android/`, `ios/`, `capacitor.config.ts`). iOS builds run through Codemagic (`codemagic.yaml`).
- **Payments/IAP:** `cordova-plugin-purchase`, `@googleapis/androidpublisher`, `server/billing.ts`
- **Tests:** Vitest (unit/integration), Playwright (browser animation checks)

## Commands

| What | Command |
|---|---|
| Install deps | `npm ci --include=dev` |
| Dev server (full stack, port 5000) | `npm run dev` (needs `BADUGI_ALPHA_ENABLED=true` for server-authoritative mode) |
| Dev client only | `npm run dev:client` |
| Production build | `npm run build` (runs `script/build.ts`: Vite client and esbuild server into `dist/`) |
| Start production build | `npm start` |
| Typecheck | `npm run check` |
| Unit/integration tests | `npm test` (Vitest, runs `tests/**/*.test.ts`) |
| Single test file | `npx vitest run tests/<file>.test.ts` |
| Browser tests | `npm run test:browser` (Playwright, `tests/browser/*.spec.ts`; starts Vite on port 4173 itself) |
| DB schema push | `npm run db:push`. **Changes the live DB. Ask first.** |

**Full suite = `npm run check && npm test && npm run test:browser`.** CI (`.github/workflows/browser-animation-checks.yml`) runs exactly these three on every PR.

Notes:
- `npm test` only picks up `tests/**/*.test.ts`. Tests in `server/__tests__/` are **not** in the default run. Run them explicitly with `npx vitest run --dir server/__tests__` (or by file path) when touching server engine code.
- Put new tests in `tests/` as `<name>.test.ts` so the default suite and CI pick them up.
- In the cloud sandbox, use the pre-installed Chromium for Playwright. Do not run `playwright install`.

## Standing rules for every task

1. **One task at a time.** Do only what the task asks. No refactors, renames, or "while I was here" cleanups outside the task.
2. **Don't ask me to choose between options.** Make the best call and keep building. **Only stop and ask** when something:
   - costs money (paid services, new subscriptions, paid API usage),
   - changes pricing, IAP products/prices, or chip economy numbers (buy-ins, bonuses, rewards, payouts, packs), or
   - is irreversible (dropping data, destructive DB migrations/`db:push`, deleting user accounts, force-pushing, publishing a store release).
3. **Tests for every change.** Write or update automated tests for every change. Run the full suite and report the result as **"X tests, Y failures"**. Never hand back broken code. If something can't be run in the environment, say so plainly. Don't claim it passed.
4. **Report back in plain English.** The owner is not a programmer. Every report includes:
   - **What changed and why** (in everyday language)
   - **Files touched**
   - **Test results** ("X tests, Y failures")
   - **Decisions you should know about** (any judgment call I made on your behalf)
