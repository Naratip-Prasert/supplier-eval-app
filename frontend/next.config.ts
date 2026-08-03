import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // shared/criteria-data.json lives at the monorepo root (repo-root/shared/),
  // one level above this app — outputFileTracingRoot lets Next's file
  // tracing (dev + the build's output-file-tracing step) see outside
  // frontend/ the same way Vite's server.fs.allow did for the old app.
  outputFileTracingRoot: path.join(__dirname, ".."),

  allowedDevOrigins: ['192.168.61.130'],
  // Proxy /api/* and /uploads/* through this app's own domain to the Render
  // backend (same NEXT_PUBLIC_API_URL already configured in Vercel — no new
  // env var needed). This makes the auth cookie same-origin from the
  // browser's point of view instead of a cross-site cookie between the
  // vercel.app and onrender.com domains — iOS Safari's cross-site tracking
  // prevention blocks that cross-site cookie even with SameSite=None;Secure
  // set correctly (desktop browsers are more lenient), which is why login
  // worked on desktop but silently bounced back to /login on iPhone/iPad.
  // See frontend/src/utils/api.ts, which switches to relative paths (so
  // these rewrites actually apply) whenever it isn't running on localhost.
  async rewrites() {
    const backend = process.env.NEXT_PUBLIC_API_URL;
    if (!backend) return [];
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
