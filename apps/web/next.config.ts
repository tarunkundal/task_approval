import type { NextConfig } from 'next';

/**
 * Same-origin API proxy (ARCHITECTURE.md D1): the browser calls /api/v1/* on the web origin and
 * Next.js forwards it to the Express API, so the auth cookie stays first-party.
 * API_URL is server-side only. It must be set for production builds; the localhost default
 * applies to development only.
 */
function resolveApiUrl(): string {
  const value = process.env.API_URL?.trim();
  if (value) {
    const url = new URL(value); // throws on malformed values
    return url.origin + url.pathname.replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('API_URL must be set for production builds (e.g. https://api.example.com).');
  }
  return 'http://localhost:4000';
}

const apiUrl = resolveApiUrl();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@workspace/shared'],
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
