import type { NextConfig } from 'next';

// force rebuild 2

const parsedAppOrigin = process.env.APP_ORIGIN
  ? (() => {
      try {
        return new URL(process.env.APP_ORIGIN).hostname;
      } catch {
        return null;
      }
    })()
  : null;

const envImageHosts = (process.env.NEXT_IMAGE_REMOTE_HOSTS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const allowedImageHosts = Array.from(new Set([
  ...envImageHosts,
  ...(parsedAppOrigin ? [parsedAppOrigin] : []),
]));

const nextConfig: NextConfig = {

  poweredByHeader: false, // Disable default Next.js header
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: allowedImageHosts.map((hostname) => ({
      protocol: 'https',
      hostname,
    })),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Powered-By',
            value: 'chuckles',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
