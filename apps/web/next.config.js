/** @type {import("next").NextConfig} */
const config = {
  /** Required for Docker multi-stage build — Dockerfile copies from .next/standalone */
  output: "standalone",
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: ["@mint/db"],
  /** Linting and typechecking run as separate CI steps — still enforced, not silenced */
  eslint: { ignoreDuringBuilds: true },
};

module.exports = config;
