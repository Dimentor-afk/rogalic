import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Відносний base: білд працює і на GitHub Pages (/repo/), і на itch.io (iframe).
  base: './',
  build: {
    target: 'es2022',
    // Phaser великий (~1.2 МБ) — це нормально, просто не спамимо ворнінгом.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
