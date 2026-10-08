import { defineConfig } from 'vitest/config';
import path from 'path';
import { readAppReleaseInfo } from './scripts/appReleaseInfo';

export default defineConfig({
  define: { __APP_RELEASE_INFO__: JSON.stringify(readAppReleaseInfo(__dirname)) },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
