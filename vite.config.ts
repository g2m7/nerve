import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export const API_PROXY_PREFIX = "/api/";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Trailing slash avoids proxying Vite's `/api.ts` frontend module.
      [API_PROXY_PREFIX]: "http://127.0.0.1:3030",
    },
  },
});
