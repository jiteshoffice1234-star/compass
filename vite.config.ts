import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  // Relative base so the built app also works when the OTA bundle is loaded
  // from the filesystem (file://...) on Android, not just via the Capacitor
  // local server. Absolute URLs (/assets/...) would 404 under file://.
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@screens': '/src/screens',
      '@lib': '/src/lib',
      '@data': '/src/data',
      '@store': '/src/store',
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
})
