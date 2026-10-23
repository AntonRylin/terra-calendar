/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the big third-party libraries out of the app chunk. React is on
        // every launch so it only gains cache stability across releases, but
        // ical.js and Supabase are reached through dynamic imports (CalDAV
        // connect / cloud mode) — splitting them means a local-only user never
        // downloads or parses either.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          ical: ['ical.js'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
