import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API target is configurable so the UI can run against a second API instance
// (e.g. VITE_API_TARGET=http://127.0.0.1:8010 npm run dev) while the lead uses :8000.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const target = env.VITE_API_TARGET || "http://127.0.0.1:8000";
  const repoRoot = path.resolve(__dirname, "../..");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: { "/api": { target, changeOrigin: true } },
      // The Analyze page embeds fixtures/transcripts/*.txt via `?raw`, which lives above app/web.
      fs: { allow: [repoRoot] },
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      proxy: { "/api": { target, changeOrigin: true } },
    },
    build: {
      // No source maps or external URLs: the bundle must stay self-contained for offline demos.
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
  };
});
