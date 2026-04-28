import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@spartan-ng/helm/button': resolve(__dirname, './src/libs/ui/button/src/index.ts'),
      '@spartan-ng/helm/utils': resolve(__dirname, './src/libs/ui/utils/src/index.ts'),
      '@spartan-ng/helm/input': resolve(__dirname, './src/libs/ui/input/src/index.ts'),
      '@spartan-ng/helm/label': resolve(__dirname, './src/libs/ui/label/src/index.ts'),
      '@spartan-ng/helm/badge': resolve(__dirname, './src/libs/ui/badge/src/index.ts'),
      '@spartan-ng/helm/alert': resolve(__dirname, './src/libs/ui/alert/src/index.ts'),
      '@spartan-ng/helm/icon': resolve(__dirname, './src/libs/ui/icon/src/index.ts'),
      '@spartan-ng/helm/tabs': resolve(__dirname, './src/libs/ui/tabs/src/index.ts'),
      '@spartan-ng/helm/select': resolve(__dirname, './src/libs/ui/select/src/index.ts'),
      '@spartan-ng/helm/checkbox': resolve(__dirname, './src/libs/ui/checkbox/src/index.ts'),
      '@spartan-ng/helm/separator': resolve(__dirname, './src/libs/ui/separator/src/index.ts'),
      '@spartan-ng/helm/hover-card': resolve(__dirname, './src/libs/ui/hover-card/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
