import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // Don't pre-bundle Modus WC — Stencil relies on dynamic import() for
    // lazy-loading component entry chunks. Vite's optimizer removes those calls.
    exclude: [
      "@trimble-oss/moduswebcomponents",
      "@trimble-oss/moduswebcomponents-react",
      "@trimble-oss/moduswebcomponents/loader",
    ],
  },
});
