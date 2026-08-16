import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Initialize Sentry browser error tracking.
// Set VITE_SENTRY_DSN in Replit Secrets to enable (no-op when absent).
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE ?? "development",
  });
}

createRoot(document.getElementById("root")!).render(<App />);
