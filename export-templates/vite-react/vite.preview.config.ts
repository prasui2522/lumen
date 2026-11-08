// S2: builds the Tier 1 Preview runtime (preview.html → ../../public/preview-runtime).
// Not part of the export zip; run via `bun run build:preview-runtime` at the repo root.
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "./",
  // Images come from the app's asset protocol, not the template's public/.
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, "../../public/preview-runtime"),
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: path.resolve(__dirname, "preview.html"),
      // One classic (IIFE) script: module scripts are always CORS-fetched, and the
      // sandboxed frame has an opaque origin, so an ESM entry would be blocked
      // under the Tauri protocol. The build script rewrites the <script> tag.
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/preview.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
