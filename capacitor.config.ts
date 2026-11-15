import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sherai.pro",
  appName: "SHER AI PRO",
  webDir: "dist",
  bundledWebRuntime: false,
  // Android WebView loads the deployed Vercel app so Supabase and /api
  // requests use the same origin and the Vercel server-side environment.
  // Internet access is required for the app to work.
  server: {
    url: "https://sher-ai-pro.vercel.app",
    cleartext: false,
    allowNavigation: ["sher-ai-pro.vercel.app"],
  },
};

export default config;
