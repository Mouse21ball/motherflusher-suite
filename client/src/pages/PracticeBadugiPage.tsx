import { useState } from "react";
import { useLocation } from "wouter";
import type { CardType } from "@shared/gameTypes";
import { evaluateBadugi } from "@shared/modes/badugi";
import PracticeGuide from "@/components/practice/PracticeGuide";
import { usePracticeBadugi } from "@/lib/practice/usePracticeBadugi";

const SUIT_SYMBOL: Record<CardType["suit"], string> = {
  hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠",
};
const redSuits = new Set<CardType["suit"]>(["hearts", "diamonds"]);

function Card({ card, selected, hidden, onClick }: {
  card: CardType;
  selected?: boolean;
  hidden?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={hidden ? "Hidden card" : `${card.rank} of ${card.suit}${selected ? ", selected" : ""}`}
      className={`relative flex h-[88px] w-[62px] shrink-0 flex-col justify-between rounded-lg border p-2 text-left shadow-lg transition sm:h-[108px] sm:w-[76px] ${
        hidden
          ? "border-emerald-300/30 bg-gradient-to-br from-emerald-900 to-emerald-950 text-emerald-100"
          : redSuits.has(card.suit)
            ? "border-white/80 bg-[#fffdf7] text-red-600"
            : "border-white/80 bg-[#fffdf7] text-slate-950"
      } ${onClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"} ${selected ? "-translate-y-2 ring-2 ring-amber-300" : ""}`}
    >
      {hidden ? (
        <span className="self-center text-3xl opacity-70">✦</span>
      ) : (
        <>
          <span className="text-lg font-black leading-none sm:text-xl">{card.rank}</span>
          <span className="self-center text-3xl leading-none sm:text-4xl">{SUIT_SYMBOL[card.suit]}</span>
          <span className="rotate-180 self-end text-sm font-bold leading-none">{card.rank}</span>
        </>
      )}
    </button>
  );
}

