import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias:
      mode === "e2e"
        ? {
            "@privy-io/react-auth": new URL("./src/app/test/privy-e2e.tsx", import.meta.url).pathname
          }
        : undefined
  },
  build: {
    outDir: "dist/client"
  },
  server: {
    port: 5173
  }
}));
