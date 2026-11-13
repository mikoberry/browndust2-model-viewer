import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { wallkitWE } from 'wallkit/we/vite'
import { modelLibraryPlugin } from './scripts/model-library-plugin.mjs'

// base './' keeps a built dist/ openable from any path (including file://),
// which is handy when the viewer is used as a local model inspector.
export default defineConfig({
  // wallkitWE() injects the Wallpaper Engine listener bridges as classic
  // scripts at the top of <head>, ahead of the module entry. Registering them
  // from React would miss the first audio frames (see wallkit's
  // docs/we-integration.md). Outside WE the bridges are inert.
  plugins: [modelLibraryPlugin(), react(), wallkitWE()],
  base: './',
  // wallkit ships raw JSX + CSS (git dependency, no build step), so it has to
  // go through Vite's own transform pipeline instead of esbuild pre-bundling.
  optimizeDeps: {
    exclude: ['wallkit'],
  },
  server: {
    host: '127.0.0.1',
  },
  build: {
    target: 'es2020',
    // Atlas pages are large PNGs; keep them as files rather than inlining.
    assetsInlineLimit: 0,
  },
})