export default function PracticeBadugiPage() {
  const { state, dispatch } = usePracticeBadugi();
  const [, setLocation] = useLocation();
  const [betAmount, setBetAmount] = useState(50);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const { game, selectedCardIndices } = state;
  const hero = game.players.find(p => p.id === "p1")!;
  const callAmount = Math.max(0, game.currentBet - hero.bet);
  const callPayment = Math.min(callAmount, hero.chips);
  const isDraw = game.phase.startsWith("DRAW");
  const isBet = game.phase.startsWith("BET");
  const atShowdown = game.phase === "SHOWDOWN";
  const isPlayerTurn = game.activePlayerId === "p1";
  const phaseLabel = game.phase.replaceAll("_", " ");
  const winnerNames = game.players.filter(p => p.isWinner).map(p => p.name);

  if (!ageConfirmed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07120f] px-4 text-white">
        <section className="w-full max-w-md rounded-2xl border border-emerald-200/20 bg-black/40 p-6 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-200/70">Badugi practice</p>
          <h1 className="mt-3 text-2xl font-black">Age confirmation</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">You must be 17 or older to use this game. This confirmation is only held for this visit; practice does not read or write account data.</p>
          <button
            type="button"
            className="mt-6 rounded-xl bg-amber-300 px-5 py-3 font-bold text-emerald-950 hover:bg-amber-200"
            onClick={() => setAgeConfirmed(true)}
          >
            I am 17 or older — Continue
          </button>
          <button type="button" onClick={() => setLocation("/")} className="ml-3 rounded-xl border border-white/15 px-4 py-3 text-sm text-white/75 hover:bg-white/10">Exit</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07120f] px-3 pb-[20rem] pt-4 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <button onClick={() => setLocation("/")} className="mb-2 text-xs text-emerald-200/70 hover:text-white">← Lobby</button>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Badugi practice</h1>
            <p className="mt-1 text-sm text-emerald-100/70">One hand · bots only · virtual practice chips, no account balance involved</p>
          </div>
          <div className="rounded-xl border border-amber-300/20 bg-black/30 px-4 py-2 text-right">
            <div className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-200/70">Practice stack</div>
            <div className="font-mono text-xl font-bold text-amber-100">{hero.chips.toLocaleString()}</div>
            <div className="text-[10px] text-white/50">Starts at 10,000 · simulated only</div>
          </div>
        </header>

        <section className="rounded-[28px] border border-emerald-200/10 bg-gradient-to-b from-emerald-950/80 to-[#07100e] p-4 shadow-2xl sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.22em] text-emerald-200/60">Hand walkthrough</div>
              <div className="mt-1 text-lg font-bold">{game.phase === "WAITING" ? "Ready when you are" : phaseLabel}</div>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 font-mono text-sm">
              Pot <span className="font-bold text-amber-200">{game.pot}</span>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {game.players.filter(p => p.id !== "p1").map(p => (
              <div key={p.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.name}</span>
                  <span className="font-mono text-xs text-amber-100/80">{p.chips.toLocaleString()} chips</span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  {(p.cards.length ? p.cards : Array.from({ length: 4 }, (): CardType => ({ rank: "A", suit: "clubs" }))).map((card, index) => (
                    <Card key={index} card={card} hidden={!atShowdown} />
                  ))}
                </div>
                {atShowdown && <div className="mt-2 text-xs text-emerald-100/70">{p.declaration ?? "No declaration"} · {p.score?.description ?? "No valid Badugi"}</div>}
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-emerald-100/10 bg-black/20 p-4 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{atShowdown ? "Showdown" : "Your hand"}</div>
                {isDraw && <div className="text-xs text-white/55">Select up to {game.phase === "DRAW_1" ? 3 : game.phase === "DRAW_2" ? 2 : 1} cards to replace, or stand pat. Cards come from a fresh shuffled deck; draws can improve or weaken your hand.</div>}
              </div>
              {atShowdown && <span className="text-xs font-bold text-amber-200">{winnerNames.length ? `${winnerNames.join(" & ")} win${winnerNames.length === 1 ? "s" : ""}` : "Pot unresolved"}</span>}
            </div>
            <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
              {hero.cards.length ? hero.cards.map((card, index) => (
                <Card
                  key={`${card.rank}-${card.suit}-${index}`}
                  card={card}
                  selected={selectedCardIndices.includes(index)}
                  onClick={isDraw && isPlayerTurn ? () => dispatch({ type: "SELECT_CARD", index }) : undefined}
                />
              )) : <p className="py-5 text-sm text-white/45">Start the hand to receive four cards.</p>}
            </div>
            {atShowdown && <div className="mt-3 text-center text-sm text-emerald-100/75">{hero.declaration ?? "No declaration"} · {hero.score?.description ?? "No valid Badugi"}</div>}
          </div>

          <div className="mt-5 flex min-h-12 flex-wrap items-center justify-center gap-2">
            {game.phase === "WAITING" && (
              <button className="rounded-xl bg-amber-300 px-5 py-3 font-bold text-emerald-950 hover:bg-amber-200" onClick={() => dispatch({ type: "START" })}>
                Start one-hand practice
              </button>
            )}
            {game.phase === "ANTE" && (
              <button className="rounded-xl bg-amber-300 px-5 py-3 font-bold text-emerald-950 hover:bg-amber-200" onClick={() => dispatch({ type: "ANTE" })}>
                Post 25 practice-chip ante
              </button>
            )}
            {game.phase === "DEAL" && (
              <button className="rounded-xl bg-emerald-300 px-5 py-3 font-bold text-emerald-950 hover:bg-emerald-200" onClick={() => dispatch({ type: "DEAL" })}>
                Deal four cards
              </button>
            )}
            {isDraw && isPlayerTurn && (
              <button className="rounded-xl bg-emerald-300 px-5 py-3 font-bold text-emerald-950 hover:bg-emerald-200" onClick={() => dispatch({ type: "DRAW" })}>
                {selectedCardIndices.length ? `Draw ${selectedCardIndices.length}` : "Stand pat"}
              </button>
            )}
            {game.phase === "DECLARE" && isPlayerTurn && evaluateBadugi(hero.cards)?.isValidBadugi && (
              <>
                <button className="rounded-xl bg-sky-300 px-5 py-3 font-bold text-slate-950 hover:bg-sky-200" onClick={() => dispatch({ type: "DECLARE", declaration: "LOW" })}>Declare Low</button>
                <button className="rounded-xl bg-orange-300 px-5 py-3 font-bold text-slate-950 hover:bg-orange-200" onClick={() => dispatch({ type: "DECLARE", declaration: "HIGH" })}>Declare High</button>
              </>
            )}
            {game.phase === "DECLARE" && isPlayerTurn && !evaluateBadugi(hero.cards)?.isValidBadugi && (
              <div className="w-full rounded-xl border border-amber-200/20 p-3">
                <p className="mb-3 text-sm text-amber-100">Your hand has repeated ranks or suits and does not qualify as a four-card Badugi. Fold to continue to the result.</p>
                <button className="rounded-xl bg-emerald-300 px-5 py-3 font-bold text-emerald-950 hover:bg-emerald-200" onClick={() => dispatch({ type: "FOLD" })}>Fold non-qualifying hand</button>
              </div>
            )}
            {isBet && isPlayerTurn && (
              <>
                <button className="rounded-xl border border-white/20 px-4 py-3 font-semibold hover:bg-white/10" onClick={() => dispatch({ type: "BET", amount: callPayment })}>
                  {callAmount ? (callPayment < callAmount ? `All-in ${callPayment}` : `Call ${callAmount}`) : "Check"}
                </button>
                <label className="flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs text-white/70">
                  Bet / raise
                  <input
                    aria-label="Practice chip bet amount"
                    type="number" min={callAmount} max={hero.chips} step={25} value={betAmount}
                    onChange={event => setBetAmount(Number(event.target.value))}
                    className="w-24 rounded-md bg-black/40 px-2 py-1.5 font-mono text-sm text-white outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </label>
                <button className="rounded-xl bg-amber-300 px-4 py-3 font-bold text-emerald-950 hover:bg-amber-200" onClick={() => dispatch({ type: "BET", amount: betAmount })}>Bet</button>
              </>
            )}
            {atShowdown && (
              <button className="rounded-xl bg-amber-300 px-5 py-3 font-bold text-emerald-950 hover:bg-amber-200" onClick={() => dispatch({ type: "RESTART" })}>Practice another hand</button>
            )}
          </div>
          {state.error && <p role="alert" className="mt-2 text-center text-sm text-rose-300">{state.error}</p>}
          {!isPlayerTurn && game.phase !== "WAITING" && !atShowdown && <p className="mt-3 text-center text-xs text-white/45">Bots are responding…</p>}
          <p className="mt-4 text-center text-[11px] text-white/40">Every wager here is simulated with practice chips. No network table, saved progress, or real-money balance is used.</p>
        </section>

        <PracticeGuide
          state={game}
          myId="p1"
          selectedCount={selectedCardIndices.length}
          onExit={() => setLocation("/")}
        />
      </div>
    </main>
  );
}