/**
 * The path the app is served under: "" at the top of the site (local
 * development), "/data-agent" behind the DICE address.
 *
 * NEXT_PUBLIC_, so the value is fixed at build time. next.config.mjs reads the
 * same variable for Next's own `basePath` and normalises it the same way:
 * a leading slash, no trailing slash, and empty or "/" meaning no base path.
 *
 * Next.js adds the base path by itself to router.push(), <Link>, redirects and
 * its own files. It does not touch an address the code writes by hand --
 * fetch(), window.history, window.location -- so those put BASE_PATH in front.
 * The login service's /auth/... addresses never get it: they live at the top
 * of the site.
 */
const trimmed = (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
  .trim()
  .replace(/^\/+|\/+$/g, "");

export const BASE_PATH = trimmed ? `/${trimmed}` : "";
