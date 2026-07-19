/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  // Produces a self-contained .next/standalone build (only the deps actually
  // used at runtime) — makes the production Docker image far smaller than
  // copying the whole node_modules tree.
  output: 'standalone',
}

module.exports = nextConfig
