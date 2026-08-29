import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WelcomeGate } from "@/components/WelcomeGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useServerProfile } from "@/lib/useServerProfile";
import { initAnalytics } from "@/lib/analytics";
import { billing } from "@/lib/billing";
import { music } from "@/lib/music";
import { MUSIC_CATALOG } from "@/lib/musicTracks";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import BadugiGame from "@/pages/BadugiGame";
import Dead7Game from "@/pages/Dead7Game";
import Fifteen35Game from "@/pages/Fifteen35Game";
import SuitsPokerGame from "@/pages/SuitsPokerGame";
import FlushedUpGame from "@/pages/FlushedUpGame";
import KamikazeGame from "@/pages/KamikazeGame";
import BonecrusherGame from "@/pages/BonecrusherGame";
import BoxChevyGame from "@/pages/BoxChevyGame";
import Admin from "@/pages/Admin";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import DeleteAccount from "@/pages/DeleteAccount";
import JoinTable from "@/pages/JoinTable";
import Profile from "@/pages/Profile";
import Leaderboard from "@/pages/Leaderboard";
import Shop from "@/pages/Shop";
import BonusCenter from "@/pages/BonusCenter";
import CosmeticsStore from "@/pages/CosmeticsStore";
import Crews from "@/pages/Crews";
import LadyLuck from "@/pages/LadyLuck";
import LadyLuckSpectate from "@/pages/LadyLuckSpectate";
import LadyLuckHistory from "@/pages/LadyLuckHistory";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";

// ── Combined profile-driven manager ──────────────────────────────────────────
// Single useServerProfile call handles both Diamond Elite background and
// context-aware music playback. Merged to avoid duplicate guest-init races.
const LADY_LUCK_PREFIX = '/ladyluck';
const GAME_ROUTE_PREFIXES = [
  '/badugi', '/dead7', '/fifteen35', '/suitspoker',
  '/flushedup', '/kamikaze', '/bonecrusher', '/box-chevy', '/ladyluck',
];

function ProfileManager() {
  const [location] = useLocation();
  const { profile } = useServerProfile();
  const isGameRoute = GAME_ROUTE_PREFIXES.some(
    p => location === p || location.startsWith(p + '/') || location.startsWith(p + '?'),
  );

  // ── Diamond Elite background ─────────────────────────────────────────────
  useEffect(() => {
    const isDiamond = profile?.activeSubscriptionTier === 'diamond_elite';
    document.body.classList.toggle('diamond-elite-bg', isDiamond);
    return () => { document.body.classList.remove('diamond-elite-bg'); };
  }, [profile?.activeSubscriptionTier]);

  // Scope readability safeguards to menus, account screens, onboarding, and
  // shared overlays without changing the already-tuned game-table presentation.
  useEffect(() => {
    document.body.classList.toggle('non-game-readable', !isGameRoute);
    return () => { document.body.classList.remove('non-game-readable'); };
  }, [isGameRoute]);

  // ── Music: resolve track URL from profile + route ────────────────────────
  useEffect(() => {
    const isLadyLuck = location === LADY_LUCK_PREFIX
      || location.startsWith(LADY_LUCK_PREFIX + '/')
      || location.startsWith(LADY_LUCK_PREFIX + '?');
    const isGame = !isLadyLuck && GAME_ROUTE_PREFIXES.some(
      p => location === p || location.startsWith(p + '?')
    );

    let trackId: string | null = null;
    if (isLadyLuck)  trackId = profile?.equippedLadyLuckTrack ?? null;
    else if (isGame) trackId = profile?.equippedGameTrack     ?? null;
    else             trackId = profile?.equippedLobbyTrack    ?? null;

    const url = trackId
      ? (MUSIC_CATALOG.find(t => t.id === trackId)?.audioPath ?? null)
      : null;
    music.setTrackUrl(url);
  }, [location, profile?.equippedLobbyTrack, profile?.equippedGameTrack, profile?.equippedLadyLuckTrack]);

  return null;
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Home}/>
        <Route path="/profile" component={Profile}/>
        <Route path="/leaderboard" component={Leaderboard}/>
        <Route path="/shop" component={Shop}/>
        <Route path="/cosmetics" component={CosmeticsStore}/>
        <Route path="/crews" component={Crews}/>
        <Route path="/bonus" component={BonusCenter}/>
        <Route path="/badugi" component={BadugiGame}/>
        <Route path="/dead7" component={Dead7Game}/>
        <Route path="/fifteen35" component={Fifteen35Game}/>
        <Route path="/suitspoker" component={SuitsPokerGame}/>
        <Route path="/flushedup" component={FlushedUpGame}/>
        <Route path="/kamikaze" component={KamikazeGame}/>
        <Route path="/bonecrusher" component={BonecrusherGame}/>
        <Route path="/box-chevy" component={BoxChevyGame}/>
        <Route path="/ladyluck/history" component={LadyLuckHistory}/>
        <Route path="/ladyluck/spectate" component={LadyLuckSpectate}/>
        <Route path="/ladyluck" component={LadyLuck}/>
        <Route path="/join/:code" component={JoinTable}/>
        <Route path="/admin" component={Admin}/>
        <Route path="/terms" component={Terms}/>
        <Route path="/privacy" component={Privacy}/>
        <Route path="/delete-account" component={DeleteAccount}/>
        <Route path="/forgot-password" component={ForgotPassword}/>
        <Route path="/reset-password" component={ResetPassword}/>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  useEffect(() => {
    initAnalytics();
  }, []);

  // FIX 1: initialize billing once at app startup after the native bridge is ready.
  // cordova-plugin-purchase injects window.CdvPurchase on the 'deviceready' event.
  // On web/dev the WebBillingStub.initialize() is a no-op and safe to call directly.
  // Fire-and-forget: errors are logged but never thrown so the rest of the app is
  // unaffected if Play Billing is unavailable.
  useEffect(() => {
    const init = () => {
      billing
        .initialize()
        .then(() => console.log("[billing] initialized"))
        .catch(err => console.error("[billing] initialize failed:", err));
    };
    // window.cordova is present in Capacitor/Cordova native builds; absent on web.
    if ((window as any).cordova) {
      // Race A fix: deviceready may have already fired before this useEffect runs
      // (fast bundle load from local assets). If CdvPurchase is already injected,
      // call init() directly — the listener would never fire otherwise.
      if (typeof (window as any).CdvPurchase !== "undefined") {
        init();
      } else {
        document.addEventListener("deviceready", init, { once: true });
      }
    } else {
      init();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {/* Screen-edge vignette — always on top, no pointer events */}
        <div className="cgp-vignette" aria-hidden="true" />
        <ProfileManager />
        <ErrorBoundary>
          <WelcomeGate>
            <Router />
          </WelcomeGate>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
