import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// The @tensorflow-models/speech-commands bundle imports Node's `util` (for
// `promisify`). Alias it to a tiny browser shim so it resolves in the browser.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      util: fileURLToPath(new URL("./src/shims/util-shim.ts", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri 2 webview targets (Safari on macOS, Chromium on Windows).
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
  },
});
