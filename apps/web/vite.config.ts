import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => {
  // A locally labelled build must still use React's optimized production runtime.
  if (command === 'build') process.env.NODE_ENV = 'production';
  return {
    envDir: '../..',
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 650 },
  };
});
