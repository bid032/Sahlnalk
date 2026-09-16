import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  esbuild: {
    drop: ["console", "debugger"],
    pure: ["console.log", "console.info", "console.debug", "console.warn"],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts
    server: { entry: "server" },
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    nitro({
      preset: process.env.NITRO_PRESET || (process.env.VERCEL ? "vercel" : process.env.NETLIFY ? "netlify" : "node-server"),
      compressPublicAssets: { gzip: true, brotli: true },
      minify: true,
      routeRules: {
        "/assets/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
        "/_ssr/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
        "/favicon.png": { headers: { "cache-control": "public, max-age=86400" } },
        "/logo.png": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
        "/cover.webp": { headers: { "cache-control": "public, max-age=86400" } },
      },
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-") || id.includes("react-smooth")) return "charts-vendor";
            if (id.includes("xlsx")) return "xlsx-vendor";
            if (id.includes("three")) return "three-vendor";
            if (id.includes("gsap")) return "gsap-vendor";
            if (id.includes("framer-motion")) return "motion-vendor";
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("@radix-ui")) return "radix-vendor";
            if (id.includes("@supabase")) return "supabase-vendor";
            if (id.includes("@tanstack")) return "tanstack-vendor";
          }
        },
      },
    },
  },
});