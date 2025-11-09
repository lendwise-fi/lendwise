import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Turbopack configuration - ignore markdown files
  turbopack: {},
  // Exclude markdown files from being processed
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'coin-images.coingecko.com',
        pathname: '/**',
      },
    ],
  },
  webpack: (config) => {
    // Externaliser les modules Node.js qui ne doivent pas être bundlés
    config.externals.push('pino-pretty', 'lokijs', 'encoding')

    // Désactiver les polyfills Node.js inutiles
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    }

    // Ignore markdown files to prevent bundling errors
    config.module.rules.push({
      test: /\.md$/,
      type: 'javascript/auto',
      loader: 'ignore-loader',
    })

    // // 👇 Fix pour MetaMask SDK (ignore async-storage côté Node)
    // config.resolve.alias = {
    //   ...(config.resolve.alias || {}),
    //   '@react-native-async-storage/async-storage': false,
    // }

    return config
  },
}

export default nextConfig
