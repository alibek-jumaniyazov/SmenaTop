import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command }) => {
  // A locally labelled build must still use React's optimized production runtime.
  if (command === 'build') process.env.NODE_ENV = 'production';
  return {
    envDir: '../..',
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      host: '127.0.0.1',
      fs: {
        strict: true,
        allow: [
          fileURLToPath(new URL('.', import.meta.url)),
          fileURLToPath(new URL('../../node_modules', import.meta.url)),
        ],
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem,key}',
          '**/.git/**',
          '**/docs/**',
          '**/prisma/**',
          '**/apps/api/**',
          '**/apps/jobs/**',
          '**/.local/**',
        ],
      },
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 650 },
  };
});
