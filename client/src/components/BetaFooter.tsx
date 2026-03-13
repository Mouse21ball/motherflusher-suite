export function BetaFooter() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="text-center py-1.5 bg-black/60 backdrop-blur-sm border-t border-white/[0.06]">
        <p className="text-[10px] sm:text-[11px] font-mono text-white/30 tracking-wide" data-testid="text-beta-footer">
          Closed Beta — No real money. Gameplay subject to change.
        </p>
      </div>
    </div>
  );
}
