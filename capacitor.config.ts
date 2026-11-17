import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sherai.pro",
  appName: "SHER AI PRO",
  webDir: "dist",
  bundledWebRuntime: false,
  // Bundle this branch's built web assets inside the APK.
  // Remote image providers and any connected APIs still require internet access.
};

export default config;
