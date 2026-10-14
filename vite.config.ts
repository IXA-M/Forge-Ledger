import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const isGitHubActions = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.GITHUB_ACTIONS === 'true';

export default defineConfig({
  base: isGitHubActions ? '/Forge-Ledger/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
});
