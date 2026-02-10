import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/widget/index.tsx'),
      name: 'NamaaWidget',
      fileName: () => 'widget.js',
      formats: ['iife'],
    },
    outDir: 'dist-widget',
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      // Bundle everything — no external deps
      // The widget doesn't actually use React, so nothing to externalize
    },
  },
})
