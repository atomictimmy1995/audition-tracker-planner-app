import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only pure modules are unit-tested here (scheduler, AI contracts).
    // React Native screens are exercised via the Expo toolchain.
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
