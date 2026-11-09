import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { ApiError } from "./lib/api/client";
import { keys } from "./lib/api/hooks";
import { getLang, subscribeLang } from "./lib/i18n";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/instrument-serif/400.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx is an answer, not a blip: don't retry it.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

// Labels and descriptions the service sends are in the language of the request.
let shownLang = getLang();
subscribeLang(() => {
  if (getLang() === shownLang) return;
  shownLang = getLang();
  queryClient.invalidateQueries({ queryKey: keys.capabilities });
  queryClient.invalidateQueries({ queryKey: keys.settings });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
