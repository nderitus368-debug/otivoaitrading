import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment variables mapping for cleaner configuration
const envVars = [
    'TRANSLATIONS_CDN_URL',
    'R2_PROJECT_NAME',
    'CROWDIN_BRANCH_NAME',
    'TRACKJS_TOKEN',
    'APP_ENV',
    'REF_NAME',
    'REMOTE_CONFIG_URL',
    'GD_CLIENT_ID',
    'GD_APP_ID',
    'GD_API_KEY',
    'DATADOG_SESSION_REPLAY_SAMPLE_RATE',
    'DATADOG_SESSION_SAMPLE_RATE',
    'DATADOG_APPLICATION_ID',
    'DATADOG_CLIENT_TOKEN',
    'RUDDERSTACK_KEY',
    'GROWTHBOOK_CLIENT_KEY',
    'GROWTHBOOK_DECRYPTION_KEY',
    'GEMINI_API_KEY',
    'GEMINI_API_KEY_2',
    'GEMINI_API_KEY_3',
];

const envDefine = envVars.reduce((acc, varName) => {
    acc[varName] = JSON.stringify(process.env[varName]);
    return acc;
}, {});

export default defineConfig({
    plugins: [
        pluginSass({
            sassLoaderOptions: {
                sourceMap: true,
                sassOptions: {
                    // includePaths: [path.resolve(__dirname, 'src')],
                },
                // additionalData: `@use "${path.resolve(__dirname, 'src/components/shared/styles')}" as *;`,
            },
            exclude: /node_modules/,
        }),
        pluginReact(),
    ],

    source: {
        entry: {
            index: './src/main.tsx',
        },
        define: {
            'process.env': envDefine,
        },
        alias: {
            react: path.resolve('./node_modules/react'),
            'react-dom': path.resolve('./node_modules/react-dom'),
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
            {
                from: 'node_modules/@deriv/deriv-charts/dist/chart/assets/*',
                to: 'assets/[name][ext]',
            },
            {
                from: 'node_modules/@deriv/deriv-charts/dist/chart/assets/fonts/*',
                to: 'assets/fonts/[name][ext]',
            },
            {
                from: 'node_modules/@deriv/deriv-charts/dist/chart/assets/shaders/*',
                to: 'assets/shaders/[name][ext]',
            },
            {
                from: path.join(__dirname, 'public'),
            },
        ],
        filename: {
            js: ({ chunk }) => {
                // Don't add hash to service worker for better caching behavior
                return chunk?.name === 'sw' ? '[name].js' : '[name].[contenthash:8].js';
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
        client: process.env.REPLIT_DEV_DOMAIN
            ? {
                  host: process.env.REPLIT_DEV_DOMAIN,
                  port: 443,
                  protocol: 'wss',
              }
            : undefined,
    },

    tools: {
        postcss: (config, { addPlugins }) => {
            addPlugins([tailwindcss, autoprefixer]);
        },
        rspack: {
            plugins: [],
            resolve: {},
            module: {
                rules: [
                    {
                        test: /\.xml$/,
                        exclude: /node_modules/,
                        use: 'raw-loader',
                    },
                ],
            },
        },
    },
});
