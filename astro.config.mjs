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
    inlineStylesheets: 'always'
  }
});