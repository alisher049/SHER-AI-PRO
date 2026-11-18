import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project site is served from /SHER-AI-PRO/.
export default defineConfig({
  plugins: [react],
  base: process.env.GITHUB_ACTIONS === "true" ? "/SHER-AI-PRO/" : "/"
});
