import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { initSentry } from "@/lib/sentry";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "@/index.css";

initSentry();

// Police des titres chargée en media="print" (non bloquante, voir index.html) : bascule
// vers "all" une fois chargée. Remplace l'ancien onload inline, interdit par la CSP.
const fontLink = document.getElementById("font-playfair") as HTMLLinkElement | null;
if (fontLink) {
  if (fontLink.sheet) fontLink.media = "all";
  else fontLink.addEventListener("load", () => (fontLink.media = "all"), { once: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
