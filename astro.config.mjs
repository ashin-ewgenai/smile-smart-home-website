import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://smilesmarthomes.com',
  integrations: [
    tailwind({
      applyBaseStyles: false
    }),
    react()
  ],
  output: 'static',
  build: {
    inlineStylesheets: 'auto'
  },
  vite: {
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