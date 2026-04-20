import { createRoot } from "react-dom/client";
import { ModusWcThemeProvider, setAssetPath } from "@trimble-oss/moduswebcomponents-react";
import App from "./App";

// Modus stylesheet (Open Sans + theme tokens)
import "@trimble-oss/moduswebcomponents/modus-wc-styles.css";
import "./index.css";
import "./shadow-dom-patch";

// Mirror modus-blueprint's exact setAssetPath call:
// Stencil fetches component chunks relative to the origin root so Vite dev serves them correctly
if (typeof window !== "undefined") {
  const base = import.meta.env.BASE_URL || "/";
  setAssetPath(`${window.location.origin}${base.endsWith("/") ? base : `${base}/`}`);
}

createRoot(document.getElementById("root")!).render(
  <ModusWcThemeProvider>
    <App />
  </ModusWcThemeProvider>
);
