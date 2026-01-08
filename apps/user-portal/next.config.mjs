import { withSentryConfig } from "@sentry/nextjs";

/** @type {import("next").NextConfig} */
const config = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@imaginecalendar/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  devIndicators: false,
  // Disable source maps in production to reduce memory usage during build
  productionBrowserSourceMaps: false,
  // Optimize build performance
  experimental: {
    optimizePackageImports: ['lucide-react', '@imaginecalendar/ui'],
  },
  // Reduce memory usage during build
  webpack: (config, { isServer, dev }) => {
    if (!isServer) {
      // Optimize client-side bundle
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          maxInitialRequests: 25,
          minSize: 20000,
          cacheGroups: {
            default: false,
            vendors: false,
            // Create separate chunk for large vendor libraries
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /[\\/]node_modules[\\/]/,
              priority: 20,
              reuseExistingChunk: true,
            },
            // Separate chunk for UI components
            ui: {
              name: 'ui',
              chunks: 'all',
              test: /[\\/]node_modules[\\/]@imaginecalendar[\\/]ui[\\/]/,
              priority: 30,
              reuseExistingChunk: true,
            },
            // Separate chunk for large libraries
            react: {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              chunks: 'all',
              priority: 40,
              reuseExistingChunk: true,
            },
            // Separate chunk for date libraries
            date: {
              name: 'date',
              test: /[\\/]node_modules[\\/]date-fns[\\/]/,
              chunks: 'all',
              priority: 25,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    
    // Reduce memory usage during build
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        runtimeChunk: 'single',
      };
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

export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload source maps for better stack traces
  widenClientFileUpload: true,

  // Tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
  
  // Disable source maps during build to reduce memory usage
  hideSourceMaps: true,
  
  // Reduce memory usage during build
  disableServerWebpackPlugin: false,
  disableClientWebpackPlugin: false,
});