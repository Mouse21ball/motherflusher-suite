import { UnifiedGamePage } from "@/components/game/UnifiedGamePage";
import { ModeIntroGate } from "@/components/game/ModeIntro";

export default function BadugiGame() {
  // P1 (2026-11-06): first-time entrants read the HOW IT WORKS sheet
  // BEFORE the table mounts — no dealt hand, no running clock under it.
  return (
    <ModeIntroGate modeId="badugi">
      <UnifiedGamePage />
    </ModeIntroGate>
  );
}
