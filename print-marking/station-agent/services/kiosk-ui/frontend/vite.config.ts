import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5222,
    proxy: {
      '/api': {
        target: 'http://localhost:5007',
        changeOrigin: true,
      },
      '/hubs': {
        target: 'ws://localhost:5007',
        ws: true,
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../src/ND.KioskUi.Api/wwwroot',
    emptyOutDir: true,
  }
})
