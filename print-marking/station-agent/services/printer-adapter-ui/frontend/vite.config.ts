import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Keep the image build portable across amd64/arm64 Alpine builders. Vite 8
// defaults CSS minification to lightningcss, whose optional native binary can
// be omitted by npm in cross-platform builds. esbuild is already part of Vite
// and produces deterministic CSS without that optional dependency.
export default defineConfig({
  plugins: [react()],
  build: { cssMinify: 'esbuild' }
})
