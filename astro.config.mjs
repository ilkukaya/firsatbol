// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Load .env for local development into process.env (real env vars always win).
try {
  process.loadEnvFile?.('.env');
} catch {
  /* no .env file — fine */
}

/**
 * Canonical origin. SITE_URL wins; on Netlify `URL` is the primary domain of the site
 * (the custom domain once connected, otherwise the *.netlify.app address), so canonical
 * links never point at a domain that does not resolve yet.
 */
const site = (process.env.SITE_URL || process.env.URL || 'https://firsatbol.com').replace(/\/+$/, '');

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
