import { PrivyProvider } from "@privy-io/react-auth";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const appId = import.meta.env.VITE_PRIVY_APP_ID || "replace-with-privy-app-id";

createRoot(document.getElementById("root")!).render(
  <PrivyProvider
    appId={appId}
    config={{
      loginMethods: ["email", "wallet"],
      embeddedWallets: {
        ethereum: {
          createOnLogin: "users-without-wallets"
        }
      },
      appearance: {
        theme: "light",
        accentColor: "#0f766e",
        logo: undefined
      }
    }}
  >
    <App />
  </PrivyProvider>
);
