import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WelcomeGate } from "@/components/WelcomeGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initAnalytics } from "@/lib/analytics";
import { BetaFooter } from "@/components/BetaFooter";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import BadugiGame from "@/pages/BadugiGame";
import Dead7Game from "@/pages/Dead7Game";
import Fifteen35Game from "@/pages/Fifteen35Game";
import SuitsPokerGame from "@/pages/SuitsPokerGame";
import Admin from "@/pages/Admin";
import Terms from "@/pages/Terms";
import JoinTable from "@/pages/JoinTable";
import Profile from "@/pages/Profile";
import Leaderboard from "@/pages/Leaderboard";
import Shop from "@/pages/Shop";

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Home}/>
        <Route path="/profile" component={Profile}/>
        <Route path="/leaderboard" component={Leaderboard}/>
        <Route path="/shop" component={Shop}/>
        <Route path="/badugi" component={BadugiGame}/>
        <Route path="/dead7" component={Dead7Game}/>
        <Route path="/fifteen35" component={Fifteen35Game}/>
        <Route path="/suitspoker" component={SuitsPokerGame}/>
        <Route path="/join/:code" component={JoinTable}/>
        <Route path="/admin" component={Admin}/>
        <Route path="/terms" component={Terms}/>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {/* Screen-edge vignette — always on top, no pointer events */}
        <div className="cgp-vignette" aria-hidden="true" />
        <WelcomeGate>
          <Router />
          <BetaFooter />
        </WelcomeGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
