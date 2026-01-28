/** @type {import("next").NextConfig} */
const config = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@imaginecalendar/ui",
    "@imaginecalendar/database",
    "@imaginecalendar/logger",
    "@imaginecalendar/api",
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  devIndicators: false,
  // Externalize googleapis to prevent bundling issues
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (typeof config.externals === 'function') {
        const originalExternals = config.externals;
        config.externals = [
          ...(Array.isArray(originalExternals) ? originalExternals : []),
          ({ request }, callback) => {
            // Externalize googleapis to prevent bundling during build
            if (request === 'googleapis' || request?.startsWith('googleapis/')) {
              return callback(null, `commonjs ${request}`);
            }
            if (typeof originalExternals === 'function') {
              return originalExternals({ request }, callback);
            }
            callback();
          },
        ];
      } else if (Array.isArray(config.externals)) {
        config.externals.push({
          googleapis: 'commonjs googleapis',
        });
      }
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/((?!api/proxy).*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default config;