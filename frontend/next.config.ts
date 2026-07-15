import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // shared/criteria-data.json lives at the monorepo root (repo-root/shared/),
  // one level above this app — outputFileTracingRoot lets Next's file
  // tracing (dev + the build's output-file-tracing step) see outside
  // frontend/ the same way Vite's server.fs.allow did for the old app.
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
