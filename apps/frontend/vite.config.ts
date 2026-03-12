import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  envDir: '../../',
  resolve: {
    alias: {
      '@resumind/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/n8n-proxy': {
        target: 'http://localhost:5678',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/n8n-proxy/, ''),
      },
    },
  },
  optimizeDeps: {
    include: ['@react-pdf/renderer'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  esbuild: {
    // Strip console.logs and debugger statements in production
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
}))
