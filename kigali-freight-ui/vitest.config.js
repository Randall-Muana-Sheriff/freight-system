import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate from vite.config.js (rather than merged in) so a plain
// `vite build`/`vite dev` never even parses vitest-only options.
export default mergeConfig(
  defineConfig({ plugins: [react()] }),
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      globals: true,
      css: false,
    },
  })
);
