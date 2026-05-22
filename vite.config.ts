import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devvit } from '@devvit/start/vite';

export default defineConfig({
  plugins: [
    react(),
    // Devvit plugin must be last
    devvit(),
  ],
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include: [
        'src/server/**/*.ts',
        'src/shared/**/*.ts',
        'src/client/**/*.{ts,tsx}'
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/client/main.tsx'
      ],
    },
  },
});
