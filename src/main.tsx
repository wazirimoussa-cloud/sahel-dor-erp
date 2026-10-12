import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { initSentry } from "@/lib/sentry";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "@/index.css";

document.querySelector("link[data-async-font]")?.setAttribute("media", "all");

initSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
