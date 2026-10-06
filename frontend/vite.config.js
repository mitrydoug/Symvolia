import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";
import { resolveAppVersion } from "../scripts/app-version.mjs";

const appVersion = process.env.VITE_APP_VERSION ?? resolveAppVersion();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), nodePolyfills()],
  base: "./",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  // Shared repo env dir: env/.env (+ .env.production, .env.local) is the single
  // source of frontend build config; profiles/CI override via process env.
  envDir: path.resolve(__dirname, "../env"),
  build: {
    rollupOptions: {
      output: {
        // Keep IPFS directory uploads below Pinata account file-count limits.
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: "buffer",
      // Transformers.js `main` points at raw ./src (Node ESM that does
      // `import fs from 'fs'` then `Object.keys(fs)` — which throws in the
      // browser, and whose onnxruntime dep needs CJS interop). Point at the
      // maintainers' prebuilt browser bundle instead: it inlines onnxruntime as
      // ESM and shims fs/path, fixing both the `registerBackend` and
      // `Object.keys(undefined)` crashes. Used in dev and prod.
      "@xenova/transformers": path.resolve(
        __dirname,
        "node_modules/@xenova/transformers/dist/transformers.js",
      ),
    },
  },
  optimizeDeps: {
    // The aliased dist bundle is already a self-contained ESM file, so there's
    // nothing for esbuild to pre-bundle — exclude it to avoid re-processing the
    // multi-MB webpack output. It's only loaded inside the hybrid search worker.
    exclude: ["@xenova/transformers"],
  },
  server: {
    allowedHosts: [".my.preview.run"],
    host: true,
  },
  preview: {
    host: true,
  },
});
