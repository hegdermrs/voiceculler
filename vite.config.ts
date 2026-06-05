import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The @tensorflow-models/speech-commands bundle imports Node's `util` (for
// `promisify`). Alias it to a tiny browser shim so it resolves in the browser.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      util: fileURLToPath(new URL("./src/shims/util-shim.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
