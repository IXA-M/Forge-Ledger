import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries((['west', 'east', 'europe'] as const).map((server) => [`/__aodp/${server}`, {
      target: `https://${server}.albion-online-data.com`,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(`/__aodp/${server}`, ''),
    }])),
  },
  test: {
    environment: 'jsdom',
  },
});
