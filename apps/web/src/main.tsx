import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./lib/i18n/provider";
import { SessionProvider } from "./lib/session";
import "./index.css";

// No StrictMode: its double-mounted effects would make the forecast preview
// call the model twice in development.
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <I18nProvider>
      <SessionProvider>
        <App />
      </SessionProvider>
    </I18nProvider>,
  );
}
