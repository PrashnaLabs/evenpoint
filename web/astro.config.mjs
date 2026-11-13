import { defineConfig } from "astro/config";

// Built into the Python package; `evenpoint ui` serves it next to the JSON API.
export default defineConfig({
  outDir: "../evenpoint/web_dist",
  build: { format: "directory", assets: "assets" },
  devToolbar: { enabled: false },
  compressHTML: false,
  vite: { server: { proxy: { "/api": "http://127.0.0.1:8765" } } },
});
