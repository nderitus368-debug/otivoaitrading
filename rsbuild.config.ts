import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import path from 'path';

// loadEnv automatically loads .env files and separates variables 
// prefixed with PUBLIC_ into publicVars
const { publicVars } = loadEnv();

export default defineConfig({
  plugins: [
    pluginSass({
      sassLoaderOptions: {
        sourceMap: true,
      },
      exclude: /node_modules/,
    }),
    pluginReact(),
  ],
  source: {
    entry: {
      index: './src/main.tsx',
    },
    // We merge the auto-loaded publicVars with your specific process.env mappings
    define: {
      ...publicVars,
      'process.env.TRANSLATIONS_CDN_URL': JSON.stringify(process.env.TRANSLATIONS_CDN_URL),
      'process.env.R2_PROJECT_NAME': JSON.stringify(process.env.R2_PROJECT_NAME),
      'process.env.CROWDIN_BRANCH_NAME': JSON.stringify(process.env.CROWDIN_BRANCH_NAME),
      'process.env.TRACKJS_TOKEN': JSON.stringify(process.env.TRACKJS_TOKEN),
      'process.env.APP_ENV': JSON.stringify(process.env.APP_ENV),
      'process.env.REF_NAME': JSON.stringify(process.env.REF_NAME),
      'process.env.REMOTE_CONFIG_URL': JSON.stringify(process.env.REMOTE_CONFIG_URL),
      'process.env.GD_CLIENT_ID': JSON.stringify(process.env.GD_CLIENT_ID),
      'process.env.GD_APP_ID': JSON.stringify(process.env.GD_APP_ID),
      'process.env.GD_API_KEY': JSON.stringify(process.env.GD_API_KEY),
      'process.env.DATADOG_SESSION_REPLAY_SAMPLE_RATE': JSON.stringify(process.env.DATADOG_SESSION_REPLAY_SAMPLE_RATE),
      'process.env.DATADOG_SESSION_SAMPLE_RATE': JSON.stringify(process.env.DATADOG_SESSION_SAMPLE_RATE),
      'process.env.DATADOG_APPLICATION_ID': JSON.stringify(process.env.DATADOG_APPLICATION_ID),
      'process.env.DATADOG_CLIENT_TOKEN': JSON.stringify(process.env.DATADOG_CLIENT_TOKEN),
      'process.env.RUDDERSTACK_KEY': JSON.stringify(process.env.RUDDERSTACK_KEY),
      'process.env.GROWTHBOOK_CLIENT_KEY': JSON.stringify(process.env.GROWTHBOOK_CLIENT_KEY),
      'process.env.GROWTHBOOK_DECRYPTION_KEY': JSON.stringify(process.env.GROWTHBOOK_DECRYPTION_KEY),
    },
    alias: {
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      '@/external': path.resolve(__dirname, './src/external'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/constants': path.resolve(__dirname, './src/constants'),
      '@/stores': path.resolve(__dirname, './src/stores'),
    },
  },
  output: {
    copy: [
      {
        from: 'node_modules/@deriv/deriv-charts/dist/*',
        to: 'js/smartcharts/[name][ext]',
        globOptions: {
          ignore: ['**/*.LICENSE.txt'],
        },
      },
      { from: 'node_modules/@deriv/deriv-charts/dist/chart/assets/*', to: 'assets/[name][ext]' },
      { from: 'node_modules/@deriv/deriv-charts/dist/chart/assets/fonts/*', to: 'assets/fonts/[name][ext]' },
      { from: 'node_modules/@deriv/deriv-charts/dist/chart/assets/shaders/*', to: 'assets/shaders/[name][ext]' },
      { from: path.join(__dirname, 'public') },
    ],
    filename: {
      js: ({ chunk }) => {
        // Keep Service Worker filename static for browser updates
        if (chunk?.name === 'sw') {
          return '[name].js';
        }
        return '[name].[contenthash:8].js';
      },
    },
  },
  html: {
    template: './index.html',
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    compress: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'unsafe-none',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
      'Cache-Control': 'no-cache',
    },
  },
  dev: {
    hmr: true,
    client: {
      // Dynamic config for Replit or local development
      host: process.env.REPLIT_DEV_DOMAIN || 'localhost',
      port: process.env.REPLIT_DEV_DOMAIN ? 443 : 5000,
      protocol: process.env.REPLIT_DEV_DOMAIN ? 'wss' : 'ws',
    },
  },
  tools: {
    rspack: {
      module: {
        rules: [
          {
            test: /\.xml$/,
            exclude: /node_modules/,
            // 'asset/source' replaces 'raw-loader' in Rspack/Webpack 5
            type: 'asset/source',
          },
        ],
      },
    },
  },
});