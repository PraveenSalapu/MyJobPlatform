import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-manifest',
      writeBundle() {
        import('./scripts/copy-manifest.js').catch(err => {
          console.error('Failed to run copy-manifest script:', err);
        });
      }
    }
  ],
  define: {
    // Inject environment URLs at build time for extension scripts
    __API_BASE__: JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3001'),
    __APP_URL__: JSON.stringify(process.env.VITE_APP_URL || 'http://localhost:5173'),
  },
  resolve: {
    alias: {
      '@resumind/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        content: resolve(__dirname, 'src/content/index.ts'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background/service-worker.js';
          }
          if (chunkInfo.name === 'content') {
            return 'content/index.js';
          }
          return '[name]/[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  esbuild: {
    // Strip console.logs and debugger statements in production
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
}));
