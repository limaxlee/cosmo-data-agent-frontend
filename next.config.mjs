import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The path the app is served under. Empty means the top of the site (local
// development); the Docker build sets /data-agent. Normalised the same way as
// src/lib/base-path.ts: a leading slash, no trailing slash, and an empty value
// or "/" meaning no base path.
const basePathSegment = (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
  .trim()
  .replace(/^\/+|\/+$/g, "");
const basePath = basePathSegment ? `/${basePathSegment}` : "";

// Development only. Where the stand-in login service
// (dev/mock-login-service.mjs) listens. Unset everywhere else -- in the Docker
// build too -- and then no rewrite exists: behind the DICE address /auth/... is
// answered by the real login service and never reaches this app.
const authDevProxyTarget = (process.env.AUTH_DEV_PROXY_TARGET ?? "")
  .trim()
  .replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["10.254.163.69"],
  output: "standalone",
  basePath,
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/chat/new",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    if (!authDevProxyTarget) return [];

    return [
      {
        source: "/auth/:path*",
        destination: `${authDevProxyTarget}/auth/:path*`,
        // The login service lives at the top of the site, outside the base
        // path, so this rule must match there too.
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
