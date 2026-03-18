export function BetaFooter() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="text-center py-1.5 bg-[#0B0B0D]/80 backdrop-blur-sm border-t border-white/[0.03]">
        <p className="text-[9px] sm:text-[10px] font-mono text-white/20 tracking-widest uppercase" data-testid="text-beta-footer">
          Closed Beta — No real money
        </p>
      </div>
    </div>
  );
}
