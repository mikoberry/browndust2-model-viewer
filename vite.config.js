import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { modelLibraryPlugin } from './scripts/model-library-plugin.mjs'

// base './' keeps a built dist/ openable from any path (including file://),
// which is handy when the viewer is used as a local model inspector.
export default defineConfig({
  plugins: [modelLibraryPlugin(), react()],
  base: './',
  server: {
    host: '127.0.0.1',
  },
  build: {
    target: 'es2020',
    // Atlas pages are large PNGs; keep them as files rather than inlining.
    assetsInlineLimit: 0,
  },
})
