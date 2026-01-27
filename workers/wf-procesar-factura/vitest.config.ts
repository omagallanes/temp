import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node'
  },
  resolve: {
    alias: {
      'cloudflare:workers': path.resolve(__dirname, 'test/mocks/cloudflare-workers.ts')
    }
  }
});
