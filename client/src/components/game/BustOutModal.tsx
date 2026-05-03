import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface BustOutModalProps {
  open: boolean;
  onRebuy: () => void;
  onLeaveTable: () => void;
  onSpectate: () => void;
}

export function BustOutModal({ open, onRebuy, onLeaveTable, onSpectate }: BustOutModalProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        className="max-w-[340px] sm:max-w-md bg-[#141417] border-white/[0.08] rounded-2xl mx-4 shadow-2xl"
        data-testid="modal-bust-out"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white/90 text-base font-sans font-semibold tracking-wide">
            You're out of chips
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/45 text-sm leading-relaxed">
            Your stack is empty. Pick how you'd like to keep playing — rebuy for
            another <span className="font-mono font-bold text-[#C9A227]/80">$1,000</span>{" "}
            and stay seated, watch the rest of the hand from the rail, or head
            back to the lobby.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-col">
          <Button
            onClick={onRebuy}
            className="w-full btn-casino-gold uppercase tracking-widest text-[11px] font-bold"
            data-testid="button-bust-rebuy"
          >
            Rebuy $1,000
          </Button>
          <Button
            variant="outline"
            onClick={onSpectate}
            className="w-full bg-white/[0.03] border-white/[0.08] text-white/55 hover:bg-white/[0.06] hover:text-white/80 font-mono uppercase tracking-widest text-[10px]"
            data-testid="button-bust-spectate"
          >
            Watch this Table
          </Button>
          <Button
            variant="outline"
            onClick={onLeaveTable}
            className="w-full bg-transparent border-white/[0.06] text-white/35 hover:bg-white/[0.04] hover:text-white/55 font-mono uppercase tracking-widest text-[10px]"
            data-testid="button-bust-leave"
          >
            Back to Lobby
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
