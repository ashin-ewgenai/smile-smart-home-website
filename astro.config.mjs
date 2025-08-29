import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import node from '@astrojs/node';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  site: 'https://smilesmarthomes.com',
  integrations: [
    tailwind({
      applyBaseStyles: false
    }),
    react()
  ],
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  build: {
    inlineStylesheets: 'always'
  },
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          // keep path as-is so /api/* reaches the backend route
        }
      }
    }
  }
});