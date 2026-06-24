import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WelcomeGate } from "@/components/WelcomeGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useServerProfile } from "@/lib/useServerProfile";
import { initAnalytics } from "@/lib/analytics";
import { billing } from "@/lib/billing";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import BadugiGame from "@/pages/BadugiGame";
import Dead7Game from "@/pages/Dead7Game";
import Fifteen35Game from "@/pages/Fifteen35Game";
import SuitsPokerGame from "@/pages/SuitsPokerGame";
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

// ── Diamond Elite background manager ─────────────────────────────────────────
// Adds/removes the `diamond-elite-bg` body class based on active subscription.
// Must live inside QueryClientProvider so useServerProfile can fetch.
function DiamondBackground() {
  const { profile } = useServerProfile();
  useEffect(() => {
    const isDiamond = profile?.activeSubscriptionTier === 'diamond_elite';
    document.body.classList.toggle('diamond-elite-bg', isDiamond);
    return () => { document.body.classList.remove('diamond-elite-bg'); };
  }, [profile?.activeSubscriptionTier]);
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
        <DiamondBackground />
        <WelcomeGate>
          <Router />
        </WelcomeGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
