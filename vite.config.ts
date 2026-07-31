import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const BUILD_ID = [
  (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  new Date().toISOString().slice(0, 16).replace("T", " ") + "Z",
].join(" · ");

// https://vite.dev/config/
export default defineConfig({
  define: {
    // So "is my change actually on your phone?" is a question the app answers
    // rather than one we guess at.
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Registered by hand in src/lib/pwa.ts, which actually checks for and
      // applies updates. The injected one-liner does not.
      injectRegister: false,
      includeAssets: ["icons/icon-180.png"],
      manifest: {
        name: "Territory OS",
        short_name: "Territory OS",
        description: "Territory inventory and case logistics for surgical device reps",
        theme_color: "#070c18",
        background_color: "#070c18",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Deliberately no `html`. Precaching index.html is what froze a phone
        // on a build from days earlier: the shell came from the cache, the
        // cache named old hashed bundles, and the page never asked the network
        // whether anything newer existed. Navigations now go to the network
        // first and fall back to the last good copy, so being offline still
        // works but being online always wins.
        globPatterns: ["**/*.{js,css,png,svg,ico,woff2}"],
        // Workbox otherwise registers a NavigationRoute that answers every
        // navigation straight out of the precache -- which is exactly the
        // freeze. It also has to be off because index.html is no longer in
        // there for it to serve.
        navigateFallback: null as unknown as undefined,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "territory-os-shell",
              // Hospital wifi is frequently "connected" and useless. Wait a
              // few seconds, then serve the cached shell rather than hanging.
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 8 },
            },
          },
        ],
      },
    }),
  ],
});
