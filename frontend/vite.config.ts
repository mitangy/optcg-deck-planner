import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production must use the same-origin `/api` rewrite so the session cookie stays
// first-party (absolute cross-origin API URLs break cookies on mobile Safari).
// Fail the production build if VITE_API_URL points at an absolute host.
function assertSameOriginApiUrl(mode: string) {
  if (mode !== "production") return;
  const apiUrl = process.env.VITE_API_URL?.trim();
  if (apiUrl && /^https?:\/\//i.test(apiUrl)) {
    throw new Error(
      `VITE_API_URL="${apiUrl}" is an absolute URL. Leave it unset (or use a ` +
        "relative path like /api) for production builds so API calls stay " +
        "same-origin and session cookies remain first-party.",
    );
  }
}

export default defineConfig(({ mode }) => {
  assertSameOriginApiUrl(mode);
  return {
    plugins: [react()],
    server: {
      port: 5173,
    },
  };
});
