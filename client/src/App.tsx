import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Game from "@/pages/Game";
import BadugiGame from "@/pages/BadugiGame";
import Dead7Game from "@/pages/Dead7Game";
import Fifteen35Game from "@/pages/Fifteen35Game";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home}/>
      <Route path="/swing" component={Game}/>
      <Route path="/badugi" component={BadugiGame}/>
      <Route path="/dead7" component={Dead7Game}/>
      <Route path="/fifteen35" component={Fifteen35Game}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
