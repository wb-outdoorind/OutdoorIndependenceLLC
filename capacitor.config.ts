import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.outdoorindependence.inspections",
  appName: "OI Inspections",
  webDir: ".next",
  server: {
    // Set this to your deployed HTTPS URL before store builds.
    url: "https://outdoor-independence-llc-app.vercel.app/",
    cleartext: false,
  },
};

export default config;
